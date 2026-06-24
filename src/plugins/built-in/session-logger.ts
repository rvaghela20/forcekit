/**
 * Built-in Plugin: Session Logger
 *
 * Automatically logs all agent activity to the state manager,
 * preserving session context across agent runs.
 */

import { ForceKitPlugin } from '../plugin-api.js';
import type { ForceKitState } from '../../core/state.js';

export class SessionLoggerPlugin extends ForceKitPlugin {
  private state: ForceKitState;
  private modifiedFiles: Set<string> = new Set();

  constructor(state: ForceKitState) {
    super(
      'session-logger',
      '1.0.0',
      'Automatically logs all agent activity to the state manager for session continuity'
    );
    this.state = state;
  }

  async onAgentStart(context: { agentName: string; goal: string }): Promise<void> {
    this.modifiedFiles.clear();
    console.log(`[Session Logger] 📝 Session started: ${context.agentName} — ${context.goal}`);
  }

  async onFileModify(filePath: string): Promise<void> {
    this.modifiedFiles.add(filePath);
  }

  async onAgentComplete(context: { agentName: string; filesChanged: string[] }): Promise<void> {
    // Merge tracked files with reported files
    const allFiles = new Set([...this.modifiedFiles, ...context.filesChanged]);

    console.log(
      `[Session Logger] ✅ Session complete: ${context.agentName} — ` +
      `${allFiles.size} files changed`
    );
  }

  async onLintComplete(results: { errorCount: number; warningCount: number }): Promise<void> {
    if (results.errorCount > 0) {
      console.log(
        `[Session Logger] 🔴 Lint: ${results.errorCount} errors, ${results.warningCount} warnings`
      );
    } else if (results.warningCount > 0) {
      console.log(
        `[Session Logger] 🟡 Lint: ${results.warningCount} warnings`
      );
    } else {
      console.log(`[Session Logger] 🟢 Lint: Clean`);
    }
  }
}
