import { describe, it, beforeEach, afterEach, after, before } from 'node:test';
import assert from 'node:assert/strict';
import child_process from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Setup mock for exec before loading tester
let mockExecResponse = { stdout: '{}', stderr: '' };
const originalExec = child_process.exec;
(child_process as any).exec = function(cmd: string, options: any, callback: any) {
  const cb = typeof options === 'function' ? options : callback;
  cb(null, mockExecResponse);
};

import type { Tester } from '../../tools/tester.js';

let TesterClass: any;

before(async () => {
  const mod = await import('../../tools/tester.js');
  TesterClass = mod.Tester;
});

describe('Tester Tool', () => {
  let tempDir: string;
  let tester: Tester;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'forcekit-tester-test-'));
    tester = new TesterClass(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should run tests successfully and parse output', async () => {
    mockExecResponse = {
      stdout: JSON.stringify({
        status: 0,
        result: {
          summary: {
            outcome: 'Passed',
            testsRan: 3,
            passing: 3,
            failing: 0,
            orgWideCoverage: '92%',
          },
          tests: [
            { MethodName: 'testOne', Outcome: 'Pass', ApexClass: { Name: 'MyClassTest' } },
          ],
        },
      }),
      stderr: '',
    };

    const res = await tester.runTests({ tests: ['MyClassTest'] });
    assert.ok(res.success);
    assert.equal(res.totalTests, 3);
    assert.equal(res.coveragePercent, 92);
    assert.equal(res.failures.length, 0);
  });

  it('should report failing tests', async () => {
    mockExecResponse = {
      stdout: JSON.stringify({
        status: 0,
        result: {
          summary: {
            outcome: 'Failed',
            testsRan: 2,
            passing: 1,
            failing: 1,
            orgWideCoverage: '45%',
          },
          tests: [
            {
              MethodName: 'testFail',
              Outcome: 'Fail',
              Message: 'System.AssertException: Expected true, got false',
              StackTrace: 'Class.MyClassTest.testFail: line 10',
              ApexClass: { Name: 'MyClassTest' },
            },
          ],
        },
      }),
      stderr: '',
    };

    const res = await tester.runTests({ tests: ['MyClassTest'] });
    assert.ok(!res.success);
    assert.equal(res.failingTests, 1);
    assert.equal(res.failures[0].methodName, 'testFail');
    assert.equal(res.failures[0].message, 'System.AssertException: Expected true, got false');
  });
});

after(() => {
  (child_process as any).exec = originalExec;
});
