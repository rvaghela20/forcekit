import { describe, it, beforeEach, afterEach, after, before } from 'node:test';
import assert from 'node:assert/strict';
import child_process from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Setup mock for exec before loading deployer
let mockExecResponse = { stdout: '{}', stderr: '' };
const originalExec = child_process.exec;
let execImpl = function(cmd: string, options: any, callback: any) {
  const cb = typeof options === 'function' ? options : callback;
  cb(null, mockExecResponse);
};
(child_process as any).exec = function(cmd: string, options: any, callback: any) {
  return execImpl(cmd, options, callback);
};

import type { Deployer } from '../../tools/deployer.js';

let DeployerClass: any;

before(async () => {
  const mod = await import('../../tools/deployer.js');
  DeployerClass = mod.Deployer;
});

describe('Deployer Tool', () => {
  let tempDir: string;
  let deployer: Deployer;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'forcekit-deployer-test-'));
    deployer = new DeployerClass(tempDir);
    execImpl = function(cmd: string, options: any, callback: any) {
      const cb = typeof options === 'function' ? options : callback;
      cb(null, mockExecResponse);
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should run deploy command successfully', async () => {
    mockExecResponse = {
      stdout: JSON.stringify({
        status: 0,
        result: {
          success: true,
          deployedSource: [{ fullName: 'MyClass', type: 'ApexClass' }],
        },
      }),
      stderr: '',
    };

    const res = await deployer.deploy({ metadata: 'ApexClass:MyClass' });
    assert.ok(res.success);
    assert.equal(res.details.deployedSource[0].fullName, 'MyClass');
  });

  it('should handle deploy failure with compilation details', async () => {
    mockExecResponse = {
      stdout: JSON.stringify({
        status: 1,
        result: {
          success: false,
          error: 'Compile error on Line 5',
        },
      }),
      stderr: 'Deployment failed.',
    };

    // Simulate error throw in execution
    execImpl = function(cmd: string, options: any, callback: any) {
      const cb = typeof options === 'function' ? options : callback;
      const err = new Error('Command failed');
      (err as any).stdout = mockExecResponse.stdout;
      cb(err, mockExecResponse);
    };

    const res = await deployer.deploy({ metadata: 'ApexClass:MyClass' });
    assert.ok(!res.success);
    assert.equal(res.details.error, 'Compile error on Line 5');
  });
});

after(() => {
  (child_process as any).exec = originalExec;
});
