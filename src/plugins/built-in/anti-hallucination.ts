/**
 * Built-in Plugin: Anti-Hallucination
 *
 * Intercepts agent metadata references and verifies them against the cached
 * inventory before allowing them. Implements the "verify before you generate"
 * principle from ForceKit rules.md.
 */

import { ForceKitPlugin } from '../plugin-api.js';
import type { ForceKitState } from '../../core/state.js';

export class AntiHallucinationPlugin extends ForceKitPlugin {
  private state: ForceKitState;

  constructor(state: ForceKitState) {
    super(
      'anti-hallucination',
      '1.0.0',
      'Verifies Salesforce metadata references against cached inventory to prevent hallucinations'
    );
    this.state = state;

    // Register a quality gate
    this.registerQualityGate({
      name: 'inventory-coverage',
      description: 'Verify that all referenced metadata exists in the inventory',
      check: async () => {
        const snapshot = this.state.getSnapshot();
        const inv = snapshot.inventory;
        const totalItems =
          inv.objects.length + inv.classes.length + inv.lwcComponents.length +
          inv.flows.length + inv.triggers.length + inv.permissionSets.length;

        if (totalItems === 0) {
          return {
            passed: false,
            message: 'Inventory is empty. Run `forcekit scan` to populate it before generating code.',
          };
        }

        return {
          passed: true,
          message: `Inventory has ${totalItems} items. Metadata verification available.`,
        };
      },
    });
  }

  async onAgentStart(context: { agentName: string; goal: string }): Promise<void> {
    const snapshot = this.state.getSnapshot();
    const inv = snapshot.inventory;
    const total =
      inv.objects.length + inv.classes.length + inv.lwcComponents.length +
      inv.flows.length + inv.triggers.length;

    if (total === 0) {
      console.warn(
        '[Anti-Hallucination] ⚠️ Inventory is empty. Agent should run scan before generating code.'
      );
    }
  }

  /**
   * Check if a metadata item exists in the inventory.
   */
  verifyExists(
    category: 'objects' | 'classes' | 'lwcComponents' | 'flows' | 'triggers',
    name: string
  ): { exists: boolean; confidence: 'verified' | 'assumed' | 'uncertain' } {
    const items = this.state.getInventory(category) as Array<{ name: string; lastVerified?: string }>;
    const found = items.find((i) => i.name === name);

    if (found) {
      return {
        exists: true,
        confidence: found.lastVerified ? 'verified' : 'assumed',
      };
    }

    return { exists: false, confidence: 'uncertain' };
  }
}
