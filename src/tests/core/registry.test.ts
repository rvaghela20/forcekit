/**
 * Tests for ForceKit Registry
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ToolRegistry, PluginRegistry } from '../../core/registry.js';
import type { Tool, Plugin } from '../../core/registry.js';
import { EventBus } from '../../core/events.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  const mockTool: Tool = {
    name: 'test-tool',
    description: 'A test tool',
    inputs: [
      { name: 'input1', type: 'string', required: true, description: 'Required input' },
      { name: 'input2', type: 'number', required: false, description: 'Optional input', default: 42 },
    ],
    execute: async (args) => ({
      success: true,
      data: { received: args },
      durationMs: 0,
    }),
  };

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register and retrieve a tool', () => {
    registry.register(mockTool);
    assert.ok(registry.has('test-tool'));
    assert.equal(registry.get('test-tool')?.name, 'test-tool');
  });

  it('should list all tools', () => {
    registry.register(mockTool);
    const tools = registry.list();
    assert.equal(tools.length, 1);
  });

  it('should reject duplicate registrations', () => {
    registry.register(mockTool);
    assert.throws(() => registry.register(mockTool), /already registered/);
  });

  it('should invoke a tool successfully', async () => {
    registry.register(mockTool);
    const result = await registry.invoke('test-tool', { input1: 'hello' });
    assert.ok(result.success);
    assert.ok(result.data);
  });

  it('should fail when invoking missing tool', async () => {
    const result = await registry.invoke('nonexistent');
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('not found'));
  });

  it('should fail when missing required input', async () => {
    registry.register(mockTool);
    const result = await registry.invoke('test-tool', {});
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('Missing required input'));
  });

  it('should apply default values', async () => {
    registry.register(mockTool);
    const result = await registry.invoke('test-tool', { input1: 'hello' });
    assert.ok(result.success);
  });

  it('should unregister a tool', () => {
    registry.register(mockTool);
    assert.ok(registry.unregister('test-tool'));
    assert.equal(registry.has('test-tool'), false);
  });

  it('should emit events on invoke', async () => {
    const events = new EventBus();
    const eventRegistry = new ToolRegistry(events);
    eventRegistry.register(mockTool);

    let invoked = false;
    events.on('tool:invoke', () => { invoked = true; });

    await eventRegistry.invoke('test-tool', { input1: 'hello' });
    assert.ok(invoked, 'Should emit tool:invoke event');
  });
});

describe('PluginRegistry', () => {
  let toolRegistry: ToolRegistry;
  let pluginRegistry: PluginRegistry;

  const mockPlugin: Plugin = {
    name: 'test-plugin',
    version: '1.0.0',
    description: 'A test plugin',
    hooks: {
      onAgentStart: async (ctx) => {
        // Hook logic
      },
    },
    tools: [],
    lintRules: [],
    qualityGates: [
      {
        name: 'test-gate',
        description: 'A test quality gate',
        check: async () => ({ passed: true, message: 'All good' }),
      },
    ],
  };

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    pluginRegistry = new PluginRegistry(toolRegistry);
  });

  it('should register a plugin', () => {
    pluginRegistry.register(mockPlugin);
    assert.ok(pluginRegistry.get('test-plugin'));
  });

  it('should reject duplicate plugins', () => {
    pluginRegistry.register(mockPlugin);
    assert.throws(() => pluginRegistry.register(mockPlugin), /already registered/);
  });

  it('should collect quality gates from plugins', () => {
    pluginRegistry.register(mockPlugin);
    const gates = pluginRegistry.collectQualityGates();
    assert.equal(gates.length, 1);
    assert.equal(gates[0].name, 'test-gate');
  });

  it('should run pre-commit hooks', async () => {
    const plugin: Plugin = {
      ...mockPlugin,
      name: 'blocking-plugin',
      hooks: {
        onPreCommit: async () => ({ approved: false, reason: 'Blocked for testing' }),
      },
    };

    pluginRegistry.register(plugin);
    const result = await pluginRegistry.runPreCommitHooks(['file1.cls']);
    assert.equal(result.approved, false);
    assert.ok(result.reasons[0].includes('Blocked for testing'));
  });
});
