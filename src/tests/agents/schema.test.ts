/**
 * Tests for ForceKit Agent Schema Validation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateAgentDefinition } from '../../agents/schema.js';

describe('Agent Schema Validation', () => {
  const validAgent = {
    name: 'test-agent',
    version: '1.0',
    description: 'A test agent for validating schema logic works correctly',
    capabilities: ['code_generation'],
    context: {
      required: ['rules.md'],
      optional: [],
    },
    tools: ['scan', 'lint'],
    constraints: {
      maxFiles: 5,
      requireTests: true,
    },
    lifecycle: {
      onStart: ['load_context'],
      onComplete: ['log_session_end'],
      onError: ['log_blocker'],
    },
    qualityGates: [
      { name: 'static-analysis-clean', required: true },
    ],
  };

  it('should accept a valid agent definition', () => {
    const errors = validateAgentDefinition(validAgent);
    assert.equal(errors.length, 0, `Expected no errors, got: ${errors.join(', ')}`);
  });

  it('should reject non-object input', () => {
    const errors = validateAgentDefinition('not an object');
    assert.ok(errors.length > 0);
    assert.ok(errors[0].includes('must be an object'));
  });

  it('should reject null input', () => {
    const errors = validateAgentDefinition(null);
    assert.ok(errors.length > 0);
  });

  it('should require all mandatory fields', () => {
    const errors = validateAgentDefinition({});
    assert.ok(errors.length >= 9, 'Should flag all 9 missing required fields');
  });

  it('should reject invalid name format', () => {
    const invalid = { ...validAgent, name: 'Invalid Name!' };
    const errors = validateAgentDefinition(invalid);
    assert.ok(errors.some((e) => e.includes('Invalid name')));
  });

  it('should reject PascalCase names', () => {
    const invalid = { ...validAgent, name: 'MyAgent' };
    const errors = validateAgentDefinition(invalid);
    assert.ok(errors.some((e) => e.includes('Invalid name')));
  });

  it('should accept kebab-case names', () => {
    const valid = { ...validAgent, name: 'my-agent' };
    const errors = validateAgentDefinition(valid);
    assert.equal(errors.length, 0);
  });

  it('should accept snake_case names', () => {
    const valid = { ...validAgent, name: 'my_agent' };
    const errors = validateAgentDefinition(valid);
    assert.equal(errors.length, 0);
  });

  it('should reject invalid version format', () => {
    const invalid = { ...validAgent, version: 'v1' };
    const errors = validateAgentDefinition(invalid);
    assert.ok(errors.some((e) => e.includes('Invalid version')));
  });

  it('should accept semver versions', () => {
    const v2 = { ...validAgent, version: '2.0.0' };
    const errors = validateAgentDefinition(v2);
    assert.equal(errors.length, 0);
  });

  it('should reject too-short descriptions', () => {
    const invalid = { ...validAgent, description: 'Short' };
    const errors = validateAgentDefinition(invalid);
    assert.ok(errors.some((e) => e.includes('at least 10 characters')));
  });

  it('should reject empty capabilities array', () => {
    const invalid = { ...validAgent, capabilities: [] };
    const errors = validateAgentDefinition(invalid);
    assert.ok(errors.some((e) => e.includes('at least one capability')));
  });

  it('should require lifecycle hook arrays', () => {
    const invalid = {
      ...validAgent,
      lifecycle: { onStart: 'not-an-array', onComplete: [], onError: [] },
    };
    const errors = validateAgentDefinition(invalid);
    assert.ok(errors.some((e) => e.includes('lifecycle.onStart')));
  });
});
