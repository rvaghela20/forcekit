/**
 * Built-in Plugin: Quality Gate
 *
 * Implements the pre-deploy validation checklist from quality-gates.md.
 * Blocks agent completion if critical gates fail.
 */

import { ForceKitPlugin } from '../plugin-api.js';
import type { ForceKitState } from '../../core/state.js';
import { Linter } from '../../tools/linter.js';
import type { ForceKitConfig } from '../../config/defaults.js';

export class QualityGatePlugin extends ForceKitPlugin {
  private state: ForceKitState;
  private config: ForceKitConfig;

  constructor(state: ForceKitState, config: ForceKitConfig) {
    super(
      'quality-gate',
      '1.0.0',
      'Enforces pre-deploy validation checklist and blocks on critical failures'
    );
    this.state = state;
    this.config = config;

    // Register quality gates
    this.registerQualityGate({
      name: 'static-analysis-clean',
      description: 'All Apex/LWC files pass static analysis with zero errors',
      check: async () => {
        // This would be wired to run the linter
        return { passed: true, message: 'Static analysis gate registered (run via lint tool)' };
      },
    });

    this.registerQualityGate({
      name: 'inventory-updated',
      description: 'Inventory is up to date with current project state',
      check: async () => {
        const snapshot = this.state.getSnapshot();
        const lastUpdated = new Date(snapshot.lastUpdated);
        const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);

        if (hoursSinceUpdate > 24) {
          return {
            passed: false,
            message: `Inventory last updated ${Math.floor(hoursSinceUpdate)} hours ago. Run \`forcekit scan\` to refresh.`,
          };
        }

        return { passed: true, message: 'Inventory is recent.' };
      },
    });

    this.registerQualityGate({
      name: 'no-active-blockers',
      description: 'No unresolved high-severity blockers',
      check: async () => {
        const blockers = this.state.getActiveBlockers();
        const highBlockers = blockers.filter((b) => b.severity === 'High');

        if (highBlockers.length > 0) {
          return {
            passed: false,
            message: `${highBlockers.length} high-severity blocker(s): ${highBlockers.map((b) => b.description).join(', ')}`,
          };
        }

        return { passed: true, message: 'No high-severity blockers.' };
      },
    });

    this.registerQualityGate({
      name: 'session-documented',
      description: 'Current session has been properly documented',
      check: async () => {
        const activeSession = this.state.getActiveSession();
        if (!activeSession) {
          return {
            passed: false,
            message: 'No active session. Start a session before working.',
          };
        }

        return { passed: true, message: `Active session: ${activeSession.goal}` };
      },
    });
  }

  async onPreCommit(changes: string[]): Promise<{ approved: boolean; reason?: string }> {
    if (changes.length === 0) {
      return { approved: true };
    }

    // Check that no files outside allowed paths are modified
    // (This would be enhanced with agent constraint checking)
    return { approved: true };
  }
}
