/**
 * ForceKit Plugin API
 *
 * Base class and utilities for building ForceKit plugins.
 * Plugins extend this class and override lifecycle hooks.
 */

import type { Plugin, PluginHooks, Tool, LintRule, QualityGate } from '../core/registry.js';

/**
 * Base class for ForceKit plugins.
 *
 * Usage:
 *   class MyPlugin extends ForceKitPlugin {
 *     constructor() {
 *       super('my-plugin', '1.0.0', 'Does something useful');
 *     }
 *
 *     async onAgentStart(context) {
 *       console.log(`Agent ${context.agentName} started`);
 *     }
 *   }
 */
export abstract class ForceKitPlugin implements Plugin {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly hooks: PluginHooks;
  readonly tools: Tool[];
  readonly lintRules: LintRule[];
  readonly qualityGates: QualityGate[];

  constructor(name: string, version: string, description: string) {
    this.name = name;
    this.version = version;
    this.description = description;
    this.tools = [];
    this.lintRules = [];
    this.qualityGates = [];

    // Wire up class methods as hooks
    this.hooks = {
      onAgentStart: this.onAgentStart?.bind(this),
      onAgentComplete: this.onAgentComplete?.bind(this),
      onFileModify: this.onFileModify?.bind(this),
      onPreCommit: this.onPreCommit?.bind(this),
      onLintComplete: this.onLintComplete?.bind(this),
    };
  }

  // ─── Override these in your plugin ──────────────────────────

  /** Called when an agent starts working */
  async onAgentStart?(context: { agentName: string; goal: string }): Promise<void>;

  /** Called when an agent completes its work */
  async onAgentComplete?(context: { agentName: string; filesChanged: string[] }): Promise<void>;

  /** Called when a file is modified */
  async onFileModify?(filePath: string): Promise<void>;

  /** Called before changes are committed. Return { approved: false } to block. */
  async onPreCommit?(changes: string[]): Promise<{ approved: boolean; reason?: string }>;

  /** Called when linting completes */
  async onLintComplete?(results: { errorCount: number; warningCount: number }): Promise<void>;

  // ─── Registration helpers ───────────────────────────────────

  /** Register an additional tool provided by this plugin */
  protected registerTool(tool: Tool): void {
    this.tools.push(tool);
  }

  /** Register an additional lint rule */
  protected registerLintRule(rule: LintRule): void {
    this.lintRules.push(rule);
  }

  /** Register an additional quality gate */
  protected registerQualityGate(gate: QualityGate): void {
    this.qualityGates.push(gate);
  }
}
