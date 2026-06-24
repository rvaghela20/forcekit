/**
 * ForceKit v2 — Public API
 *
 * Main entry point for consumers importing forcekit as a library.
 */

// Core
export { EventBus, eventBus } from './core/events.js';
export type { ForceKitEvents, AgentResult, EventHandler } from './core/events.js';

export { ForceKitState } from './core/state.js';
export type {
  ForceKitStateData,
  SessionEntry,
  TaskEntry,
  DecisionEntry,
  BlockerEntry,
  InventoryItem,
  EnvironmentState,
  GovernorLimit,
} from './core/state.js';

export { ContextBuilder } from './core/context.js';
export type { TaskType, ContextSection, ContextBuildOptions, BuiltContext } from './core/context.js';

export { ToolRegistry, PluginRegistry } from './core/registry.js';
export type { Tool, ToolInput, ToolResult, Plugin, PluginHooks, LintRule, LintViolation, QualityGate } from './core/registry.js';

export { AgentEngine } from './core/engine.js';
export type { EngineOptions, AgentRunOptions, AgentRunResult, QualityGateResult } from './core/engine.js';

// Agents
export type { AgentDefinition, AgentCapability, AgentConstraints, AgentLifecycle } from './agents/schema.js';
export { validateAgentDefinition, AGENT_DEFINITION_SCHEMA } from './agents/schema.js';
export { loadAgentDefinition, loadAllAgents, loadAgentFromFile, clearAgentCache } from './agents/loader.js';

// Tools
export { Scanner, createScannerTool } from './tools/scanner.js';
export type { ScanResult } from './tools/scanner.js';

export { Linter, createLinterTool } from './tools/linter.js';
export type { LintResult, LintSummary } from './tools/linter.js';

export { Verifier, createVerifierTool } from './tools/verifier.js';
export type { VerificationEntry, CacheCategory } from './tools/verifier.js';

export { Deployer, createDeployerTool } from './tools/deployer.js';

export { Tester, createTesterTool } from './tools/tester.js';
export type { TestResultSummary } from './tools/tester.js';

export { createSessionTool } from './tools/session.js';

// Search & Research
export { createSearchTool } from './tools/search.js';
export type { SearchResultEntry, SearchSummary } from './tools/search.js';


// Orchestration
export { OrchestratorController } from './core/orchestrator.js';

// Plugins
export { ForceKitPlugin } from './plugins/plugin-api.js';
export { AntiHallucinationPlugin } from './plugins/built-in/anti-hallucination.js';
export { SessionLoggerPlugin } from './plugins/built-in/session-logger.js';
export { QualityGatePlugin } from './plugins/built-in/quality-gate.js';

// Config
export { loadConfig, DEFAULT_CONFIG } from './config/defaults.js';
export type { ForceKitConfig } from './config/defaults.js';

// MCP
export { startMcpServer } from './core/mcp.js';

