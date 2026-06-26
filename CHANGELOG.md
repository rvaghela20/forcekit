# Changelog

All notable changes to ForceKit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0-beta.1] — 2026-06-26

### Added
- **CONTRIBUTING.md** — Development setup, branch conventions, and PR guidelines
- **CHANGELOG.md** — Project evolution tracking using Keep a Changelog format
- **Centralized version constant** (`src/version.ts`) — Single source of truth for version strings across CLI, MCP, and state manager
- **Search tool expansion** — Expanded curated reference database from 5 to 27+ entries covering Apex, Agentforce, LWC, Security, Flows, and Platform topics
- **Keyword relevance scoring** — Search results now ranked by relevance with title matches weighted 3x
- **Search result categories** — Each reference entry tagged with category (apex, agentforce, lwc, security, flows, platform)
- **Search tool unit tests** (`src/tests/tools/search.test.ts`) — Test coverage for keyword matching, relevance scoring, limits, and edge cases
- **Project Status section in README** — Maturity matrix showing production-ready vs experimental features
- **Shell input sanitization** — Deployer and Tester tools now reject values containing shell metacharacters to prevent command injection

### Changed
- **Version bumped** from `2.0.0-alpha.1` to `2.0.0-beta.1`
- **Orchestrator agent** — `maxFiles` increased from 3 to 20; added `web-search`, `test`, `verify`, `deploy` tools; added Salesforce project `allowedPaths`
- **Researcher agent** — Fixed invalid capabilities (`doc_lookup`, `web_search` → `knowledge_research`, `static_analysis`); added `lint` tool
- **QA agent** — Added missing `test` and `verify` tools to match its `test_execution` capability
- **Schema validation** — `maxFiles` minimum changed from 1 to 0, allowing read-only agents (e.g., reviewer)
- **MCP server version** — Now reads from centralized `VERSION` constant instead of hardcoded `'2.0.0'`
- **State manager version** — Now reads from centralized `VERSION` constant instead of hardcoded `'2.0.0'`
- **Search tool description** — Clarified that results come from a curated reference database

### Fixed
- **Version string drift** — CLI (`2.0.0-alpha.1`), MCP server (`2.0.0`), and state manager (`2.0.0`) now all use the same centralized version constant
- **Researcher agent capabilities** — `doc_lookup` and `web_search` were not valid `AgentCapability` enum values; replaced with `knowledge_research` and `static_analysis`
- **Schema maxFiles validation** — `minimum: 1` would reject reviewer agent's `maxFiles: 0` (read-only); fixed to `minimum: 0`
- **Unused import** — Removed unused `parseArgs` import from CLI entry point

### Removed
- **`package-lock.json` from `.gitignore`** — Lock files should be committed for published npm packages to ensure reproducible builds

---

## [2.0.0-alpha.1] — 2026-06-25

### Added
- Complete framework rewrite with TypeScript
- Declarative agent definitions in YAML (developer, reviewer, qa, researcher, orchestrator)
- Agent schema validation with JSON Schema and AJV
- Agent definition loader with caching and multi-directory search
- Model Context Protocol (MCP) stdio server for AI IDE integration
- Unified CLI with 12 commands (scan, lint, verify, deploy, test, org sync, session, agent, state, mcp, run-orchestrator)
- JSON-backed state management with atomic writes
- Backward-compatible Markdown rendering (current-state.md, inventory.md)
- Context builder with task-type-aware document assembly and token budget management
- Typed event bus for framework-wide event communication
- Tool registry with input validation, default resolution, and event emission
- Plugin system with base class, lifecycle hooks, and extensible lint rules / quality gates
- 3 built-in plugins: anti-hallucination, session-logger, quality-gate
- Scanner tool for metadata inventory (objects, classes, LWC, flows, triggers, permission sets)
- Linter tool with 12 Salesforce-specific rules
- Verifier tool for org metadata existence checking with local caching
- Deployer tool wrapping `sf project deploy start`
- Tester tool wrapping `sf apex run test` with coverage parsing
- Session tool for agent session lifecycle management
- Web search tool with curated Salesforce documentation database
- Orchestrator controller for multi-agent task delegation
- 67 sandbox-independent unit tests
- Cascading configuration system (defaults → JSON → JS → runtime)
- MIT License
