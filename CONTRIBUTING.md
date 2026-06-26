# Contributing to ForceKit

Thank you for your interest in contributing to ForceKit! This guide will help you get started.

---

## Code of Conduct

Be respectful, constructive, and inclusive. We are committed to providing a welcoming experience for everyone.

---

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **npm** >= 9
- **TypeScript** >= 5.7
- **Salesforce CLI (`sf`)** — required for integration testing (not needed for unit tests)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/rvaghela-09/forcekit.git
cd forcekit

# Install dependencies
npm install

# Build the TypeScript source
npm run build

# Run the test suite
npm test

# Start the TypeScript compiler in watch mode
npm run dev
```

### Project Structure

```text
src/
├── agents/         # Agent schema, loader, and validation
├── bin/            # CLI entry point (forcekit.ts)
├── config/         # Configuration defaults and loaders
├── core/           # Engine, state, events, registry, MCP, orchestrator
├── plugins/        # Plugin API and built-in plugins
├── tools/          # Salesforce CLI tool wrappers
├── tests/          # Unit tests (mirrors src/ structure)
├── index.ts        # Public API exports
└── version.ts      # Centralized version constant
```

---

## How to Contribute

### Reporting Issues

- Search existing issues before creating a new one
- Include your Node.js version, OS, and `forcekit version` output
- Provide a minimal reproduction case when reporting bugs

### Branch Naming

Use descriptive branch names following this convention:

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<short-description>` | `feat/add-flow-linter` |
| Bug Fix | `fix/<short-description>` | `fix/mcp-parse-error` |
| Docs | `docs/<short-description>` | `docs/update-readme` |
| Refactor | `refactor/<short-description>` | `refactor/state-manager` |

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <description>

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`

**Scopes:** `core`, `tools`, `agents`, `plugins`, `cli`, `mcp`, `config`

**Examples:**
```text
feat(tools): add flow metadata scanner support
fix(mcp): handle malformed JSON-RPC batch requests
docs(readme): add MCP setup instructions for Cursor
test(core): add orchestrator dependency resolution tests
```

---

## Adding New Features

### Adding a New Tool

1. Create the tool in `src/tools/<name>.ts`
2. Export a factory function: `createXxxTool(config: ForceKitConfig): Tool`
3. Register it in `src/core/engine.ts` constructor
4. Export from `src/index.ts`
5. Add a CLI handler in `src/bin/forcekit.ts`
6. Write tests in `src/tests/tools/<name>.test.ts`

### Adding a New Lint Rule

1. Add the rule to `src/tools/linter.ts` in the `RULES` array
2. Add a default config entry in `src/config/defaults.ts`
3. Add test cases in `src/tests/tools/linter.test.ts`

### Adding a New Plugin

1. Extend `ForceKitPlugin` from `src/plugins/plugin-api.ts`
2. Place built-in plugins in `src/plugins/built-in/`
3. Override the lifecycle hooks you need (`onAgentStart`, `onAgentComplete`, etc.)
4. Register additional tools, lint rules, or quality gates via `this.registerTool()`, etc.

### Adding a New Agent Definition

1. Create `agents/definitions/<name>.yaml`
2. Ensure all `capabilities` are valid values from `AgentCapability` type
3. Ensure all `tools` are registered in the `ToolRegistry`
4. Ensure `lifecycle` actions are valid `AgentLifecycleAction` values
5. Run the schema validation: `forcekit agent show <name>`

---

## Testing Guidelines

- **All tests must be sandbox-independent** — no live Salesforce org required
- **Mock external dependencies** — `sf` CLI calls, file system, JSON-RPC
- **Use Node.js built-in test runner** — `node:test` and `node:assert`
- **Test file naming** — `<module>.test.ts` mirroring the source path
- **Cover edge cases** — empty inputs, error paths, boundary values

Run tests:
```bash
npm test              # Run all tests
npm run test:build    # Build and run all tests
```

---

## Pull Request Guidelines

1. **One feature/fix per PR** — keep changes focused
2. **Tests required** — all new code must have corresponding tests
3. **Build must pass** — run `npm run build && npm test` before submitting
4. **Update docs** — update README, CHANGELOG, and JSDoc as needed
5. **Describe your changes** — include context, motivation, and any breaking changes

---

## Release Process

1. Update `src/version.ts` with the new version
2. Update `package.json` version
3. Add a new section to `CHANGELOG.md`
4. Create a git tag: `git tag v<version>`
5. Publish: `npm publish`

---

## Questions?

Open a [GitHub Discussion](https://github.com/rvaghela-09/forcekit/discussions) for questions, ideas, or feedback.
