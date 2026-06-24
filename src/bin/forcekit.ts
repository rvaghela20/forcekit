#!/usr/bin/env node

/**
 * ForceKit CLI
 *
 * Unified command-line interface for the ForceKit agent framework.
 * Replaces both install.js and update_state.py with a single TypeScript CLI.
 */

import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { AgentEngine } from '../core/engine.js';
import { createScannerTool, Scanner } from '../tools/scanner.js';
import { createLinterTool, Linter } from '../tools/linter.js';
import { loadAllAgents } from '../agents/loader.js';
import { loadConfig } from '../config/defaults.js';
import { Verifier } from '../tools/verifier.js';
import { Deployer } from '../tools/deployer.js';
import { Tester } from '../tools/tester.js';
import { OrchestratorController } from '../core/orchestrator.js';

// ─── CLI Definition ─────────────────────────────────────────────

const USAGE = `
ForceKit v2 — AI Agent Framework for Salesforce

Usage:
  forcekit <command> [options]

Commands:
  scan              Scan force-app and update inventory
  lint              Run static analysis on Apex/LWC files
  verify            Verify if a Salesforce metadata item exists
  deploy            Deploy source/metadata to target org
  test              Run Apex unit tests and verify coverage
  org sync          Sync active Salesforce org details and limits
  run-orchestrator  Execute lead orchestrator task delegation loop
  session start     Start a new agent session
  session end       End the current session
  agent list        List available agent definitions
  agent show <name> Show details of an agent definition
  state show        Display current project state
  state render      Render state to markdown files
  mcp               Start Model Context Protocol (MCP) server over stdio
  version           Show version information
  help              Show this help message

Options:
  --project-root    Project root directory (default: current directory)
  --docs            Path to forcekit docs directory (default: forcekit/)
  --files           Comma-separated file paths for lint command
  --type            Metadata type for verify (object, field, class, flow)
  --name            API name of metadata to verify
  --object          Parent object name (for field verification)
  --force           Bypass cache or force query
  --metadata        Metadata pattern to deploy
  --source-dir      Folders or files to deploy (comma-separated)
  --tests           Test classes to execute (comma-separated)
  --suite           Test suite to execute
  --goal            Session or orchestrator goal description
  --agent           Agent name for session start
  --summary         Session end summary
  --format          Output format: text, json (default: text)
`;

// ─── Main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  if (args[0] === 'version' || args[0] === '--version') {
    console.log('ForceKit v2.0.0-alpha.1');
    process.exit(0);
  }

  // Parse common options
  const projectRoot = resolve(getArgValue(args, '--project-root') ?? '.');
  const docsRoot = resolve(projectRoot, getArgValue(args, '--docs') ?? 'forcekit');
  const format = getArgValue(args, '--format') ?? 'text';

  const command = args[0];

  try {
    switch (command) {
      case 'scan':
        await handleScan(projectRoot, docsRoot, format);
        break;
      case 'lint':
        await handleLint(projectRoot, args, format);
        break;
      case 'session':
        await handleSession(projectRoot, docsRoot, args);
        break;
      case 'agent':
        await handleAgent(docsRoot, args, format);
        break;
      case 'state':
        await handleState(projectRoot, docsRoot, args, format);
        break;
      case 'org':
        await handleOrg(projectRoot, docsRoot, args);
        break;
      case 'verify':
        await handleVerify(projectRoot, args, format);
        break;
      case 'deploy':
        await handleDeploy(projectRoot, args, format);
        break;
      case 'test':
        await handleTest(projectRoot, args, format);
        break;
      case 'run-orchestrator':
        await handleRunOrchestrator(projectRoot, docsRoot, args, format);
        break;
      case 'mcp':
        await handleMcp(projectRoot, docsRoot);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log(USAGE);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// ─── Command Handlers ───────────────────────────────────────────

async function handleScan(projectRoot: string, docsRoot: string, format: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  const engine = new AgentEngine({ projectRoot, docsRoot, configOverrides: config });
  const scanner = new Scanner(projectRoot, config.paths.forceApp);

  console.log('🔍 Scanning project metadata...\n');
  const result = scanner.scan();
  scanner.applyToState(engine.state, result);

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`✅ Scan complete — ${result.totalItems} items found:\n`);
    console.log(`   Objects:         ${result.objects.length}`);
    console.log(`   Apex Classes:    ${result.classes.length}`);
    console.log(`   LWC Components:  ${result.lwcComponents.length}`);
    console.log(`   Flows:           ${result.flows.length}`);
    console.log(`   Triggers:        ${result.triggers.length}`);
    console.log(`   Permission Sets: ${result.permissionSets.length}`);
    console.log(`\n   State saved to .forcekit/state.json`);
  }
}

async function handleLint(projectRoot: string, args: string[], format: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  const linter = new Linter(config.lint);

  const filesArg = getArgValue(args, '--files');
  let filePaths: string[];

  if (filesArg) {
    filePaths = filesArg.split(',').map((f) => resolve(projectRoot, f.trim()));
  } else {
    filePaths = findAllFiles(join(projectRoot, config.paths.forceApp));
  }

  console.log(`🔍 Linting ${filePaths.length} files...\n`);
  const summary = linter.lintFiles(filePaths);

  if (format === 'json') {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    if (summary.fileResults.length === 0) {
      console.log('✅ No violations found!');
    } else {
      console.log(`Found ${summary.totalErrors} errors and ${summary.totalWarnings} warnings:\n`);

      for (const result of summary.fileResults) {
        console.log(`📂 ${result.filePath}`);
        for (const v of result.violations) {
          const icon = v.severity === 'error' ? '🔴' : '🟡';
          console.log(`   Line ${v.line}: ${icon} [${v.ruleId}] ${v.message}`);
        }
        console.log();
      }

      if (summary.totalErrors > 0) {
        console.log('❌ Lint failed with errors.');
        process.exit(1);
      }
    }
  }
}

async function handleSession(projectRoot: string, docsRoot: string, args: string[]): Promise<void> {
  const config = await loadConfig(projectRoot);
  const engine = new AgentEngine({ projectRoot, docsRoot, configOverrides: config });
  const subCommand = args[1];

  if (subCommand === 'start') {
    const agent = getArgValue(args, '--agent') ?? 'agent';
    const goal = getArgValue(args, '--goal') ?? 'General session';

    const session = engine.state.startSession(agent, goal);
    console.log(`✅ Session started: ${session.id}`);
    console.log(`   Agent: ${agent}`);
    console.log(`   Goal: ${goal}`);
  } else if (subCommand === 'end') {
    const summary = getArgValue(args, '--summary') ?? 'Session ended';
    const filesArg = getArgValue(args, '--files');
    const files = filesArg ? filesArg.split(',').map((f) => f.trim()) : [];

    const session = engine.state.endSession(summary, files);
    if (session) {
      console.log(`✅ Session ended: ${session.id}`);
      console.log(`   Summary: ${summary}`);
    } else {
      console.log('⚠️ No active session to end.');
    }
  } else {
    console.error('Usage: forcekit session <start|end> [options]');
    process.exit(1);
  }
}

async function handleAgent(docsRoot: string, args: string[], format: string): Promise<void> {
  const subCommand = args[1];

  if (subCommand === 'list') {
    const agents = loadAllAgents(docsRoot);

    if (format === 'json') {
      console.log(JSON.stringify(agents.map((a) => ({ name: a.name, version: a.version, description: a.description })), null, 2));
    } else {
      console.log('Available Agent Definitions:\n');
      for (const agent of agents) {
        console.log(`  📋 ${agent.name} (v${agent.version})`);
        console.log(`     ${agent.description}`);
        console.log(`     Capabilities: ${agent.capabilities.join(', ')}`);
        console.log(`     Tools: ${agent.tools.join(', ')}`);
        console.log();
      }
      if (agents.length === 0) {
        console.log('  No agent definitions found.');
      }
    }
  } else if (subCommand === 'show') {
    const name = args[2];
    if (!name) {
      console.error('Usage: forcekit agent show <name>');
      process.exit(1);
    }
    const { loadAgentDefinition } = await import('../agents/loader.js');
    const agent = loadAgentDefinition(name, docsRoot);
    console.log(JSON.stringify(agent, null, 2));
  } else {
    console.error('Usage: forcekit agent <list|show> [name]');
    process.exit(1);
  }
}

async function handleState(projectRoot: string, docsRoot: string, args: string[], format: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  const engine = new AgentEngine({ projectRoot, docsRoot, configOverrides: config });
  const subCommand = args[1];

  if (subCommand === 'show') {
    const snapshot = engine.state.getSnapshot();
    if (format === 'json') {
      console.log(JSON.stringify(snapshot, null, 2));
    } else {
      console.log(engine.state.renderCurrentStateMarkdown());
    }
  } else if (subCommand === 'render') {
    const outputDir = resolve(docsRoot);
    engine.renderMarkdown(outputDir);
    console.log(`✅ Rendered state to:\n   ${join(outputDir, 'current-state.md')}\n   ${join(outputDir, 'inventory.md')}`);
  } else {
    console.error('Usage: forcekit state <show|render>');
    process.exit(1);
  }
}

async function handleOrg(projectRoot: string, docsRoot: string, args: string[]): Promise<void> {
  const subCommand = args[1];
  if (subCommand === 'sync') {
    const config = await loadConfig(projectRoot);
    const verifier = new Verifier(projectRoot, config.paths.cacheDir);
    const engine = new AgentEngine({ projectRoot, docsRoot, configOverrides: config });

    console.log('🔄 Syncing active Salesforce org details and limits...\n');
    const result = await verifier.syncOrg();

    // Map limits to state
    const mappedLimits = [
      { name: 'API Calls (Daily)', current: result.limits.DailyApiRequests.current, max: result.limits.DailyApiRequests.max },
      { name: 'Data Storage', current: result.limits.DataStorageMB.current, max: result.limits.DataStorageMB.max },
      { name: 'File Storage', current: result.limits.FileStorageMB.current, max: result.limits.FileStorageMB.max },
    ];
    engine.state.updateGovernorLimits(mappedLimits);

    // Map environment
    engine.state.updateEnvironment('Dev Sandbox', {
      notes: `Active Username: ${result.username} | Org ID: ${result.orgId}`,
      lastDeploy: new Date().toISOString().split('T')[0],
      status: 'healthy'
    });

    engine.renderMarkdown(docsRoot);

    console.log(`✅ Org sync complete — targeting '${result.alias}'`);
    console.log(`   Username:        ${result.username}`);
    console.log(`   Org ID:          ${result.orgId}`);
    console.log(`   API Used:        ${result.limits.DailyApiRequests.current}/${result.limits.DailyApiRequests.max}`);
    console.log(`\n   State rendered to markdown in ${docsRoot}/`);
  } else {
    console.error('Usage: forcekit org sync [options]');
    process.exit(1);
  }
}

async function handleVerify(projectRoot: string, args: string[], format: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  const verifier = new Verifier(projectRoot, config.paths.cacheDir);

  const type = getArgValue(args, '--type') as any;
  const name = getArgValue(args, '--name');
  const object = getArgValue(args, '--object');
  const force = args.includes('--force');

  if (!type || !name) {
    console.error('Usage: forcekit verify --type <type> --name <name> [--object <object>] [--force]');
    process.exit(1);
  }

  console.log(`🔍 Verifying ${type} '${type === 'field' ? `${object}.${name}` : name}'...\n`);
  const result = await verifier.verify(type, name, object, { force });

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.exists) {
      console.log(`✅ Exists in Salesforce!`);
      if (result.entry?.dataType) console.log(`   DataType: ${result.entry.dataType}`);
      if (result.entry?.status) console.log(`   Status:   ${result.entry.status}`);
    } else {
      console.log(`❌ Does not exist in Salesforce.`);
      process.exit(1);
    }
  }
}

async function handleDeploy(projectRoot: string, args: string[], format: string): Promise<void> {
  const deployer = new Deployer(projectRoot);
  const metadata = getArgValue(args, '--metadata');
  const sourceDirArg = getArgValue(args, '--source-dir');
  const sourceDirs = sourceDirArg ? sourceDirArg.split(',').map(s => s.trim()) : undefined;

  console.log(`🚀 Deploying metadata/files to target org...\n`);
  const result = await deployer.deploy({ metadata, sourceDirs });

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.success) {
      console.log('✅ Deployment Succeeded!');
    } else {
      console.error('❌ Deployment Failed:');
      console.error(JSON.stringify(result.details, null, 2));
      process.exit(1);
    }
  }
}

async function handleTest(projectRoot: string, args: string[], format: string): Promise<void> {
  const tester = new Tester(projectRoot);
  const testsArg = getArgValue(args, '--tests');
  const tests = testsArg ? testsArg.split(',').map(t => t.trim()) : undefined;
  const suite = getArgValue(args, '--suite');

  console.log(`🧪 Running Apex unit tests...\n`);
  const result = await tester.runTests({ tests, suite });

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Outcome:          ${result.success ? 'Passed ✅' : 'Failed ❌'}`);
    console.log(`Tests Ran:        ${result.totalTests}`);
    console.log(`Passing:          ${result.passingTests}`);
    console.log(`Failing:          ${result.failingTests}`);
    console.log(`Org-wide Coverage: ${result.coveragePercent}%`);

    if (result.failures.length > 0) {
      console.log('\nFailures:');
      for (const fail of result.failures) {
        console.log(`🔴 [${fail.className}.${fail.methodName}] ${fail.message}`);
        if (fail.stackTrace) console.log(`   ${fail.stackTrace}`);
      }
      process.exit(1);
    }
  }
}

async function handleRunOrchestrator(projectRoot: string, docsRoot: string, args: string[], format: string): Promise<void> {
  const goal = getArgValue(args, '--goal');
  if (!goal) {
    console.error('Usage: forcekit run-orchestrator --goal <goal>');
    process.exit(1);
  }

  const config = await loadConfig(projectRoot);
  const engine = new AgentEngine({ projectRoot, docsRoot, configOverrides: config });
  const orchestrator = new OrchestratorController(engine);

  console.log(`🤖 Starting Orchestrator Delegation Loop...\n`);
  const result = await orchestrator.runOrchestration(goal);

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.success) {
      console.log(`✅ Orchestration loop completed successfully! Run ${result.tasksRun} tasks.`);
    } else {
      console.error(`❌ Orchestration failed: ${result.errors.join(', ')}`);
      process.exit(1);
    }
  }
}

// ─── Utilities ──────────────────────────────────────────────────

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function findAllFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  function walk(d: string): void {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory() && entry !== 'node_modules') {
        walk(full);
      } else if (/\.(cls|trigger|js)$/.test(entry)) {
        files.push(full);
      }
    }
  }

  walk(dir);
  return files;
}

async function handleMcp(projectRoot: string, docsRoot: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  const engine = new AgentEngine({ projectRoot, docsRoot, configOverrides: config });
  const { startMcpServer } = await import('../core/mcp.js');
  await startMcpServer(engine, projectRoot);
}

// ─── Run ────────────────────────────────────────────────────────

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
