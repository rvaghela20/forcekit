/**
 * ForceKit Linter Tool
 *
 * Static analysis engine for Salesforce source code.
 * Reimplements update_state.py check in TypeScript with structured results
 * and extensibility via the plugin system.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { globSync } from 'node:fs';
import type { Tool, ToolResult, LintRule, LintViolation } from '../core/registry.js';
import type { ForceKitConfig } from '../config/defaults.js';

// ─── Types ──────────────────────────────────────────────────────

export interface LintResult {
  filePath: string;
  violations: LintViolation[];
}

export interface LintSummary {
  totalFiles: number;
  totalErrors: number;
  totalWarnings: number;
  fileResults: LintResult[];
}

// ─── Helpers ────────────────────────────────────────────────────

function stripComments(content: string): string {
  // Remove block comments
  let result = content.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments
  result = result.replace(/\/\/.*$/gm, '');
  return result;
}

function getLineNumber(fullText: string, charIndex: number): number {
  return fullText.substring(0, charIndex).split('\n').length;
}

/**
 * Extract the body of a loop (for/while) given the loop's start index.
 */
function extractLoopBody(text: string, loopStartIdx: number): { body: string; bodyStart: number } | null {
  const headerStart = text.indexOf('(', loopStartIdx);
  if (headerStart === -1) return null;

  // Find matching close paren
  let parenCount = 1;
  let idx = headerStart + 1;
  while (parenCount > 0 && idx < text.length) {
    if (text[idx] === '(') parenCount++;
    else if (text[idx] === ')') parenCount--;
    idx++;
  }
  if (parenCount !== 0) return null;

  // Skip whitespace to find body start
  let nonWsIdx = idx;
  while (nonWsIdx < text.length && /\s/.test(text[nonWsIdx])) nonWsIdx++;
  if (nonWsIdx >= text.length) return null;

  if (text[nonWsIdx] === '{') {
    // Braced body
    let braceCount = 1;
    let currentIdx = nonWsIdx + 1;
    while (braceCount > 0 && currentIdx < text.length) {
      if (text[currentIdx] === '{') braceCount++;
      else if (text[currentIdx] === '}') braceCount--;
      currentIdx++;
    }
    if (braceCount === 0) {
      return { body: text.substring(nonWsIdx, currentIdx), bodyStart: nonWsIdx };
    }
  } else {
    // Single-statement body
    const semiIdx = text.indexOf(';', nonWsIdx);
    if (semiIdx !== -1) {
      return { body: text.substring(nonWsIdx, semiIdx + 1), bodyStart: nonWsIdx };
    }
  }

  return null;
}

// ─── Built-in Lint Rules ────────────────────────────────────────

function createBuiltInRules(config: ForceKitConfig['lint']): LintRule[] {
  const rules: LintRule[] = [];

  // 1. Sharing keyword check
  if (config.rules['sharing-keyword-required']) {
    rules.push({
      id: 'sharing-keyword-required',
      description: 'Apex classes must have an explicit sharing keyword',
      severity: 'error',
      filePattern: /\.cls$/,
      check(content: string): LintViolation[] {
        const violations: LintViolation[] = [];
        const clean = stripComments(content);

        if (/\binterface\b/i.test(clean) || /@istest/i.test(content.toLowerCase())) return violations;

        const classMatches = clean.matchAll(/\b(?:public|private|global|virtual|abstract)\s+class\s+(\w+)\b/gi);
        for (const m of classMatches) {
          if (!/\b(?:with|without|inherited)\s+sharing\b/i.test(clean)) {
            violations.push({
              ruleId: 'sharing-keyword-required',
              message: `Class '${m[1]}' missing explicit sharing keyword.`,
              line: getLineNumber(content, m.index!),
              severity: 'error',
            });
          }
        }
        return violations;
      },
    });
  }

  // 2. SOQL in loops
  if (config.rules['no-soql-in-loops']) {
    rules.push({
      id: 'no-soql-in-loops',
      description: 'SOQL queries must not be inside for/while loops',
      severity: 'error',
      filePattern: /\.(cls|trigger)$/,
      check(content: string): LintViolation[] {
        const violations: LintViolation[] = [];
        const clean = stripComments(content);

        const loopMatches = clean.matchAll(/\b(for|while)\b\s*\(/gi);
        for (const m of loopMatches) {
          const loopResult = extractLoopBody(clean, m.index!);
          if (loopResult) {
            const soqlMatches = loopResult.body.matchAll(/\[\s*(SELECT[\s\S]*?)\]/gi);
            for (const sm of soqlMatches) {
              violations.push({
                ruleId: 'no-soql-in-loops',
                message: `SOQL query inside ${m[1]} loop: ${sm[1].trim().substring(0, 60)}...`,
                line: getLineNumber(content, loopResult.bodyStart + sm.index!),
                severity: 'error',
              });
            }
          }
        }
        return violations;
      },
    });
  }

  // 3. DML in loops
  if (config.rules['no-dml-in-loops']) {
    rules.push({
      id: 'no-dml-in-loops',
      description: 'DML statements must not be inside for/while loops',
      severity: 'error',
      filePattern: /\.(cls|trigger)$/,
      check(content: string): LintViolation[] {
        const violations: LintViolation[] = [];
        const clean = stripComments(content);

        const loopMatches = clean.matchAll(/\b(for|while)\b\s*\(/gi);
        for (const m of loopMatches) {
          const loopResult = extractLoopBody(clean, m.index!);
          if (loopResult) {
            const dmlMatches = loopResult.body.matchAll(/\b(insert|update|upsert|delete|undelete|merge)\s+(?:new\s+\w+|\w+)\b/gi);
            for (const dm of dmlMatches) {
              violations.push({
                ruleId: 'no-dml-in-loops',
                message: `DML '${dm[1]}' inside ${m[1]} loop.`,
                line: getLineNumber(content, loopResult.bodyStart + dm.index!),
                severity: 'error',
              });
            }

            const dbDmlMatches = loopResult.body.matchAll(/\bDatabase\.(insert|update|upsert|delete|undelete|merge|convertLead|emptyRecycleBin)\b/gi);
            for (const dbm of dbDmlMatches) {
              violations.push({
                ruleId: 'no-dml-in-loops',
                message: `Database.${dbm[1]} inside ${m[1]} loop.`,
                line: getLineNumber(content, loopResult.bodyStart + dbm.index!),
                severity: 'error',
              });
            }
          }
        }
        return violations;
      },
    });
  }

  // 4. Hardcoded IDs
  if (config.rules['no-hardcoded-ids']) {
    rules.push({
      id: 'no-hardcoded-ids',
      description: 'Salesforce IDs must not be hardcoded',
      severity: 'error',
      filePattern: /\.(cls|trigger|js)$/,
      check(content: string): LintViolation[] {
        const violations: LintViolation[] = [];
        const clean = stripComments(content);

        const idMatches = clean.matchAll(
          /\b(001|003|005|006|00Q|012|01t|500|701|801|a[0-9][0-9a-zA-Z])[0-9a-zA-Z]{12}(?:[0-9a-zA-Z]{3})?\b/g
        );
        for (const m of idMatches) {
          violations.push({
            ruleId: 'no-hardcoded-ids',
            message: `Hardcoded Salesforce ID: '${m[0]}'`,
            line: getLineNumber(content, m.index!),
            severity: 'error',
          });
        }
        return violations;
      },
    });
  }

  // 5. User mode in SOQL
  if (config.rules['user-mode-enforced']) {
    rules.push({
      id: 'user-mode-enforced',
      description: 'SOQL queries should use WITH USER_MODE (or WITH SYSTEM_MODE with justification)',
      severity: 'error',
      filePattern: /\.cls$/,
      check(content: string): LintViolation[] {
        const violations: LintViolation[] = [];
        const clean = stripComments(content);

        const soqlMatches = clean.matchAll(/\[\s*(SELECT[\s\S]*?)\]/gi);
        for (const m of soqlMatches) {
          if (!/\bWITH\s+(?:USER_MODE|SECURITY_ENFORCED|SYSTEM_MODE)\b/i.test(m[1])) {
            violations.push({
              ruleId: 'user-mode-enforced',
              message: `SOQL missing WITH USER_MODE: ${m[1].trim().substring(0, 60)}...`,
              line: getLineNumber(content, m.index!),
              severity: 'error',
            });
          }
        }
        return violations;
      },
    });
  }

  // 6. Empty catch blocks
  if (config.rules['no-empty-catch']) {
    rules.push({
      id: 'no-empty-catch',
      description: 'Catch blocks must not be empty',
      severity: 'warning',
      filePattern: /\.cls$/,
      check(content: string): LintViolation[] {
        const violations: LintViolation[] = [];
        const clean = stripComments(content);

        const catchMatches = clean.matchAll(/\bcatch\s*\(\s*\w+\s+\w+\s*\)\s*\{\s*\}/g);
        for (const m of catchMatches) {
          violations.push({
            ruleId: 'no-empty-catch',
            message: 'Empty catch block — exceptions must not be swallowed.',
            line: getLineNumber(content, m.index!),
            severity: 'warning',
          });
        }
        return violations;
      },
    });
  }

  // 7. SeeAllData=true
  if (config.rules['no-see-all-data']) {
    rules.push({
      id: 'no-see-all-data',
      description: 'SeeAllData=true is banned in test classes',
      severity: 'error',
      filePattern: /\.cls$/,
      check(content: string): LintViolation[] {
        const violations: LintViolation[] = [];

        const match = content.match(/@isTest\s*\(\s*SeeAllData\s*=\s*true\s*\)/i);
        if (match) {
          violations.push({
            ruleId: 'no-see-all-data',
            message: 'SeeAllData=true is banned. Create test data instead.',
            line: getLineNumber(content, match.index!),
            severity: 'error',
          });
        }
        return violations;
      },
    });
  }

  // 8. Deprecated WITH SECURITY_ENFORCED
  if (config.rules['no-security-enforced']) {
    rules.push({
      id: 'no-security-enforced',
      description: 'WITH SECURITY_ENFORCED is deprecated in API v67.0+',
      severity: 'warning',
      filePattern: /\.cls$/,
      check(content: string): LintViolation[] {
        const violations: LintViolation[] = [];
        const clean = stripComments(content);

        const matches = clean.matchAll(/\bWITH\s+SECURITY_ENFORCED\b/gi);
        for (const m of matches) {
          violations.push({
            ruleId: 'no-security-enforced',
            message: 'WITH SECURITY_ENFORCED is deprecated. Use WITH USER_MODE instead.',
            line: getLineNumber(content, m.index!),
            severity: 'warning',
          });
        }
        return violations;
      },
    });
  }

  // 9. Class size limit
  if (config.rules['max-class-lines']) {
    rules.push({
      id: 'max-class-lines',
      description: `Apex classes should not exceed ${config.maxClassLines} lines`,
      severity: 'warning',
      filePattern: /\.cls$/,
      check(content: string): LintViolation[] {
        const lineCount = stripComments(content).split('\n').length;
        if (lineCount > config.maxClassLines) {
          return [{
            ruleId: 'max-class-lines',
            message: `Class has ${lineCount} lines (max ${config.maxClassLines}). Consider refactoring.`,
            line: 1,
            severity: 'warning',
          }];
        }
        return [];
      },
    });
  }

  // 10. LWC naming
  if (config.rules['lwc-naming-standard']) {
    rules.push({
      id: 'lwc-naming-standard',
      description: 'LWC component folders must use camelCase',
      severity: 'error',
      filePattern: /\/lwc\/.*\.js$/,
      check(content: string, filePath: string): LintViolation[] {
        const parts = filePath.replace(/\\/g, '/').split('/');
        const lwcIdx = parts.indexOf('lwc');
        if (lwcIdx >= 0 && lwcIdx + 1 < parts.length) {
          const folderName = parts[lwcIdx + 1];
          if (folderName && folderName[0] === folderName[0].toUpperCase()) {
            return [{
              ruleId: 'lwc-naming-standard',
              message: `LWC folder '${folderName}' must be camelCase, not PascalCase.`,
              line: 1,
              severity: 'error',
            }];
          }
        }
        return [];
      },
    });
  }

  return rules;
}

// ─── Linter Engine ──────────────────────────────────────────────

export class Linter {
  private rules: LintRule[];

  constructor(config: ForceKitConfig['lint'], additionalRules: LintRule[] = []) {
    this.rules = [...createBuiltInRules(config), ...additionalRules];
  }

  /** Lint in-memory file content directly */
  lintContent(content: string, filePath: string): LintResult {
    const violations: LintViolation[] = [];

    for (const rule of this.rules) {
      if (rule.filePattern.test(filePath)) {
        try {
          violations.push(...rule.check(content, filePath));
        } catch (error) {
          console.warn(`[ForceKit Linter] Rule '${rule.id}' crashed on '${filePath}':`, error);
        }
      }
    }

    return { filePath, violations: violations.sort((a, b) => a.line - b.line) };
  }

  /** Lint a single file */
  lintFile(filePath: string): LintResult {
    if (!existsSync(filePath)) {
      return { filePath, violations: [] };
    }

    const content = readFileSync(filePath, 'utf-8');
    return this.lintContent(content, filePath);
  }

  /** Lint multiple files */
  lintFiles(filePaths: string[]): LintSummary {
    const fileResults: LintResult[] = [];
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const fp of filePaths) {
      const result = this.lintFile(fp);
      if (result.violations.length > 0) {
        fileResults.push(result);
        for (const v of result.violations) {
          if (v.severity === 'error') totalErrors++;
          else totalWarnings++;
        }
      }
    }

    return {
      totalFiles: filePaths.length,
      totalErrors,
      totalWarnings,
      fileResults,
    };
  }

  /** Get all registered rule IDs */
  getRuleIds(): string[] {
    return this.rules.map((r) => r.id);
  }

  /** Add additional rules (from plugins) */
  addRules(rules: LintRule[]): void {
    this.rules.push(...rules);
  }
}

// ─── Linter as a Tool ───────────────────────────────────────────

export function createLinterTool(config: ForceKitConfig): Tool {
  return {
    name: 'lint',
    description: 'Run static analysis checks on Salesforce Apex, Trigger, and LWC files',
    inputs: [
      { name: 'files', type: 'string[]', required: false, description: 'Specific files to lint (defaults to all in force-app)' },
      { name: 'projectRoot', type: 'string', required: true, description: 'Project root directory' },
    ],
    async execute(args): Promise<ToolResult<LintSummary>> {
      const projectRoot = args.projectRoot as string;
      const forceApp = join(projectRoot, config.paths.forceApp);

      let filePaths: string[];
      if (args.files) {
        filePaths = args.files as string[];
      } else {
        filePaths = findSalesforceFiles(forceApp);
      }

      const linter = new Linter(config.lint);
      const summary = linter.lintFiles(filePaths);

      return {
        success: summary.totalErrors === 0,
        data: summary,
        durationMs: 0,
      };
    },
  };
}

/** Find all Apex, Trigger, and JS files under force-app */
function findSalesforceFiles(forceAppPath: string): string[] {
  const files: string[] = [];
  if (!existsSync(forceAppPath)) return files;

  function walkDir(dir: string): void {
    try {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory() && entry !== 'node_modules' && entry !== '__tests__') {
          walkDir(full);
        } else if (/\.(cls|trigger|js)$/.test(entry)) {
          files.push(full);
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  walkDir(forceAppPath);
  return files;
}
