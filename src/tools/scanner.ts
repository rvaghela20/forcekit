/**
 * ForceKit Scanner Tool
 *
 * Scans the force-app directory and catalogs all Salesforce metadata
 * into the state manager's inventory. Reimplements update_state.py scan.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Tool, ToolResult } from '../core/registry.js';
import type { ForceKitState, InventoryItem } from '../core/state.js';

// ─── Types ──────────────────────────────────────────────────────

export interface ScanResult {
  objects: InventoryItem[];
  classes: InventoryItem[];
  lwcComponents: InventoryItem[];
  flows: InventoryItem[];
  triggers: InventoryItem[];
  permissionSets: InventoryItem[];
  totalItems: number;
}

// ─── Scanner ────────────────────────────────────────────────────

export class Scanner {
  private projectRoot: string;
  private forceAppPath: string;

  constructor(projectRoot: string, forceAppRelative: string = 'force-app') {
    this.projectRoot = projectRoot;
    this.forceAppPath = join(projectRoot, forceAppRelative);
  }

  /** Run a full inventory scan */
  scan(): ScanResult {
    if (!existsSync(this.forceAppPath)) {
      throw new Error(`force-app directory not found at ${this.forceAppPath}`);
    }

    const objects = this.scanObjects();
    const classes = this.scanClasses();
    const lwcComponents = this.scanLWC();
    const flows = this.scanFlows();
    const triggers = this.scanTriggers();
    const permissionSets = this.scanPermissionSets();

    return {
      objects,
      classes,
      lwcComponents,
      flows,
      triggers,
      permissionSets,
      totalItems: objects.length + classes.length + lwcComponents.length +
        flows.length + triggers.length + permissionSets.length,
    };
  }

  /** Apply scan results to the state manager */
  applyToState(state: ForceKitState, result: ScanResult): void {
    state.batch(() => {
      for (const item of result.objects) {
        state.registerMetadata('objects', item);
      }
      for (const item of result.classes) {
        state.registerMetadata('classes', item);
      }
      for (const item of result.lwcComponents) {
        state.registerMetadata('lwcComponents', item);
      }
      for (const item of result.flows) {
        state.registerMetadata('flows', item);
      }
      for (const item of result.triggers) {
        state.registerMetadata('triggers', item);
      }
      for (const item of result.permissionSets) {
        state.registerMetadata('permissionSets', item);
      }
    });
  }

  // ─── Individual Scanners ──────────────────────────────────────

  private scanObjects(): InventoryItem[] {
    const objectsPath = join(this.forceAppPath, 'main', 'default', 'objects');
    if (!existsSync(objectsPath)) return [];

    return this.listDirectories(objectsPath).map((name) => {
      const label = this.extractObjectLabel(join(objectsPath, name));
      return {
        name,
        type: name.endsWith('__c') ? 'Custom Object' : 'Standard Object',
        description: label || undefined,
      };
    });
  }

  private scanClasses(): InventoryItem[] {
    const classesPath = join(this.forceAppPath, 'main', 'default', 'classes');
    if (!existsSync(classesPath)) return [];

    return this.listFiles(classesPath, '.cls').map((fileName) => {
      const name = fileName.replace('.cls', '');
      const content = this.readFileSafe(join(classesPath, fileName));
      const layer = this.classifyApexClass(name, content);
      return { name, type: 'Apex Class', layer };
    });
  }

  private scanLWC(): InventoryItem[] {
    const lwcPath = join(this.forceAppPath, 'main', 'default', 'lwc');
    if (!existsSync(lwcPath)) return [];

    return this.listDirectories(lwcPath)
      .filter((name) => !name.startsWith('.'))
      .map((name) => ({
        name,
        type: 'LWC Component',
      }));
  }

  private scanFlows(): InventoryItem[] {
    const flowsPath = join(this.forceAppPath, 'main', 'default', 'flows');
    if (!existsSync(flowsPath)) return [];

    return this.listFiles(flowsPath, '.flow-meta.xml').map((fileName) => {
      const name = fileName.replace('.flow-meta.xml', '');
      const content = this.readFileSafe(join(flowsPath, fileName));
      let flowType = 'Autolaunched';
      if (content.includes('<processType>Flow</processType>')) flowType = 'Screen Flow';
      else if (content.includes('<processType>Workflow</processType>')) flowType = 'Record-Triggered';

      return { name, type: flowType };
    });
  }

  private scanTriggers(): InventoryItem[] {
    const triggersPath = join(this.forceAppPath, 'main', 'default', 'triggers');
    if (!existsSync(triggersPath)) return [];

    return this.listFiles(triggersPath, '.trigger').map((fileName) => {
      const name = fileName.replace('.trigger', '');
      const content = this.readFileSafe(join(triggersPath, fileName));
      const objMatch = content.match(/on\s+(\w+)\s*\(/i);
      const objectName = objMatch ? objMatch[1] : 'Unknown';

      return { name, type: objectName, description: `Trigger on ${objectName}` };
    });
  }

  private scanPermissionSets(): InventoryItem[] {
    const permsPath = join(this.forceAppPath, 'main', 'default', 'permissionsets');
    if (!existsSync(permsPath)) return [];

    return this.listFiles(permsPath, '.permissionset-meta.xml').map((fileName) => ({
      name: fileName.replace('.permissionset-meta.xml', ''),
      type: 'Permission Set',
    }));
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private listDirectories(dirPath: string): string[] {
    try {
      return readdirSync(dirPath)
        .filter((name) => statSync(join(dirPath, name)).isDirectory())
        .sort();
    } catch {
      return [];
    }
  }

  private listFiles(dirPath: string, extension: string): string[] {
    try {
      return readdirSync(dirPath)
        .filter((name) => name.endsWith(extension))
        .sort();
    } catch {
      return [];
    }
  }

  private readFileSafe(filePath: string): string {
    try {
      return readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private extractObjectLabel(objectDir: string): string {
    try {
      const metaFiles = readdirSync(objectDir).filter((f) => f.endsWith('.object-meta.xml'));
      if (metaFiles.length > 0) {
        const content = readFileSync(join(objectDir, metaFiles[0]), 'utf-8');
        const match = content.match(/<label>(.*?)<\/label>/);
        if (match) return match[1];
      }
    } catch {
      // Ignore
    }
    return '';
  }

  private classifyApexClass(name: string, content: string): string {
    if (name.endsWith('Test') || /@istest/i.test(content)) return 'Test';
    if (name.endsWith('Handler') || /TriggerHandler/.test(content)) return 'Handler';
    if (name.endsWith('Service')) return 'Service';
    if (name.endsWith('Selector') || /Selector/.test(name)) return 'Selector';
    if (name.endsWith('Controller')) return 'Controller';
    if (/Database\.Batchable|Queueable|Schedulable/.test(content)) return 'Async';
    return 'Utility';
  }
}

// ─── Scanner as a Tool ──────────────────────────────────────────

export function createScannerTool(): Tool {
  return {
    name: 'scan',
    description: 'Scan the force-app directory and catalog all Salesforce metadata into the inventory',
    inputs: [
      { name: 'projectRoot', type: 'string', required: true, description: 'Project root directory' },
      { name: 'forceAppPath', type: 'string', required: false, description: 'Relative path to force-app', default: 'force-app' },
    ],
    async execute(args): Promise<ToolResult<ScanResult>> {
      const scanner = new Scanner(
        args.projectRoot as string,
        (args.forceAppPath as string) || 'force-app'
      );

      try {
        const result = scanner.scan();
        return { success: true, data: result, durationMs: 0 };
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
