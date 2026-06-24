/**
 * ForceKit Metadata Verifier Tool
 *
 * Verifies Salesforce metadata existence (objects, fields, classes, flows)
 * by querying the target org using the sf CLI and caching the results locally.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import child_process from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool, ToolResult } from '../core/registry.js';
import type { ForceKitConfig } from '../config/defaults.js';

const execAsync = promisify(child_process.exec);

export interface VerificationEntry {
  verified: boolean;
  verifiedAt: string;
  dataType?: string;
  status?: string;
  label?: string;
}

export type CacheCategory = 'objects' | 'fields' | 'classes' | 'flows';

export class Verifier {
  private cacheDir: string;
  private projectRoot: string;

  constructor(projectRoot: string, cacheDir: string = '.forcekit/cache') {
    this.projectRoot = projectRoot;
    this.cacheDir = join(projectRoot, cacheDir);
  }

  /**
   * Reads a category cache from disk.
   */
  private readCache(category: CacheCategory): Record<string, VerificationEntry> {
    const cachePath = join(this.cacheDir, `${category}.json`);
    if (existsSync(cachePath)) {
      try {
        return JSON.parse(readFileSync(cachePath, 'utf-8'));
      } catch {
        return {};
      }
    }
    return {};
  }

  /**
   * Writes a category cache to disk.
   */
  private writeCache(category: CacheCategory, data: Record<string, VerificationEntry>): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
    const cachePath = join(this.cacheDir, `${category}.json`);
    writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Verify metadata item existence
   */
  async verify(
    type: 'object' | 'field' | 'class' | 'flow',
    name: string,
    objName?: string,
    options: { force?: boolean; targetOrg?: string } = {}
  ): Promise<{ exists: boolean; entry?: VerificationEntry }> {
    const categoryMap: Record<string, CacheCategory> = {
      object: 'objects',
      field: 'fields',
      class: 'classes',
      flow: 'flows',
    };

    const category = categoryMap[type];
    if (!category) {
      throw new Error(`Invalid metadata type: ${type}`);
    }

    if (type === 'field' && !objName) {
      throw new Error("Object name is required when type is 'field'");
    }

    const cacheKey = type === 'field' ? `${objName}.${name}` : name;

    // 1. Check cache first
    if (!options.force) {
      const cache = this.readCache(category);
      if (cacheKey in cache) {
        return { exists: cache[cacheKey].verified, entry: cache[cacheKey] };
      }
    }

    // 2. Fetch target org alias
    const org = options.targetOrg || this.getDefaultOrg();
    if (!org) {
      throw new Error("Target org not specified. Update forcekit/org-context.md or configure default org.");
    }

    // 3. Build Tooling API SOQL query
    let query = '';
    if (type === 'object') {
      query = `SELECT QualifiedApiName, Label FROM EntityDefinition WHERE QualifiedApiName = '${name}'`;
    } else if (type === 'field') {
      query = `SELECT QualifiedApiName, DataType, Label FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objName}' AND QualifiedApiName = '${name}'`;
    } else if (type === 'class') {
      query = `SELECT Name, Status FROM ApexClass WHERE Name = '${name}'`;
    } else if (type === 'flow') {
      query = `SELECT DeveloperName, Status FROM FlowDefinitionView WHERE DeveloperName = '${name}'`;
    }

    const cmd = `sf data query --query "${query}" --target-org "${org}" --use-tooling-api --json`;

    try {
      const { stdout } = await execAsync(cmd, { cwd: this.projectRoot });
      const parsed = JSON.parse(stdout);
      const records = parsed.result?.records || [];
      const exists = records.length > 0;

      const entry: VerificationEntry = {
        verified: exists,
        verifiedAt: new Date().toISOString(),
      };

      if (exists) {
        const record = records[0];
        if (type === 'field') {
          entry.dataType = record.DataType || 'Unknown';
          entry.label = record.Label || name;
        } else if (type === 'class') {
          entry.status = record.Status || 'Unknown';
        } else if (type === 'object') {
          entry.label = record.Label || name;
        }
      }

      // Update cache
      const cache = this.readCache(category);
      cache[cacheKey] = entry;
      this.writeCache(category, cache);

      return { exists, entry };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Salesforce CLI query failed: ${msg}. Make sure you are logged into org '${org}'.`);
    }
  }

  /**
   * Pre-caches Salesforce schema (standard & custom objects, standard & custom fields) in bulk.
   */
  async cacheSchema(options: { targetOrg?: string } = {}): Promise<{ totalObjects: number; totalFields: number }> {
    const org = options.targetOrg || this.getDefaultOrg();
    if (!org) {
      throw new Error("Target org not specified.");
    }

    const objectsQueries = [
      "SELECT QualifiedApiName, Label FROM EntityDefinition WHERE QualifiedApiName LIKE '%__c'",
      "SELECT QualifiedApiName, Label FROM EntityDefinition WHERE QualifiedApiName IN ('Account', 'Contact', 'Opportunity', 'Lead', 'Case', 'User')"
    ];

    let totalObjects = 0;
    const objectsCache = this.readCache('objects');

    for (const query of objectsQueries) {
      const cmd = `sf data query --query "${query}" --target-org "${org}" --use-tooling-api --json`;
      try {
        const { stdout } = await execAsync(cmd, { cwd: this.projectRoot });
        const parsed = JSON.parse(stdout);
        const records = parsed.result?.records || [];
        for (const r of records) {
          const name = r.QualifiedApiName;
          if (name) {
            objectsCache[name] = {
              verified: true,
              verifiedAt: new Date().toISOString(),
              label: r.Label || name,
            };
            totalObjects++;
          }
        }
      } catch (e) {
        console.warn(`[ForceKit] Cache query failed: ${query}`, e);
      }
    }
    this.writeCache('objects', objectsCache);

    const fieldsQueries = [
      "SELECT EntityDefinition.QualifiedApiName, QualifiedApiName, DataType, Label FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName LIKE '%__c'",
      "SELECT EntityDefinition.QualifiedApiName, QualifiedApiName, DataType, Label FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName IN ('Account', 'Contact', 'Opportunity', 'Lead', 'Case')"
    ];

    let totalFields = 0;
    const fieldsCache = this.readCache('fields');

    for (const query of fieldsQueries) {
      const cmd = `sf data query --query "${query}" --target-org "${org}" --use-tooling-api --json`;
      try {
        const { stdout } = await execAsync(cmd, { cwd: this.projectRoot });
        const parsed = JSON.parse(stdout);
        const records = parsed.result?.records || [];
        for (const r of records) {
          const objName = r.EntityDefinition?.QualifiedApiName;
          const fieldName = r.QualifiedApiName;
          if (objName && fieldName) {
            fieldsCache[`${objName}.${fieldName}`] = {
              verified: true,
              verifiedAt: new Date().toISOString(),
              dataType: r.DataType || 'Unknown',
              label: r.Label || fieldName,
            };
            totalFields++;
          }
        }
      } catch (e) {
        console.warn(`[ForceKit] Cache query failed: ${query}`, e);
      }
    }
    this.writeCache('fields', fieldsCache);

    return { totalObjects, totalFields };
  }

  /**
   * Synchronizes active org details and DailyApiRequests, DataStorageMB, FileStorageMB limits
   */
  async syncOrg(options: { targetOrg?: string } = {}): Promise<{
    alias: string;
    username: string;
    orgId: string;
    instanceUrl: string;
    limits: { DailyApiRequests: any; DataStorageMB: any; FileStorageMB: any };
  }> {
    const org = options.targetOrg || this.getDefaultOrg();
    if (!org) {
      throw new Error("Target org not specified.");
    }

    // 1. Get org display details
    const cmdDisplay = `sf org display --target-org "${org}" --json`;
    let alias = org;
    let username = 'Unknown';
    let orgId = 'Unknown';
    let instanceUrl = '';

    try {
      const { stdout } = await execAsync(cmdDisplay, { cwd: this.projectRoot });
      const parsed = JSON.parse(stdout);
      const result = parsed.result || {};
      alias = result.alias || org;
      username = result.username || 'Unknown';
      orgId = result.id || 'Unknown';
      instanceUrl = result.instanceUrl || '';
    } catch (e) {
      console.warn('[ForceKit] sf org display failed, falling back to query defaults', e);
    }

    // 2. Fetch limits
    const cmdLimits = `sf limits api display --target-org "${org}" --json`;
    const limits = {
      DailyApiRequests: { current: 0, max: 15000 },
      DataStorageMB: { current: 0, max: 5 },
      FileStorageMB: { current: 0, max: 20 },
    };

    try {
      const { stdout } = await execAsync(cmdLimits, { cwd: this.projectRoot });
      const parsed = JSON.parse(stdout);
      const records = parsed.result || [];
      for (const item of records) {
        if (item.name === 'DailyApiRequests') {
          limits.DailyApiRequests = {
            current: item.max - item.remaining,
            max: item.max,
          };
        } else if (item.name === 'DataStorageMB') {
          limits.DataStorageMB = {
            current: item.max - item.remaining,
            max: item.max,
          };
        } else if (item.name === 'FileStorageMB') {
          limits.FileStorageMB = {
            current: item.max - item.remaining,
            max: item.max,
          };
        }
      }
    } catch (e) {
      console.warn('[ForceKit] sf limits api display failed', e);
    }

    return { alias, username, orgId, instanceUrl, limits };
  }

  /**
   * Helper to fetch default org from local org-context file or sf CLI
   */
  private getDefaultOrg(): string | null {
    // Check org-context.md or org-context.local.md in projectRoot/forcekit/
    const docsDir = join(this.projectRoot, 'forcekit');
    const localContextPath = join(docsDir, 'org-context.local.md');
    const defaultContextPath = join(docsDir, 'org-context.md');

    let content = '';
    if (existsSync(localContextPath)) {
      content = readFileSync(localContextPath, 'utf-8');
    } else if (existsSync(defaultContextPath)) {
      content = readFileSync(defaultContextPath, 'utf-8');
    }

    if (content) {
      // Find row like "| Default target org | --target-org <alias> |"
      const match = content.match(/Default target org\s*\|\s*--target-org\s+([^\s|]+)/i);
      if (match && match[1]) {
        return match[1].replace(/`/g, '').trim();
      }
    }

    return null;
  }
}

/** Factory function to create the Tool representation */
export function createVerifierTool(config: ForceKitConfig): Tool {
  return {
    name: 'verify',
    description: 'Verify if a Salesforce metadata item exists in the target org',
    inputs: [
      { name: 'type', type: 'string', required: true, description: "Type: 'object', 'field', 'class', 'flow'" },
      { name: 'name', type: 'string', required: true, description: 'API name of the metadata item' },
      { name: 'object', type: 'string', required: false, description: "Parent object API name (required for 'field')" },
      { name: 'force', type: 'boolean', required: false, description: 'Skip cache and force query' },
      { name: 'targetOrg', type: 'string', required: false, description: 'Target Salesforce org alias override' },
    ],
    async execute(args): Promise<ToolResult> {
      const verifier = new Verifier(args.projectRoot as string || '.', config.paths.cacheDir);
      try {
        const result = await verifier.verify(
          args.type as any,
          args.name as string,
          args.object as string,
          { force: args.force as boolean, targetOrg: args.targetOrg as string }
        );
        return {
          success: result.exists,
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
