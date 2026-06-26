/**
 * ForceKit Apex Test Runner Tool
 *
 * Runs Salesforce Apex unit tests and retrieves coverage metrics using the sf CLI.
 */

import child_process from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool, ToolResult } from '../core/registry.js';
import type { ForceKitConfig } from '../config/defaults.js';

const execAsync = promisify(child_process.exec);

/**
 * Sanitize a string for safe shell interpolation.
 * Rejects values containing dangerous shell metacharacters.
 */
function sanitizeShellArg(value: string, paramName: string): string {
  if (/[;|&`$(){}!\n\r]/.test(value)) {
    throw new Error(`Invalid characters in '${paramName}': shell metacharacters are not allowed.`);
  }
  return value;
}

export interface TestResultSummary {
  success: boolean;
  totalTests: number;
  passingTests: number;
  failingTests: number;
  coveragePercent: number;
  failures: Array<{
    methodName: string;
    className: string;
    message: string;
    stackTrace: string;
  }>;
}

export class Tester {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Run sf apex run test
   */
  async runTests(options: {
    tests?: string[];
    suite?: string;
    targetOrg?: string;
  } = {}): Promise<TestResultSummary> {
    // Basic test command
    let cmd = 'sf apex run test --code-coverage --result-format json';

    if (options.targetOrg) {
      cmd += ` --target-org "${sanitizeShellArg(options.targetOrg, 'targetOrg')}"`;
    }

    if (options.tests && options.tests.length > 0) {
      cmd += ` --class-names ${options.tests.map(t => `"${sanitizeShellArg(t, 'testClass')}"`).join(' ')}`;
    } else if (options.suite) {
      cmd += ` --suite-names "${sanitizeShellArg(options.suite, 'suite')}"`;
    } else {
      cmd += ' --test-level RunLocalTests';
    }

    try {
      const { stdout } = await execAsync(cmd, { cwd: this.projectRoot });
      return this.parseTestOutput(stdout);
    } catch (error: any) {
      if (error.stdout) {
        try {
          return this.parseTestOutput(error.stdout);
        } catch {
          // Fall through
        }
      }
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        totalTests: 0,
        passingTests: 0,
        failingTests: 0,
        coveragePercent: 0,
        failures: [{ methodName: 'All', className: 'GlobalTestLevel', message: msg, stackTrace: '' }],
      };
    }
  }

  private parseTestOutput(stdout: string): TestResultSummary {
    const parsed = JSON.parse(stdout);
    const result = parsed.result || parsed;

    const summary = result.summary || {};
    const outcome = summary.outcome || 'Failed';
    const totalTests = summary.testsRan || 0;
    const passingTests = summary.passing || 0;
    const failingTests = summary.failing || 0;
    const coveragePercent = Math.round(summary.orgWideCoverage ? parseFloat(summary.orgWideCoverage.replace('%', '')) : 0);

    const failures: TestResultSummary['failures'] = [];
    const tests = result.tests || [];
    
    for (const test of tests) {
      if (test.Outcome === 'Fail') {
        failures.push({
          methodName: test.MethodName || 'Unknown',
          className: test.ApexClass?.Name || 'Unknown',
          message: test.Message || 'Test failed',
          stackTrace: test.StackTrace || '',
        });
      }
    }

    return {
      success: outcome === 'Passed' && failingTests === 0,
      totalTests,
      passingTests,
      failingTests,
      coveragePercent,
      failures,
    };
  }
}

/** Factory function to create the Tool representation */
export function createTesterTool(config: ForceKitConfig): Tool {
  return {
    name: 'test',
    description: 'Run Apex unit tests and retrieve code coverage',
    inputs: [
      { name: 'tests', type: 'string[]', required: false, description: 'Specific Apex test class names to execute' },
      { name: 'suite', type: 'string', required: false, description: 'Name of the Apex test suite to execute' },
      { name: 'targetOrg', type: 'string', required: false, description: 'Target Salesforce org alias override' },
    ],
    async execute(args): Promise<ToolResult> {
      const tester = new Tester(args.projectRoot as string || '.');
      try {
        const result = await tester.runTests({
          tests: args.tests as string[],
          suite: args.suite as string,
          targetOrg: args.targetOrg as string,
        });
        return {
          success: result.success,
          data: result,
          durationMs: 0,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        };
      }
    },
  };
}
