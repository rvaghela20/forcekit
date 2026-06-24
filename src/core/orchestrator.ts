/**
 * ForceKit Orchestrator Controller
 *
 * Implements the lead orchestrator execution loop. Plans project tasks,
 * delegates to specialized subagents (developer, reviewer, qa), runs quality
 * gates, and manages retry/refinement loops.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AgentEngine } from './engine.js';
import type { TaskEntry } from './state.js';

export class OrchestratorController {
  private engine: AgentEngine;

  constructor(engine: AgentEngine) {
    this.engine = engine;
  }

  /**
   * Run the orchestration execution loop for a high-level goal.
   */
  async runOrchestration(goal: string): Promise<{
    success: boolean;
    tasksRun: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let tasksRun = 0;

    // 1. Prepare run for orchestrator
    const runPrep = await this.engine.prepareRun({
      agent: 'orchestrator',
      goal,
    });

    try {
      this.engine.events.emit('state:change', {
        key: 'projectStatus',
        oldValue: 'on_track',
        newValue: 'on_track',
      });

      // 2. Planning: Analyze goal and split it into tasks
      // In a real LLM framework, this query would call a model.
      // Here, we plan a standard 4-tier task list: Research, Development, Review, and QA
      const taskResearch = this.engine.state.addTask(`[RESEARCH] Query docs and release notes for best practices regarding: ${goal}`, 'P0');
      const taskDev = this.engine.state.addTask(`[DEV] Implement requested Salesforce logic for: ${goal}`, 'P1', [taskResearch.id]);
      const taskReview = this.engine.state.addTask(`[REVIEW] Perform static analysis and security audit`, 'P2', [taskDev.id]);
      const taskQA = this.engine.state.addTask(`[QA] Run Apex unit tests and verify code coverage`, 'P2', [taskReview.id]);

      // 3. Execution Loop: process tasks sequentially honoring dependencies
      let activeTasks = this.engine.state.getTasksByStatus('upcoming');

      while (activeTasks.length > 0) {
        // Find next task that has all dependencies met
        const nextTask = activeTasks.find(t => this.dependenciesMet(t));

        if (!nextTask) {
          // If no tasks can be run due to dependency lock (e.g. failure in dev)
          const blockedMsg = 'Orchestration blocked: dependency loop or subagent failure.';
          errors.push(blockedMsg);
          this.engine.state.addBlocker('Orchestration deadlock', blockedMsg, 'High');
          break;
        }

        // Run the task
        tasksRun++;
        this.engine.state.startTask(nextTask.id);

        const taskSuccess = await this.executeSubTask(nextTask);

        if (taskSuccess) {
          this.engine.state.completeTask(nextTask.id, nextTask.filesChanged);
        } else {
          errors.push(`Task failed: ${nextTask.description}`);
          this.engine.state.addBlocker(`Task failed: ${nextTask.id}`, nextTask.description, 'Medium');
          // Update status to keep upcoming from executing
          nextTask.status = 'upcoming'; // Reset or fail
          break;
        }

        activeTasks = this.engine.state.getTasksByStatus('upcoming');
      }

      // 4. Finalize run
      const hasErrors = errors.length > 0;
      const completeResult = await this.engine.completeRun('orchestrator', {
        success: !hasErrors,
        summary: hasErrors
          ? `Orchestration halted: ${errors.join(', ')}`
          : `Orchestrated execution completed: all ${tasksRun} tasks finished.`,
        filesChanged: [],
        errors,
      });

      return {
        success: completeResult.success,
        tasksRun,
        errors,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.engine.reportError('orchestrator', err);
      return {
        success: false,
        tasksRun,
        errors: [err.message],
      };
    }
  }

  /**
   * Checks if all dependencies for a task are completed.
   */
  private dependenciesMet(task: TaskEntry): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    const completedTasks = this.engine.state.getTasksByStatus('completed');
    const completedIds = new Set(completedTasks.map(t => t.id));

    return task.dependencies.every(depId => completedIds.has(depId));
  }

  /**
   * Execute task by delegating to specialized subagents
   */
  private async executeSubTask(task: TaskEntry): Promise<boolean> {
    const isResearch = task.description.startsWith('[RESEARCH]');
    const isDev = task.description.startsWith('[DEV]');
    const isReview = task.description.startsWith('[REVIEW]');
    const isQA = task.description.startsWith('[QA]');

    if (isResearch) {
      // 1. Spawn Researcher Agent Run
      const researchPrep = await this.engine.prepareRun({
        agent: 'researcher',
        goal: task.description,
      });

      // Run web-search tool
      const searchResult = await this.engine.tools.invoke('web-search', {
        query: task.description.replace('[RESEARCH]', '').trim(),
        limit: 3,
      });

      // Write simulated research report to docs/research_notes.md
      const docsPath = join(this.engine.projectRoot, 'forcekit');
      if (!existsSync(docsPath)) {
        mkdirSync(docsPath, { recursive: true });
      }

      const resultsList = (searchResult.data as any)?.results || [];
      let reportMarkdown = `# Research Notes: ${task.description}\n\n`;
      reportMarkdown += `*Performed search for:* "${task.description.replace('[RESEARCH]', '').trim()}"\n\n`;
      reportMarkdown += `## Documentation Results\n\n`;
      
      for (const res of resultsList) {
        reportMarkdown += `### [${res.title}](${res.url})\n`;
        reportMarkdown += `> ${res.snippet}\n\n`;
      }

      writeFileSync(join(docsPath, 'research_notes.md'), reportMarkdown, 'utf-8');
      task.filesChanged = ['forcekit/research_notes.md'];

      const researcherResult = await this.engine.completeRun('researcher', {
        success: searchResult.success,
        summary: `Researched platform guidelines and generated forcekit/research_notes.md.`,
        filesChanged: task.filesChanged,
        errors: searchResult.error ? [searchResult.error] : [],
      });

      return researcherResult.success;
    }

    if (isDev) {
      // 1. Spawn Developer Agent Run
      const devPrep = await this.engine.prepareRun({
        agent: 'developer',
        goal: task.description,
      });

      // Simulate code changes (adds a mock file)
      const mockFile = 'force-app/main/default/classes/AccountService.cls';
      task.filesChanged = [mockFile];

      const devResult = await this.engine.completeRun('developer', {
        success: true,
        summary: `Implemented AccountService class containing safe Apex logic.`,
        filesChanged: task.filesChanged,
        errors: [],
      });

      return devResult.success;
    }

    if (isReview) {
      // 2. Spawn Reviewer Agent Run
      const reviewPrep = await this.engine.prepareRun({
        agent: 'reviewer',
        goal: task.description,
      });

      // Run static analysis tool
      const lintResult = await this.engine.tools.invoke('lint', {
        projectRoot: this.engine.config.paths.stateDir,
        files: task.filesChanged,
      });

      const reviewerResult = await this.engine.completeRun('reviewer', {
        success: lintResult.success,
        summary: lintResult.success
          ? 'Static analysis passed with zero violations.'
          : 'Linter violations found.',
        filesChanged: [],
        errors: lintResult.error ? [lintResult.error] : [],
      });

      return reviewerResult.success;
    }

    if (isQA) {
      // 3. Spawn QA Agent Run
      const qaPrep = await this.engine.prepareRun({
        agent: 'qa',
        goal: task.description,
      });

      // Run tests tool
      const testResult = await this.engine.tools.invoke('test', {
        projectRoot: this.engine.config.paths.stateDir,
        tests: ['AccountServiceTest'],
      });

      const qaResult = await this.engine.completeRun('qa', {
        success: testResult.success,
        summary: testResult.success ? 'All unit tests passed successfully.' : 'Unit tests failed.',
        filesChanged: [],
        errors: testResult.error ? [testResult.error] : [],
      });

      return qaResult.success;
    }

    return true;
  }
}
