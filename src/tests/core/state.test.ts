/**
 * Tests for ForceKit State Manager
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ForceKitState } from '../../core/state.js';

describe('ForceKitState', () => {
  let tempDir: string;
  let state: ForceKitState;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'forcekit-test-'));
    state = new ForceKitState(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Sessions', () => {
    it('should start a session', () => {
      const session = state.startSession('test-agent', 'Build feature X');

      assert.ok(session.id);
      assert.equal(session.agent, 'test-agent');
      assert.equal(session.goal, 'Build feature X');
      assert.equal(session.status, 'active');
    });

    it('should end an active session', () => {
      state.startSession('test-agent', 'Build feature X');
      const ended = state.endSession('Completed feature X', ['file1.cls', 'file2.cls']);

      assert.ok(ended);
      assert.equal(ended!.status, 'completed');
      assert.equal(ended!.summary, 'Completed feature X');
      assert.deepEqual(ended!.filesChanged, ['file1.cls', 'file2.cls']);
    });

    it('should return null when ending with no active session', () => {
      const result = state.endSession('Nothing to end');
      assert.equal(result, null);
    });

    it('should get recent sessions', () => {
      state.startSession('agent-1', 'Goal 1');
      state.endSession('Done 1');
      state.startSession('agent-2', 'Goal 2');

      const recent = state.getRecentSessions(5);
      assert.equal(recent.length, 2);
      assert.equal(recent[0].agent, 'agent-2'); // Most recent first
    });
  });

  describe('Tasks', () => {
    it('should add a task', () => {
      const task = state.addTask('Implement AccountService', 'P0');

      assert.ok(task.id);
      assert.equal(task.description, 'Implement AccountService');
      assert.equal(task.priority, 'P0');
      assert.equal(task.status, 'upcoming');
    });

    it('should transition task through lifecycle', () => {
      const task = state.addTask('Build selector', 'P1');
      assert.equal(task.status, 'upcoming');

      const started = state.startTask(task.id, 'feature/selector');
      assert.ok(started);
      assert.equal(started!.status, 'in_progress');
      assert.equal(started!.branch, 'feature/selector');

      const completed = state.completeTask(task.id, ['Selector.cls']);
      assert.ok(completed);
      assert.equal(completed!.status, 'completed');
      assert.deepEqual(completed!.filesChanged, ['Selector.cls']);
    });

    it('should filter tasks by status', () => {
      state.addTask('Task 1', 'P0');
      const task2 = state.addTask('Task 2', 'P1');
      state.startTask(task2.id);
      state.addTask('Task 3', 'P2');

      assert.equal(state.getTasksByStatus('upcoming').length, 2);
      assert.equal(state.getTasksByStatus('in_progress').length, 1);
    });
  });

  describe('Decisions', () => {
    it('should log a decision', () => {
      const decision = state.logDecision(
        'Use Queueable over Batch',
        'Record count is low and we need chaining'
      );

      assert.ok(decision.id);
      assert.equal(decision.decision, 'Use Queueable over Batch');
    });
  });

  describe('Blockers', () => {
    it('should add and resolve a blocker', () => {
      const blocker = state.addBlocker('API limit reached', 'Cannot deploy', 'High');
      assert.ok(blocker.id);

      const snapshot = state.getSnapshot();
      assert.equal(snapshot.projectStatus, 'blocked');

      state.resolveBlocker(blocker.id);
      const after = state.getSnapshot();
      assert.equal(after.projectStatus, 'on_track');
    });

    it('should list active blockers', () => {
      state.addBlocker('Blocker 1', 'Impact 1', 'Medium');
      const b2 = state.addBlocker('Blocker 2', 'Impact 2', 'Low');
      state.resolveBlocker(b2.id);

      assert.equal(state.getActiveBlockers().length, 1);
    });
  });

  describe('Inventory', () => {
    it('should register and retrieve metadata', () => {
      state.registerMetadata('classes', {
        name: 'AccountService',
        type: 'Apex Class',
        layer: 'Service',
      });

      const classes = state.getInventory('classes') as Array<{ name: string }>;
      assert.equal(classes.length, 1);
      assert.equal(classes[0].name, 'AccountService');
    });

    it('should update existing metadata', () => {
      state.registerMetadata('classes', { name: 'AccountService', type: 'Apex Class' });
      state.registerMetadata('classes', { name: 'AccountService', type: 'Apex Class', layer: 'Service' });

      const classes = state.getInventory('classes') as Array<{ name: string; layer?: string }>;
      assert.equal(classes.length, 1);
      assert.equal(classes[0].layer, 'Service');
    });

    it('should remove metadata', () => {
      state.registerMetadata('classes', { name: 'OldClass', type: 'Apex Class' });
      assert.ok(state.removeMetadata('classes', 'OldClass'));
      assert.equal((state.getInventory('classes') as unknown[]).length, 0);
    });
  });

  describe('Persistence', () => {
    it('should persist state to disk', () => {
      state.startSession('agent', 'test persistence');
      state.save();

      const statePath = join(tempDir, '.forcekit', 'state.json');
      assert.ok(existsSync(statePath));

      const raw = readFileSync(statePath, 'utf-8');
      const data = JSON.parse(raw);
      assert.equal(data.sessions[0].agent, 'agent');
    });

    it('should reload state from disk', () => {
      state.startSession('agent', 'test reload');
      state.addTask('Task 1', 'P0');
      state.save();

      const state2 = new ForceKitState(tempDir);
      const snapshot = state2.getSnapshot();
      assert.equal(snapshot.sessions.length, 1);
      assert.equal(snapshot.tasks.length, 1);
    });
  });

  describe('Markdown Rendering', () => {
    it('should render current state to markdown', () => {
      state.startSession('claude', 'Test rendering');
      state.addTask('Build something', 'P1');
      state.addBlocker('API down', 'Cannot test', 'High');

      const md = state.renderCurrentStateMarkdown();

      assert.ok(md.includes('# Current State'));
      assert.ok(md.includes('claude'));
      assert.ok(md.includes('Build something'));
      assert.ok(md.includes('API down'));
    });

    it('should render inventory to markdown', () => {
      state.registerMetadata('classes', { name: 'AccountService', type: 'Apex Class', layer: 'Service' });

      const md = state.renderInventoryMarkdown();

      assert.ok(md.includes('# Metadata Inventory'));
      assert.ok(md.includes('AccountService'));
    });
  });
});
