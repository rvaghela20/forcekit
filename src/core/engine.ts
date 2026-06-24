/**
 * ForceKit Agent Engine
 *
 * Manages the full agent lifecycle: initialization, context loading,
 * execution, validation, and reporting. Coordinates tools, plugins,
 * and state throughout the agent's work.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EventBus } from './events.js';
import { ForceKitState } from './state.js';
import { ContextBuilder, type TaskType } from './context.js';
import { ToolRegistry, PluginRegistry } from './registry.js';
import type { AgentDefinition } from '../agents/schema.js';
import { loadAgentDefinition } from '../agents/loader.js';
import { ForceKitConfig, loadConfigSync } from '../config/defaults.js';
import { createScannerTool } from '../tools/scanner.js';
import { createLinterTool } from '../tools/linter.js';
import { createVerifierTool } from '../tools/verifier.js';
import { createDeployerTool } from '../tools/deployer.js';
import { createTesterTool } from '../tools/tester.js';
import { createSessionTool } from '../tools/session.js';
import { createSearchTool } from '../tools/search.js';

// ─── Types ──────────────────────────────────────────────────────

export interface EngineOptions {
  projectRoot: string;
  docsRoot: string;
  configOverrides?: Partial<ForceKitConfig>;
}

export interface AgentRunOptions {
  /** Agent name (must match a definition YAML) or an AgentDefinition object */
  agent: string | AgentDefinition;
  /** High-level goal for this agent run */
  goal: string;
  /** Task type for context assembly */
  taskType?: TaskType;
  /** Scope filter for context (e.g., specific objects or classes) */
  scope?: string[];
}

export interface AgentRunResult {
  success: boolean;
  agentName: string;
  goal: string;
  context: string;
  qualityGateResults: QualityGateResult[];
  errors: string[];
  durationMs: number;
}

export interface QualityGateResult {
  name: string;
  passed: boolean;
  message: string;
}

// ─── Engine ─────────────────────────────────────────────────────

export class AgentEngine {
  readonly events: EventBus;
  readonly state: ForceKitState;
  readonly tools: ToolRegistry;
  readonly plugins: PluginRegistry;
  readonly context: ContextBuilder;
  readonly config: ForceKitConfig;

  readonly projectRoot: string;
  readonly docsRoot: string;

  constructor(options: EngineOptions) {
    this.projectRoot = options.projectRoot;
    this.docsRoot = options.docsRoot;

    // Load configuration
    this.config = loadConfigSync(options.projectRoot, options.configOverrides);

    // Initialize core systems
    this.events = new EventBus();
    this.state = new ForceKitState(options.projectRoot, this.events);
    this.tools = new ToolRegistry(this.events);
    this.plugins = new PluginRegistry(this.tools, this.events);
    this.context = new ContextBuilder(options.docsRoot, this.state);

    // Register default tools
    this.tools.register(createScannerTool());
    this.tools.register(createLinterTool(this.config));
    this.tools.register(createVerifierTool(this.config));
    this.tools.register(createDeployerTool(this.config));
    this.tools.register(createTesterTool(this.config));
    this.tools.register(createSessionTool(this.config));
    this.tools.register(createSearchTool(this.config));
  }

  /**
   * Prepare an agent run: load definition, assemble context, validate constraints.
   * Returns everything needed for the agent to begin work.
   */
  async prepareRun(options: AgentRunOptions): Promise<{
    definition: AgentDefinition;
    context: string;
    tools: string[];
    constraints: AgentDefinition['constraints'];
  }> {
    // 1. Resolve agent definition
    const definition = typeof options.agent === 'string'
      ? loadAgentDefinition(options.agent, this.docsRoot)
      : options.agent;

    // 2. Validate required tools are available
    const missingTools: string[] = [];
    for (const toolName of definition.tools) {
      if (!this.tools.has(toolName)) {
        missingTools.push(toolName);
      }
    }
    if (missingTools.length > 0) {
      throw new Error(
        `Agent '${definition.name}' requires tools that are not registered: ${missingTools.join(', ')}`
      );
    }

    // 3. Build context
    const taskType = options.taskType ?? this.inferTaskType(definition);
    const builtContext = this.context.build({
      taskType,
      scope: options.scope,
      maxLength: this.config.maxContextLength,
      condensed: true,
    });

    // 4. Start session
    this.state.startSession(definition.name, options.goal);

    // 5. Notify plugins
    await this.plugins.runHook('onAgentStart', {
      agentName: definition.name,
      goal: options.goal,
    });

    // 6. Emit event
    await this.events.emit('agent:start', {
      agentName: definition.name,
      goal: options.goal,
      timestamp: new Date(),
    });

    return {
      definition,
      context: builtContext.compiledPrompt,
      tools: definition.tools,
      constraints: definition.constraints,
    };
  }

  /**
   * Complete an agent run: validate quality gates, update state, notify plugins.
   */
  async completeRun(
    agentName: string,
    result: { success: boolean; summary: string; filesChanged: string[]; errors: string[] }
  ): Promise<AgentRunResult> {
    const startTime = Date.now();

    // 1. Run quality gates
    const qualityGateResults: QualityGateResult[] = [];
    const pluginGates = this.plugins.collectQualityGates();

    for (const gate of pluginGates) {
      try {
        const gateResult = await gate.check();
        qualityGateResults.push({
          name: gate.name,
          passed: gateResult.passed,
          message: gateResult.message,
        });
      } catch (error) {
        qualityGateResults.push({
          name: gate.name,
          passed: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 2. Notify plugins
    await this.plugins.runHook('onAgentComplete', {
      agentName,
      filesChanged: result.filesChanged,
    });

    // 3. End session
    this.state.endSession(result.summary, result.filesChanged);

    // 4. Emit event
    await this.events.emit('agent:complete', {
      agentName,
      result: {
        success: result.success,
        summary: result.summary,
        filesChanged: result.filesChanged,
        errors: result.errors,
      },
      timestamp: new Date(),
    });

    const durationMs = Date.now() - startTime;

    return {
      success: result.success && qualityGateResults.every((g) => g.passed),
      agentName,
      goal: result.summary,
      context: '',
      qualityGateResults,
      errors: result.errors,
      durationMs,
    };
  }

  /**
   * Report an agent error.
   */
  async reportError(agentName: string, error: Error): Promise<void> {
    this.state.addBlocker(
      `Agent '${agentName}' failed: ${error.message}`,
      'Agent execution halted',
      'High'
    );

    await this.events.emit('agent:error', {
      agentName,
      error,
      timestamp: new Date(),
    });
  }

  /**
   * Render the current state to markdown files for backward compatibility.
   */
  renderMarkdown(outputDir: string): { currentState: string; inventory: string } {
    const currentState = this.state.renderCurrentStateMarkdown();
    const inventory = this.state.renderInventoryMarkdown();

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(join(outputDir, 'current-state.md'), currentState, 'utf-8');
    writeFileSync(join(outputDir, 'inventory.md'), inventory, 'utf-8');

    return { currentState, inventory };
  }

  // ─── Private ────────────────────────────────────────────────

  /**
   * Infer the best task type from an agent definition's capabilities.
   */
  private inferTaskType(definition: AgentDefinition): TaskType {
    const caps = definition.capabilities;
    if (caps.includes('agentforce_development')) return 'agentforce';
    if (caps.includes('lwc_development')) return 'lwc';
    if (caps.includes('flow_development')) return 'flow';
    if (caps.includes('test_execution')) return 'testing';
    if (caps.includes('security_review')) return 'security';
    if (caps.includes('deployment')) return 'deployment';
    if (caps.includes('code_generation')) return 'apex';
    return 'general';
  }
}
