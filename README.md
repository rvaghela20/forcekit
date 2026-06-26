# ForceKit — AI Agent Framework for Salesforce

ForceKit is a programmatic AI Agent Framework designed for Salesforce development. It enables declarative agent definitions, custom lifecycle plugins, unified CLI execution, and seamless integration with Large Language Models (LLMs) via the **Model Context Protocol (MCP)**.

---

## Key Features

1. **Declarative Agent Definitions**: Define agent capabilities, constraints, tool permissions, and lifecycle rules in clean YAML files.
2. **Model Context Protocol (MCP) Server**: Run ForceKit as a standard stdio MCP server to expose Salesforce tools programmatically to LLM clients (like Claude Desktop or Cursor).
3. **Structured State Management**: Track agent sessions, decisions, tasks, and blockers in a centralized, serializable JSON state, rendering automatic Markdown updates.
4. **Active Salesforce Integration**: Wrap the Salesforce CLI (`sf`) to verify metadata existence, execute Apex unit tests, parse code coverage, and deploy files securely.
5. **Static Analysis (Linter)**: Includes 10 built-in, Salesforce-specific linting rules (e.g. banning DML/SOQL in loops, enforcing user-mode operations, detecting empty catch blocks).

---

## Project Status

ForceKit `v2.0.0-beta.1` — the following table describes the maturity of each major feature area:

| Feature | Status | Notes |
|---------|--------|-------|
| CLI (scan, lint, verify, deploy, test) | ✅ Production-ready | Wraps `sf` CLI with full JSON output support |
| MCP Server Integration | ✅ Production-ready | Tested with Claude Desktop and Cursor |
| Agent Definitions (YAML) | ✅ Production-ready | 5 built-in agents, AJV-validated schema |
| State Management & Markdown Rendering | ✅ Production-ready | Atomic writes, structured JSON, backward-compatible |
| Static Analysis (Linter) | ✅ Production-ready | 12 built-in rules, plugin-extensible |
| Plugin System | 🧪 Experimental | API stable, 3 built-in plugins |
| Orchestrator Multi-Agent Loop | 🧪 Experimental | Sequential task delegation, quality gates |
| Web Search Tool | 🧪 Curated reference DB | 27+ Salesforce doc entries, offline-capable |

> **Legend:** ✅ = Stable and tested for production Salesforce projects &nbsp;|&nbsp; 🧪 = Functional but under active development

## Directory Structure

```text
forcekit/
├── agents/
│   └── definitions/         # Declarative YAML definitions
│       ├── developer.yaml   # Code generation & modification agent
│       ├── reviewer.yaml    # Code review & linter agent
│       ├── qa.yaml          # Test executor & coverage analyzer agent
│       ├── researcher.yaml  # Doc search & release notes agent
│       └── orchestrator.yaml# Lead task planner & coordination agent
├── src/
│   ├── bin/
│   │   └── forcekit.ts      # Unified CLI Entry Point
│   ├── config/
│   │   └── defaults.ts      # Configuration defaults & dynamic loaders
│   ├── core/
│   │   ├── engine.ts        # Agent Engine lifecycle runner
│   │   ├── orchestrator.ts  # Multi-agent delegation controller
│   │   ├── state.ts         # JSON state manager & markdown renderer
│   │   ├── context.ts       # Context assembler & prompt builder
│   │   ├── events.ts        # Centralized event bus
│   │   ├── mcp.ts           # Model Context Protocol stdio server
│   │   └── registry.ts      # Tool and Plugin registry
│   ├── plugins/             # Extensible plugins api and built-ins
│   ├── tools/               # Salesforce and platform CLI tools
│   └── tests/               # 100% mocked, sandbox-independent unit tests
└── tsconfig.json
```

---

## AI Assistant & IDE Compatibility

ForceKit integrates with your favorite AI coding tools in two primary ways: **Model Context Protocol (MCP)** for active tool execution, and **Markdown Grounding Context** for passive workspace indexing.

### 1. Claude Desktop & Cursor (Active Tool Execution via MCP)
* **Claude Desktop & Cursor IDE**: Expose ForceKit tools (such as `scan`, `lint`, `test`, `verify`, and `web-search`) directly into chats or agent loops by registering ForceKit as a Model Context Protocol (MCP) server. When the AI assistant needs to check rules or run Apex tests, it executes the tool natively on your project directory.

### 2. Claude Code & Terminal Agents (CLI Command Execution)
* **Claude Code**: Standard command-line terminal agents can run ForceKit's compiled commands directly from your local terminal workspace (e.g. `node forcekit/dist/bin/forcekit.js lint --project-root .`) to verify build health or static code guidelines before making commits.

### 3. Gemini / Antigravity (Active Pair Programming Integration)
* **Gemini/Antigravity**: As pair-programming agents with terminal command and filesystem access, we run the ForceKit CLI, synchronize org settings, verify test coverage, and automate refactoring loops directly on your behalf.

### 4. GitHub Copilot & OpenAI Codex (Passive Grounding Context)
* **Copilot & Codex**: These systems index files in your workspace automatically. ForceKit's state engine outputs structured Markdown logs: `forcekit/current-state.md` and `forcekit/inventory.md`. Copilot and Codex read these files, making them aware of existing classes, object definitions, and session goals without field name hallucinations.

---

## Getting Started

### 1. Installation

You can install ForceKit globally or locally via npm, or build it from source.

#### Global CLI Installation
```bash
npm install -g @rvaghela-09/forcekit
```
Verify the installation:
```bash
forcekit help
```

#### Local Project Dependency
```bash
npm install --save-dev @rvaghela-09/forcekit
```
Verify the local installation:
```bash
npx forcekit help
```

#### Build From Source
Clone the repository, install dependencies, and build the TypeScript codebase:
```bash
npm install
npm run build
```
Verify that the CLI is correctly installed:
```bash
node dist/bin/forcekit.js --help
```

---

## Configuration

ForceKit supports cascading configuration loading. It merges defaults with local overrides in the following priority order:
1. `DEFAULT_CONFIG` (Base settings)
2. `forcekit.config.json` (Static project overrides)
3. `forcekit.config.js` (Dynamic script overrides)
4. Runtime Options (CLI flags / programmatic parameters)

### Example `forcekit.config.js`
Place this file in your Salesforce project root:
```javascript
export default {
  apiVersion: '68.0',
  minTestCoverage: 95,
  lint: {
    maxClassLines: 150,
    rules: {
      'no-security-enforced': true,
      'user-mode-enforced': true
    }
  }
};
```

---

## CLI Usage Guide

Run commands by providing the target Salesforce project root via `--project-root`:

### 1. Scan Project
Catalog all Salesforce metadata (Apex, LWC, Flows, Triggers) into the local inventory state:
```bash
forcekit scan --project-root /path/to/sf-project
```

### 2. Lint Code
Run static analysis checks on your Apex classes, triggers, and LWC files:
```bash
forcekit lint --project-root /path/to/sf-project
```

### 3. Sync Salesforce Org & Limits
Query active org status, Daily API limits, Data Storage, and File Storage usage:
```bash
forcekit org sync --project-root /path/to/sf-project
```

### 4. Verify Metadata
Check if custom objects, fields, classes, or flows exist on the active org:
```bash
forcekit verify --type field --name Active__c --object Account --project-root /path/to/sf-project
```

### 5. Deploy Metadata
Deploy target source directories or files to the active org:
```bash
forcekit deploy --source-dir force-app/main/default/classes/AccountService.cls --project-root /path/to/sf-project
```

### 6. Run Unit Tests
Execute target Apex unit tests and verify code coverage:
```bash
forcekit test --tests AccountServiceTest --project-root /path/to/sf-project
```

### 7. Run Lead Orchestrator
Execute the complete, multi-agent task loop (Research → Dev → Review → QA) to achieve a high-level goal:
```bash
forcekit run-orchestrator --goal "Create Lead trigger assigning default owner" --project-root /path/to/sf-project
```

---

## Model Context Protocol (MCP) Server Setup

Expose ForceKit's tools to AI IDEs or chat interfaces (like Claude Desktop) by configuring ForceKit as an MCP server.

### Configuration in Claude Desktop
Add the following entry to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "forcekit": {
      "command": "node",
      "args": [
        "/absolute/path/to/forcekit/dist/bin/forcekit.js",
        "mcp",
        "--project-root",
        "/absolute/path/to/sf-project"
      ]
    }
  }
}
```

*Note: Replace `/absolute/path/to/forcekit` and `/absolute/path/to/sf-project` with the actual absolute paths on your local machine.*

### Exposed MCP Tools
Once configured, the following tools will be discoverable:
- **`scan`**: Catalog all metadata.
- **`lint`**: Static analysis of Apex/LWC code.
- **`verify`**: Check metadata definitions.
- **`deploy`**: Deploy source/metadata.
- **`test`**: Run unit tests and calculate coverage.
- **`web-search`**: Search Salesforce documentation & release notes.
- **`session`**: Control task progression.

---

## Verification & Testing

ForceKit contains a suite of sandbox-independent unit tests. Run them using:
```bash
npm test
```
All tests mock the Salesforce CLI commands, file streams, and JSON-RPC protocols to guarantee execution stability and speeds.
