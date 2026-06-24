/**
 * ForceKit Configuration
 *
 * Default configuration values merged with project-level overrides
 * from forcekit.config.js in the project root.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ─── Configuration Types ────────────────────────────────────────

export interface ForceKitConfig {
  /** Salesforce API version */
  apiVersion: string;

  /** Minimum test coverage percentage */
  minTestCoverage: number;

  /** Maximum context length in characters for agent prompts */
  maxContextLength: number;

  /** Whether to render markdown files from JSON state */
  renderMarkdown: boolean;

  /** Lint rules configuration */
  lint: {
    /** Enable/disable specific rules */
    rules: Record<string, boolean>;
    /** File patterns to exclude from linting */
    exclude: string[];
    /** Maximum class length before warning */
    maxClassLines: number;
    /** Maximum trigger length before warning */
    maxTriggerLines: number;
  };

  /** Paths configuration */
  paths: {
    /** Path to force-app source directory */
    forceApp: string;
    /** Path to forcekit docs directory */
    docs: string;
    /** Path to state storage */
    stateDir: string;
    /** Path to metadata cache */
    cacheDir: string;
  };

  /** Agent configuration */
  agents: {
    /** Default agent to use */
    defaultAgent: string;
    /** Directories to search for agent definitions */
    definitionPaths: string[];
  };

  /** Plugin configuration */
  plugins: {
    /** Built-in plugins to enable */
    builtIn: string[];
    /** Paths to community/custom plugin directories */
    customPaths: string[];
  };
}

// ─── Defaults ───────────────────────────────────────────────────

export const DEFAULT_CONFIG: ForceKitConfig = {
  apiVersion: '67.0',
  minTestCoverage: 90,
  maxContextLength: 100_000,
  renderMarkdown: true,

  lint: {
    rules: {
      'no-soql-in-loops': true,
      'no-dml-in-loops': true,
      'no-hardcoded-ids': true,
      'sharing-keyword-required': true,
      'user-mode-enforced': true,
      'no-empty-catch': true,
      'no-hardcoded-endpoints': true,
      'no-see-all-data': true,
      'lwc-naming-standard': true,
      'max-class-lines': true,
      'max-trigger-lines': true,
      'no-security-enforced': true,
    },
    exclude: ['**/node_modules/**', '**/__tests__/**'],
    maxClassLines: 200,
    maxTriggerLines: 30,
  },

  paths: {
    forceApp: 'force-app',
    docs: 'forcekit',
    stateDir: '.forcekit',
    cacheDir: '.forcekit/cache',
  },

  agents: {
    defaultAgent: 'developer',
    definitionPaths: ['agents/definitions'],
  },

  plugins: {
    builtIn: ['anti-hallucination', 'session-logger', 'quality-gate'],
    customPaths: [],
  },
};

// ─── Config Loader ──────────────────────────────────────────────

/**
 * Load configuration synchronously by merging defaults with project-level overrides.
 * Only supports forcekit.config.json.
 */
export function loadConfigSync(
  projectRoot: string,
  overrides?: Partial<ForceKitConfig>
): ForceKitConfig {
  let projectConfig: Partial<ForceKitConfig> = {};

  const jsonConfigPath = join(projectRoot, 'forcekit.config.json');
  if (existsSync(jsonConfigPath)) {
    try {
      const raw = readFileSync(jsonConfigPath, 'utf-8');
      projectConfig = JSON.parse(raw);
    } catch (error) {
      console.warn('[ForceKit] Failed to load forcekit.config.json:', error);
    }
  }

  return deepMerge(DEFAULT_CONFIG, projectConfig, overrides ?? {});
}

/**
 * Load configuration asynchronously by merging defaults with project-level overrides.
 * Supports both forcekit.config.json and forcekit.config.js (ESM).
 */
export async function loadConfig(
  projectRoot: string,
  overrides?: Partial<ForceKitConfig>
): Promise<ForceKitConfig> {
  let projectConfig: Partial<ForceKitConfig> = {};

  // 1. Try to load forcekit.config.json
  const jsonConfigPath = join(projectRoot, 'forcekit.config.json');
  if (existsSync(jsonConfigPath)) {
    try {
      const raw = readFileSync(jsonConfigPath, 'utf-8');
      projectConfig = JSON.parse(raw);
    } catch (error) {
      console.warn('[ForceKit] Failed to load forcekit.config.json:', error);
    }
  }

  // 2. Try to load forcekit.config.js using dynamic import
  const jsConfigPath = join(projectRoot, 'forcekit.config.js');
  if (existsSync(jsConfigPath)) {
    try {
      const fileUrl = pathToFileURL(jsConfigPath).href;
      const module = await import(fileUrl);
      const jsConfig = module.default || module.config || {};
      projectConfig = deepMerge(projectConfig, jsConfig);
    } catch (error) {
      console.warn('[ForceKit] Failed to load forcekit.config.js:', error);
    }
  }

  // Deep merge: defaults ← project config ← runtime overrides
  return deepMerge(DEFAULT_CONFIG, projectConfig, overrides ?? {});
}

/**
 * Deep merge objects. Later objects override earlier ones.
 */
function deepMerge<T extends Record<string, any>>(...objects: Partial<T>[]): T {
  const result: any = {};

  for (const obj of objects) {
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          result[key] = deepMerge(result[key] ?? {}, val);
        } else {
          result[key] = val;
        }
      }
    }
  }

  return result;
}
