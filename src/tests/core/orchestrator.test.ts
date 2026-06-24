/**
 * Tests for ForceKit Orchestrator Controller
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentEngine } from '../../core/engine.js';
import { OrchestratorController } from '../../core/orchestrator.js';

describe('OrchestratorController', () => {
  let tempDir: string;
  let docsDir: string;
  let engine: AgentEngine;
  let orchestrator: OrchestratorController;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'forcekit-orch-test-'));
    docsDir = join(tempDir, 'forcekit');
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(join(docsDir, 'agents', 'definitions'), { recursive: true });

    // Mock agent definitions
    const dummyDev = `
name: developer
version: "1.0"
description: "developer agent"
capabilities: [code_generation]
context: { required: [] }
tools: [lint]
constraints: { maxFiles: 10 }
lifecycle: { onStart: [], onComplete: [], onError: [] }
qualityGates: []
`;
    const dummyOrch = `
name: orchestrator
version: "1.0"
description: "orchestrator agent"
capabilities: [orchestration]
context: { required: [] }
tools: []
constraints: { maxFiles: 10 }
lifecycle: { onStart: [], onComplete: [], onError: [] }
qualityGates: []
`;
    const dummyReviewer = `
name: reviewer
version: "1.0"
description: "reviewer agent"
capabilities: [code_review]
context: { required: [] }
tools: [lint]
constraints: { maxFiles: 10 }
lifecycle: { onStart: [], onComplete: [], onError: [] }
qualityGates: []
`;
    const dummyQA = `
name: qa
version: "1.0"
description: "qa agent"
capabilities: [test_execution]
context: { required: [] }
tools: [test]
constraints: { maxFiles: 10 }
lifecycle: { onStart: [], onComplete: [], onError: [] }
qualityGates: []
`;
    const dummyResearcher = `
name: researcher
version: "1.0"
description: "researcher agent"
capabilities: [doc_lookup]
context: { required: [] }
tools: [web-search]
constraints: { maxFiles: 5 }
lifecycle: { onStart: [], onComplete: [], onError: [] }
qualityGates: []
`;

    // Write definitions to mock docs directory
    writeFileSync(join(docsDir, 'agents', 'definitions', 'developer.yaml'), dummyDev);
    writeFileSync(join(docsDir, 'agents', 'definitions', 'orchestrator.yaml'), dummyOrch);
    writeFileSync(join(docsDir, 'agents', 'definitions', 'reviewer.yaml'), dummyReviewer);
    writeFileSync(join(docsDir, 'agents', 'definitions', 'qa.yaml'), dummyQA);
    writeFileSync(join(docsDir, 'agents', 'definitions', 'researcher.yaml'), dummyResearcher);

    engine = new AgentEngine({ projectRoot: tempDir, docsRoot: docsDir });

    // Stub the test, lint, and web-search tools to avoid external queries during test run
    engine.tools.unregister('lint');
    engine.tools.unregister('test');
    engine.tools.unregister('web-search');
    engine.tools.register({
      name: 'lint',
      description: 'mock lint',
      inputs: [],
      execute: async () => ({ success: true, durationMs: 0 }),
    });
    engine.tools.register({
      name: 'test',
      description: 'mock test',
      inputs: [],
      execute: async () => ({ success: true, durationMs: 0 }),
    });
    engine.tools.register({
      name: 'web-search',
      description: 'mock web-search',
      inputs: [],
      execute: async () => ({
        success: true,
        data: { results: [{ title: 'Doc', url: 'http', snippet: 'Text' }] },
        durationMs: 0
      }),
    });

    orchestrator = new OrchestratorController(engine);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should run orchestration loop completely and report success', async () => {
    const result = await orchestrator.runOrchestration('Create Account utility helper');
    assert.ok(result.success);
    assert.equal(result.tasksRun, 4);
    assert.equal(result.errors.length, 0);

    // Verify tasks are logged in state
    const completedTasks = engine.state.getTasksByStatus('completed');
    assert.equal(completedTasks.length, 4);
  });
});
