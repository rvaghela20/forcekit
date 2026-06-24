/**
 * ForceKit Agent Loader
 *
 * Loads, validates, and caches agent definition YAML files from disk.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { type AgentDefinition, validateAgentDefinition } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..', '..');

// ─── Cache ──────────────────────────────────────────────────────

const agentCache = new Map<string, AgentDefinition>();

// ─── Loader ─────────────────────────────────────────────────────

/**
 * Load a single agent definition by name.
 * Searches in the standard definitions directory and the project's agents directory.
 *
 * @param name Agent name (without .yaml extension)
 * @param docsRoot Path to the forcekit docs directory
 * @returns Validated AgentDefinition
 * @throws Error if the definition file is not found or invalid
 */
export function loadAgentDefinition(name: string, docsRoot: string): AgentDefinition {
  // Check cache
  if (agentCache.has(name)) {
    return agentCache.get(name)!;
  }

  // Search paths: built-in definitions first, then project-level
  const searchPaths = [
    join(packageRoot, 'agents', 'definitions', `${name}.yaml`),
    join(docsRoot, 'agents', 'definitions', `${name}.yaml`),
    join(docsRoot, 'agents', `${name}.yaml`),
  ];

  let filePath: string | null = null;
  for (const candidate of searchPaths) {
    if (existsSync(candidate)) {
      filePath = candidate;
      break;
    }
  }

  if (!filePath) {
    throw new Error(
      `Agent definition '${name}' not found. Searched:\n` +
      searchPaths.map((p) => `  - ${p}`).join('\n')
    );
  }

  return loadAgentFromFile(filePath);
}

/**
 * Load an agent definition from a specific file path.
 */
export function loadAgentFromFile(filePath: string): AgentDefinition {
  const raw = readFileSync(filePath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse YAML in '${filePath}': ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Validate
  const errors = validateAgentDefinition(parsed);
  if (errors.length > 0) {
    throw new Error(
      `Invalid agent definition in '${filePath}':\n` +
      errors.map((e) => `  - ${e}`).join('\n')
    );
  }

  const definition = parsed as AgentDefinition;

  // Cache it
  agentCache.set(definition.name, definition);

  return definition;
}

/**
 * Load all agent definitions from a directory.
 */
export function loadAllAgents(docsRoot: string): AgentDefinition[] {
  const agents: AgentDefinition[] = [];

  const searchDirs = [
    join(packageRoot, 'agents', 'definitions'),
    join(docsRoot, 'agents', 'definitions'),
  ];

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of files) {
      try {
        const definition = loadAgentFromFile(join(dir, file));
        // Avoid duplicates (built-in + project-level with same name)
        if (!agents.some((a) => a.name === definition.name)) {
          agents.push(definition);
        }
      } catch (error) {
        console.warn(`[ForceKit] Skipping invalid agent definition '${file}':`, error instanceof Error ? error.message : error);
      }
    }
  }

  return agents;
}

/**
 * Clear the agent definition cache.
 */
export function clearAgentCache(): void {
  agentCache.clear();
}
