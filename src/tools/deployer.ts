/**
 * ForceKit Metadata Deployer Tool
 *
 * Deploys Salesforce metadata (classes, triggers, components) to the target org
 * using the sf CLI.
 */

import child_process from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool, ToolResult } from '../core/registry.js';
import type { ForceKitConfig } from '../config/defaults.js';

const execAsync = promisify(child_process.exec);

export class Deployer {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Run sf project deploy start
   */
  async deploy(options: {
    metadata?: string;
    sourceDirs?: string[];
    targetOrg?: string;
  } = {}): Promise<{ success: boolean; details: any }> {
    let cmd = 'sf project deploy start --json';

    if (options.targetOrg) {
      cmd += ` --target-org "${options.targetOrg}"`;
    }
    if (options.metadata) {
      cmd += ` --metadata "${options.metadata}"`;
    }
    if (options.sourceDirs && options.sourceDirs.length > 0) {
      cmd += ` --source-dir ${options.sourceDirs.map(d => `"${d}"`).join(' ')}`;
    }

    try {
      const { stdout } = await execAsync(cmd, { cwd: this.projectRoot });
      const parsed = JSON.parse(stdout);
      
      const success = parsed.status === 0 || parsed.result?.success === true;
      return { success, details: parsed.result || parsed };
    } catch (error: any) {
      // In case deployment fails, JSON output might still contain detailed compile errors
      if (error.stdout) {
        try {
          const parsed = JSON.parse(error.stdout);
          return { success: false, details: parsed.result || parsed };
        } catch {
          // Fall through to plain error
        }
      }
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, details: { error: msg } };
    }
  }
}

/** Factory function to create the Tool representation */
export function createDeployerTool(config: ForceKitConfig): Tool {
  return {
    name: 'deploy',
    description: 'Deploy Salesforce metadata/components to the target org',
    inputs: [
      { name: 'metadata', type: 'string', required: false, description: "Specific metadata pattern to deploy (e.g., 'ApexClass:MyService')" },
      { name: 'sourceDirs', type: 'string[]', required: false, description: 'List of folders or files to deploy' },
      { name: 'targetOrg', type: 'string', required: false, description: 'Target Salesforce org alias override' },
    ],
    async execute(args): Promise<ToolResult> {
      const deployer = new Deployer(args.projectRoot as string || '.');
      try {
        const result = await deployer.deploy({
          metadata: args.metadata as string,
          sourceDirs: args.sourceDirs as string[],
          targetOrg: args.targetOrg as string,
        });
        return {
          success: result.success,
          data: result.details,
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
