/**
 * ForceKit Agent Schema
 *
 * Defines the TypeScript types and JSON Schema for agent YAML definition files.
 * Used by the loader to validate agent definitions at load time.
 */

// ─── Agent Definition Types ─────────────────────────────────────

export interface AgentDefinition {
  /** Unique agent name */
  name: string;
  /** Semver version of this definition */
  version: string;
  /** Human-readable description of what this agent does */
  description: string;

  /** What this agent can do */
  capabilities: AgentCapability[];

  /** Context documents required for this agent */
  context: {
    required: string[];
    optional: string[];
  };

  /** Tools this agent needs (must be registered in the ToolRegistry) */
  tools: string[];

  /** Constraints limiting what this agent can do */
  constraints: AgentConstraints;

  /** Lifecycle hooks for this agent */
  lifecycle: AgentLifecycle;

  /** Quality gates this agent must pass */
  qualityGates: AgentQualityGateRef[];
}

export type AgentCapability =
  | 'code_generation'
  | 'file_modification'
  | 'test_execution'
  | 'code_review'
  | 'security_review'
  | 'deployment'
  | 'lwc_development'
  | 'flow_development'
  | 'agentforce_development'
  | 'knowledge_research'
  | 'orchestration'
  | 'static_analysis';

export interface AgentConstraints {
  /** Maximum number of files the agent can modify */
  maxFiles?: number;
  /** Allowed file paths (glob patterns) */
  allowedPaths?: string[];
  /** Forbidden file paths (glob patterns) */
  forbiddenPaths?: string[];
  /** Must generate test classes */
  requireTests?: boolean;
  /** Must verify metadata before referencing */
  requireVerification?: boolean;
  /** Minimum test coverage percentage */
  minTestCoverage?: number;
}

export interface AgentLifecycle {
  /** Actions to run when the agent starts */
  onStart: AgentLifecycleAction[];
  /** Actions to run when the agent completes successfully */
  onComplete: AgentLifecycleAction[];
  /** Actions to run when the agent encounters an error */
  onError: AgentLifecycleAction[];
}

export type AgentLifecycleAction =
  | 'load_context'
  | 'verify_inventory'
  | 'log_session_start'
  | 'run_linter'
  | 'run_tests'
  | 'update_inventory'
  | 'log_session_end'
  | 'log_blocker'
  | 'notify_orchestrator'
  | 'render_markdown';

export interface AgentQualityGateRef {
  /** Gate identifier */
  name: string;
  /** Whether this gate is required to pass (vs advisory) */
  required: boolean;
}

// ─── JSON Schema for Validation ─────────────────────────────────

export const AGENT_DEFINITION_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object' as const,
  required: ['name', 'version', 'description', 'capabilities', 'context', 'tools', 'constraints', 'lifecycle', 'qualityGates'],
  properties: {
    name: { type: 'string' as const, minLength: 1, pattern: '^[a-z][a-z0-9_-]*$' },
    version: { type: 'string' as const, pattern: '^\\d+\\.\\d+(\\.\\d+)?$' },
    description: { type: 'string' as const, minLength: 10 },
    capabilities: {
      type: 'array' as const,
      items: {
        type: 'string' as const,
        enum: [
          'code_generation', 'file_modification', 'test_execution',
          'code_review', 'security_review', 'deployment',
          'lwc_development', 'flow_development', 'agentforce_development',
          'knowledge_research', 'orchestration', 'static_analysis',
        ],
      },
      minItems: 1,
    },
    context: {
      type: 'object' as const,
      required: ['required'],
      properties: {
        required: { type: 'array' as const, items: { type: 'string' as const } },
        optional: { type: 'array' as const, items: { type: 'string' as const } },
      },
    },
    tools: {
      type: 'array' as const,
      items: { type: 'string' as const },
    },
    constraints: {
      type: 'object' as const,
      properties: {
        maxFiles: { type: 'number' as const, minimum: 1 },
        allowedPaths: { type: 'array' as const, items: { type: 'string' as const } },
        forbiddenPaths: { type: 'array' as const, items: { type: 'string' as const } },
        requireTests: { type: 'boolean' as const },
        requireVerification: { type: 'boolean' as const },
        minTestCoverage: { type: 'number' as const, minimum: 0, maximum: 100 },
      },
    },
    lifecycle: {
      type: 'object' as const,
      required: ['onStart', 'onComplete', 'onError'],
      properties: {
        onStart: { type: 'array' as const, items: { type: 'string' as const } },
        onComplete: { type: 'array' as const, items: { type: 'string' as const } },
        onError: { type: 'array' as const, items: { type: 'string' as const } },
      },
    },
    qualityGates: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        required: ['name', 'required'],
        properties: {
          name: { type: 'string' as const },
          required: { type: 'boolean' as const },
        },
      },
    },
  },
  additionalProperties: false,
};

/**
 * Validates an agent definition object against the schema.
 * Returns an array of error messages (empty if valid).
 */
export function validateAgentDefinition(data: unknown): string[] {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return ['Agent definition must be an object.'];
  }

  const def = data as Record<string, unknown>;

  // Required fields
  const required = ['name', 'version', 'description', 'capabilities', 'context', 'tools', 'constraints', 'lifecycle', 'qualityGates'];
  for (const field of required) {
    if (!(field in def)) {
      errors.push(`Missing required field: '${field}'`);
    }
  }

  if (errors.length > 0) return errors;

  // Name format
  if (typeof def.name === 'string' && !/^[a-z][a-z0-9_-]*$/.test(def.name)) {
    errors.push(`Invalid name '${def.name}': must be lowercase, start with a letter, and contain only a-z, 0-9, _, -`);
  }

  // Version format
  if (typeof def.version === 'string' && !/^\d+\.\d+(\.\d+)?$/.test(def.version)) {
    errors.push(`Invalid version '${def.version}': must be semver format (e.g., 1.0 or 1.0.0)`);
  }

  // Description length
  if (typeof def.description === 'string' && def.description.length < 10) {
    errors.push('Description must be at least 10 characters.');
  }

  // Capabilities
  if (Array.isArray(def.capabilities) && def.capabilities.length === 0) {
    errors.push('Agent must have at least one capability.');
  }

  // Context
  if (typeof def.context === 'object' && def.context !== null) {
    const ctx = def.context as Record<string, unknown>;
    if (!Array.isArray(ctx.required)) {
      errors.push("context.required must be an array of document paths.");
    }
  }

  // Lifecycle
  if (typeof def.lifecycle === 'object' && def.lifecycle !== null) {
    const lc = def.lifecycle as Record<string, unknown>;
    for (const hook of ['onStart', 'onComplete', 'onError']) {
      if (!Array.isArray(lc[hook])) {
        errors.push(`lifecycle.${hook} must be an array of action names.`);
      }
    }
  }

  return errors;
}
