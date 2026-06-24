/**
 * ForceKit Registry
 *
 * Central registry for tools and plugins. Provides discovery, validation,
 * and invocation of registered components throughout the framework.
 */

import { EventBus } from './events.js';

// ─── Tool Types ─────────────────────────────────────────────────

export interface ToolInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'string[]';
  required: boolean;
  description: string;
  default?: unknown;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs: number;
}

export interface Tool {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Input parameter schema */
  inputs: ToolInput[];
  /** Execute the tool with validated arguments */
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

// ─── Plugin Types ───────────────────────────────────────────────

export interface PluginHooks {
  onAgentStart?: (context: { agentName: string; goal: string }) => Promise<void> | void;
  onAgentComplete?: (context: { agentName: string; filesChanged: string[] }) => Promise<void> | void;
  onFileModify?: (filePath: string) => Promise<void> | void;
  onPreCommit?: (changes: string[]) => Promise<{ approved: boolean; reason?: string }>;
  onLintComplete?: (results: { errorCount: number; warningCount: number }) => Promise<void> | void;
}

export interface Plugin {
  /** Unique plugin name */
  name: string;
  /** Semver version */
  version: string;
  /** Human-readable description */
  description: string;
  /** Lifecycle hooks */
  hooks: PluginHooks;
  /** Additional tools this plugin provides */
  tools?: Tool[];
  /** Additional lint rules this plugin provides */
  lintRules?: LintRule[];
  /** Additional quality gates this plugin provides */
  qualityGates?: QualityGate[];
}

export interface LintRule {
  id: string;
  description: string;
  severity: 'error' | 'warning';
  filePattern: RegExp;
  check: (content: string, filePath: string) => LintViolation[];
}

export interface LintViolation {
  ruleId: string;
  message: string;
  line: number;
  severity: 'error' | 'warning';
}

export interface QualityGate {
  name: string;
  description: string;
  check: () => Promise<{ passed: boolean; message: string }>;
}

// ─── Tool Registry ──────────────────────────────────────────────

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private events?: EventBus;

  constructor(events?: EventBus) {
    this.events = events;
  }

  /** Register a tool */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Unregister a tool */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /** Get a tool by name */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** List all registered tools */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /** Check if a tool exists */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Invoke a tool by name with arguments.
   * Validates inputs, emits events, and returns the result.
   */
  async invoke(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found.`, durationMs: 0 };
    }

    // Validate required inputs
    for (const input of tool.inputs) {
      if (input.required && !(input.name in args)) {
        return {
          success: false,
          error: `Missing required input '${input.name}' for tool '${name}'.`,
          durationMs: 0,
        };
      }
    }

    // Apply defaults
    const resolvedArgs = { ...args };
    for (const input of tool.inputs) {
      if (!(input.name in resolvedArgs) && input.default !== undefined) {
        resolvedArgs[input.name] = input.default;
      }
    }

    this.events?.emit('tool:invoke', {
      toolName: name,
      args: resolvedArgs,
      timestamp: new Date(),
    });

    const startTime = Date.now();

    try {
      const result = await tool.execute(resolvedArgs);
      const durationMs = Date.now() - startTime;

      this.events?.emit('tool:result', {
        toolName: name,
        result: result.data,
        durationMs,
        timestamp: new Date(),
      });

      return { ...result, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.events?.emit('tool:error', {
        toolName: name,
        error: error instanceof Error ? error : new Error(errorMessage),
        timestamp: new Date(),
      });

      return { success: false, error: errorMessage, durationMs };
    }
  }
}

// ─── Plugin Registry ────────────────────────────────────────────

export class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private toolRegistry: ToolRegistry;
  private events?: EventBus;

  constructor(toolRegistry: ToolRegistry, events?: EventBus) {
    this.toolRegistry = toolRegistry;
    this.events = events;
  }

  /** Register a plugin and its contributed tools */
  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already registered.`);
    }

    // Register any tools the plugin provides
    if (plugin.tools) {
      for (const tool of plugin.tools) {
        this.toolRegistry.register(tool);
      }
    }

    this.plugins.set(plugin.name, plugin);

    this.events?.emit('plugin:loaded', {
      pluginName: plugin.name,
      version: plugin.version,
    });
  }

  /** Unregister a plugin and its tools */
  unregister(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;

    if (plugin.tools) {
      for (const tool of plugin.tools) {
        this.toolRegistry.unregister(tool.name);
      }
    }

    return this.plugins.delete(name);
  }

  /** Get a plugin by name */
  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /** List all registered plugins */
  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /** Collect all lint rules from all plugins */
  collectLintRules(): LintRule[] {
    const rules: LintRule[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.lintRules) {
        rules.push(...plugin.lintRules);
      }
    }
    return rules;
  }

  /** Collect all quality gates from all plugins */
  collectQualityGates(): QualityGate[] {
    const gates: QualityGate[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.qualityGates) {
        gates.push(...plugin.qualityGates);
      }
    }
    return gates;
  }

  /** Run a specific hook across all plugins */
  async runHook<K extends keyof PluginHooks>(
    hookName: K,
    ...args: Parameters<NonNullable<PluginHooks[K]>>
  ): Promise<void> {
    for (const plugin of this.plugins.values()) {
      const hook = plugin.hooks[hookName];
      if (hook) {
        try {
          await (hook as Function)(...args);
        } catch (error) {
          console.error(`[ForceKit] Plugin '${plugin.name}' hook '${hookName}' failed:`, error);
        }
      }
    }
  }

  /** Run pre-commit hooks and return aggregated approval */
  async runPreCommitHooks(changes: string[]): Promise<{ approved: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    let approved = true;

    for (const plugin of this.plugins.values()) {
      if (plugin.hooks.onPreCommit) {
        try {
          const result = await plugin.hooks.onPreCommit(changes);
          if (!result.approved) {
            approved = false;
            reasons.push(`[${plugin.name}] ${result.reason ?? 'Pre-commit check failed'}`);
          }
        } catch (error) {
          approved = false;
          reasons.push(`[${plugin.name}] Hook error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return { approved, reasons };
  }
}
