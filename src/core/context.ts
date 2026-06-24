/**
 * ForceKit Context Builder
 *
 * Assembles minimal, task-relevant context from the documentation layer
 * instead of forcing agents to read all 15+ files sequentially.
 * Produces an optimized prompt string with only the sections that matter.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ForceKitState } from './state.js';

// ─── Types ──────────────────────────────────────────────────────

export type TaskType = 'apex' | 'lwc' | 'flow' | 'agentforce' | 'testing' | 'security' | 'deployment' | 'general';

export interface ContextSection {
  title: string;
  content: string;
  priority: number; // lower = more important, loaded first
}

export interface ContextBuildOptions {
  /** The type of task being performed */
  taskType: TaskType;
  /** Specific files/objects in scope (filters inventory) */
  scope?: string[];
  /** Maximum context length in characters (for token budget management) */
  maxLength?: number;
  /** Number of recent session entries to include */
  recentSessionCount?: number;
  /** Whether to include full conventions or just the relevant subset */
  condensed?: boolean;
}

export interface BuiltContext {
  sections: ContextSection[];
  totalLength: number;
  taskType: TaskType;
  compiledPrompt: string;
}

// ─── Task-to-Document Mapping ───────────────────────────────────

interface DocMapping {
  required: string[];
  optional: string[];
  promptFiles: string[];
}

const TASK_DOC_MAP: Record<TaskType, DocMapping> = {
  apex: {
    required: ['rules.md', 'conventions.md'],
    optional: ['source-of-truth.md', 'architecture.md'],
    promptFiles: ['prompts/apex.md', 'prompts/smart-design.md'],
  },
  lwc: {
    required: ['rules.md', 'conventions.md'],
    optional: ['source-of-truth.md', 'architecture.md'],
    promptFiles: ['prompts/lwc.md', 'prompts/smart-design.md'],
  },
  flow: {
    required: ['rules.md', 'conventions.md'],
    optional: ['architecture.md'],
    promptFiles: ['prompts/flows.md'],
  },
  agentforce: {
    required: ['rules.md', 'agentforce.md'],
    optional: ['conventions.md', 'governance.md'],
    promptFiles: ['prompts/agentforce.md'],
  },
  testing: {
    required: ['rules.md', 'conventions.md'],
    optional: ['source-of-truth.md'],
    promptFiles: ['prompts/testing.md', 'prompts/security.md'],
  },
  security: {
    required: ['rules.md', 'governance.md', 'conventions.md'],
    optional: ['source-of-truth.md'],
    promptFiles: ['prompts/security.md'],
  },
  deployment: {
    required: ['rules.md', 'deployment.md', 'quality-gates.md'],
    optional: ['governance.md'],
    promptFiles: [],
  },
  general: {
    required: ['rules.md'],
    optional: ['conventions.md', 'architecture.md', 'source-of-truth.md'],
    promptFiles: ['prompts/smart-design.md'],
  },
};

// ─── Context Builder ────────────────────────────────────────────

export class ContextBuilder {
  private docsRoot: string;
  private state: ForceKitState;

  constructor(docsRoot: string, state: ForceKitState) {
    this.docsRoot = docsRoot;
    this.state = state;
  }

  /**
   * Build an optimized context tailored to a specific task type.
   */
  build(options: ContextBuildOptions): BuiltContext {
    const {
      taskType,
      scope,
      maxLength = 100_000,
      recentSessionCount = 3,
      condensed = true,
    } = options;

    const mapping = TASK_DOC_MAP[taskType];
    const sections: ContextSection[] = [];
    let currentLength = 0;

    // 1. Core rules (always included, possibly condensed)
    const rulesContent = this.loadDoc('rules.md');
    if (rulesContent) {
      const processed = condensed ? this.condenseRules(rulesContent) : rulesContent;
      sections.push({
        title: 'Core Rules',
        content: processed,
        priority: 0,
      });
      currentLength += processed.length;
    }

    // 2. Required documents for this task type
    for (const doc of mapping.required) {
      if (doc === 'rules.md') continue; // Already loaded
      const content = this.loadDoc(doc);
      if (content && currentLength + content.length < maxLength) {
        const processed = condensed ? this.extractRelevantSections(content, taskType) : content;
        sections.push({
          title: this.docToTitle(doc),
          content: processed,
          priority: 1,
        });
        currentLength += processed.length;
      }
    }

    // 3. Prompt files (task-specific generation rules)
    for (const promptFile of mapping.promptFiles) {
      const content = this.loadDoc(promptFile);
      if (content && currentLength + content.length < maxLength) {
        sections.push({
          title: this.docToTitle(promptFile),
          content,
          priority: 2,
        });
        currentLength += content.length;
      }
    }

    // 4. Inventory (filtered by scope if provided)
    const inventorySection = this.buildInventorySection(scope);
    if (inventorySection && currentLength + inventorySection.length < maxLength) {
      sections.push({
        title: 'Relevant Inventory',
        content: inventorySection,
        priority: 3,
      });
      currentLength += inventorySection.length;
    }

    // 5. Recent session history
    const historySection = this.buildSessionHistory(recentSessionCount);
    if (historySection && currentLength + historySection.length < maxLength) {
      sections.push({
        title: 'Recent History',
        content: historySection,
        priority: 4,
      });
      currentLength += historySection.length;
    }

    // 6. Optional documents (only if budget allows)
    for (const doc of mapping.optional) {
      if (mapping.required.includes(doc)) continue;
      const content = this.loadDoc(doc);
      if (content && currentLength + content.length < maxLength) {
        const processed = condensed ? this.extractRelevantSections(content, taskType) : content;
        sections.push({
          title: this.docToTitle(doc),
          content: processed,
          priority: 5,
        });
        currentLength += processed.length;
      }
    }

    // 7. Active blockers and known issues
    const blockersSection = this.buildBlockersSection();
    if (blockersSection && currentLength + blockersSection.length < maxLength) {
      sections.push({
        title: 'Active Blockers',
        content: blockersSection,
        priority: 3,
      });
      currentLength += blockersSection.length;
    }

    // Sort by priority and compile
    sections.sort((a, b) => a.priority - b.priority);

    const compiledPrompt = sections
      .map((s) => `## ${s.title}\n\n${s.content}`)
      .join('\n\n---\n\n');

    return {
      sections,
      totalLength: compiledPrompt.length,
      taskType,
      compiledPrompt,
    };
  }

  // ─── Document Loading ───────────────────────────────────────

  private loadDoc(relativePath: string): string | null {
    const fullPath = join(this.docsRoot, relativePath);
    if (!existsSync(fullPath)) return null;
    try {
      return readFileSync(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  // ─── Content Processing ─────────────────────────────────────

  /**
   * Extract only the top-priority sections from rules.md
   * (anti-hallucination, code gen rules, pre-deploy check)
   */
  private condenseRules(content: string): string {
    const sections = content.split(/^## /m);
    const keepPatterns = [
      /anti-hallucination/i,
      /code generation/i,
      /pre-deploy/i,
      /auto-update/i,
      /read order/i,
    ];

    const kept = sections.filter((section) =>
      keepPatterns.some((p) => p.test(section))
    );

    return kept.map((s) => `## ${s}`).join('\n');
  }

  /**
   * Extract sections from a document relevant to the task type.
   * For conventions.md, only load Apex or LWC standards based on task.
   */
  private extractRelevantSections(content: string, taskType: TaskType): string {
    const sections = content.split(/^## /m);

    const relevanceMap: Record<TaskType, RegExp[]> = {
      apex: [/apex/i, /naming/i, /error handling/i, /security/i, /architecture/i, /testing/i],
      lwc: [/lwc/i, /naming/i, /graphql/i],
      flow: [/flow/i],
      agentforce: [/agentforce/i, /agent/i, /apex/i],
      testing: [/testing/i, /apex/i],
      security: [/security/i, /sharing/i, /apex/i],
      deployment: [/deploy/i, /ci/i],
      general: [/.*/],
    };

    const patterns = relevanceMap[taskType] || [/.*/];
    const kept = sections.filter((section) =>
      patterns.some((p) => p.test(section.split('\n')[0] || ''))
    );

    return kept.map((s) => `## ${s}`).join('\n');
  }

  // ─── State-Based Sections ───────────────────────────────────

  private buildInventorySection(scope?: string[]): string | null {
    const snapshot = this.state.getSnapshot();
    const inv = snapshot.inventory;

    const allItems = [
      ...inv.objects,
      ...inv.classes,
      ...inv.lwcComponents,
      ...inv.flows,
      ...inv.triggers,
    ];

    if (allItems.length === 0) return null;

    const filtered = scope
      ? allItems.filter((i) => scope.some((s) => i.name.toLowerCase().includes(s.toLowerCase())))
      : allItems;

    if (filtered.length === 0) return null;

    let md = '| Name | Type | Layer |\n|------|------|-------|\n';
    for (const item of filtered) {
      md += `| ${item.name} | ${item.type} | ${item.layer ?? '-'} |\n`;
    }

    return md;
  }

  private buildSessionHistory(count: number): string | null {
    const sessions = this.state.getRecentSessions(count);
    if (sessions.length === 0) return null;

    let md = '';
    for (const s of sessions) {
      md += `### ${s.date} | ${s.agent} | ${s.goal}\n`;
      if (s.summary) md += `- ${s.summary}\n`;
      if (s.filesChanged.length > 0) md += `- Files: ${s.filesChanged.join(', ')}\n`;
      md += '\n';
    }

    return md;
  }

  private buildBlockersSection(): string | null {
    const blockers = this.state.getActiveBlockers();
    if (blockers.length === 0) return null;

    let md = '| Blocker | Impact | Severity |\n|---------|--------|----------|\n';
    for (const b of blockers) {
      md += `| ${b.description} | ${b.impact} | ${b.severity} |\n`;
    }
    return md;
  }

  // ─── Utilities ──────────────────────────────────────────────

  private docToTitle(docPath: string): string {
    return docPath
      .replace('prompts/', '')
      .replace('.md', '')
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}
