/**
 * Tests for ForceKit Verifier
 */

import { describe, it, beforeEach, afterEach, after, before } from 'node:test';
import assert from 'node:assert/strict';
import child_process from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Setup mock for exec before loading verifier
let mockExecResponse = { stdout: '{}', stderr: '' };
const originalExec = child_process.exec;
(child_process as any).exec = function(cmd: string, options: any, callback: any) {
  const cb = typeof options === 'function' ? options : callback;
  cb(null, mockExecResponse);
};

import type { Verifier } from '../../tools/verifier.js';

let VerifierClass: any;

before(async () => {
  const mod = await import('../../tools/verifier.js');
  VerifierClass = mod.Verifier;
});

describe('Verifier Tool', () => {
  let tempDir: string;
  let verifier: Verifier;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'forcekit-verifier-test-'));
    verifier = new VerifierClass(tempDir);
    mkdirSync(join(tempDir, 'forcekit'), { recursive: true });
    writeFileSync(
      join(tempDir, 'forcekit', 'org-context.md'),
      '| Default target org | --target-org testOrg |'
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should verify Apex class metadata and cache it', async () => {
    mockExecResponse = {
      stdout: JSON.stringify({
        status: 0,
        result: {
          records: [{ Name: 'MyService', Status: 'Active' }],
        },
      }),
      stderr: '',
    };

    const res = await verifier.verify('class', 'MyService', undefined, { force: true });
    assert.ok(res.exists);
    assert.equal(res.entry?.status, 'Active');

    // Cache lookup should now hit
    mockExecResponse = { stdout: '{}', stderr: '' }; // Clean CLI query mock to prove it hits cache
    const cachedRes = await verifier.verify('class', 'MyService');
    assert.ok(cachedRes.exists);
    assert.equal(cachedRes.entry?.status, 'Active');
  });

  it('should verify Custom Field metadata and cache it', async () => {
    mockExecResponse = {
      stdout: JSON.stringify({
        status: 0,
        result: {
          records: [{ QualifiedApiName: 'MyField__c', DataType: 'Text(255)', Label: 'My Field' }],
        },
      }),
      stderr: '',
    };

    const res = await verifier.verify('field', 'MyField__c', 'Account', { force: true });
    assert.ok(res.exists);
    assert.equal(res.entry?.dataType, 'Text(255)');
  });

  it('should sync org limits successfully', async () => {
    mockExecResponse = {
      stdout: JSON.stringify({
        status: 0,
        result: [
          { name: 'DailyApiRequests', max: 15000, remaining: 10000 },
          { name: 'DataStorageMB', max: 5, remaining: 4 },
        ],
      }),
      stderr: '',
    };

    const syncRes = await verifier.syncOrg();
    assert.equal(syncRes.limits.DailyApiRequests.current, 5000);
    assert.equal(syncRes.limits.DailyApiRequests.max, 15000);
    assert.equal(syncRes.limits.DataStorageMB.current, 1);
  });
});

after(() => {
  (child_process as any).exec = originalExec;
});
