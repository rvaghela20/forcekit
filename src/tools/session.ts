/**
 * ForceKit Session Tool
 *
 * Programmatic interface for managing developer sessions, tracking tasks,
 * logging decisions, and resolving blockers.
 */

import { ForceKitState } from '../core/state.js';
import type { Tool, ToolResult } from '../core/registry.js';
import type { ForceKitConfig } from '../config/defaults.js';

export function createSessionTool(config: ForceKitConfig): Tool {
  return {
    name: 'session',
    description: 'Manage active sessions, log tasks, decisions, and blockers',
    inputs: [
      { name: 'action', type: 'string', required: true, description: "Action: 'start', 'end', 'add_task', 'complete_task', 'decision', 'blocker'" },
      { name: 'agent', type: 'string', required: false, description: "Agent name (required for 'start')" },
      { name: 'goal', type: 'string', required: false, description: "Session goal (required for 'start')" },
      { name: 'summary', type: 'string', required: false, description: "Session summary (required for 'end')" },
      { name: 'files', type: 'string[]', required: false, description: "List of files changed (optional for 'end' or 'complete_task')" },
      { name: 'description', type: 'string', required: false, description: "Task/blocker description (required for 'add_task' or 'blocker')" },
      { name: 'priority', type: 'string', required: false, description: "Priority: P0, P1, P2 (default: P1, optional for 'add_task')" },
      { name: 'taskId', type: 'string', required: false, description: "ID of task to complete (required for 'complete_task')" },
      { name: 'impact', type: 'string', required: false, description: "Impact explanation (required for 'blocker')" },
      { name: 'severity', type: 'string', required: false, description: "Blocker severity: High, Medium, Low (optional for 'blocker')" },
      { name: 'decision', type: 'string', required: false, description: "Decision statement (required for 'decision')" },
      { name: 'rationale', type: 'string', required: false, description: "Decision rationale (required for 'decision')" },
    ],
    async execute(args): Promise<ToolResult> {
      const state = new ForceKitState(args.projectRoot as string || '.');
      const action = args.action as string;

      try {
        switch (action) {
          case 'start': {
            if (!args.agent || !args.goal) {
              return { success: false, error: "Missing required inputs 'agent' and 'goal' for action 'start'", durationMs: 0 };
            }
            const entry = state.startSession(args.agent as string, args.goal as string);
            return { success: true, data: entry, durationMs: 0 };
          }
          case 'end': {
            if (!args.summary) {
              return { success: false, error: "Missing required input 'summary' for action 'end'", durationMs: 0 };
            }
            const entry = state.endSession(args.summary as string, args.files as string[]);
            return { success: entry !== null, data: entry || { error: 'No active session' }, durationMs: 0 };
          }
          case 'add_task': {
            if (!args.description) {
              return { success: false, error: "Missing required input 'description' for action 'add_task'", durationMs: 0 };
            }
            const entry = state.addTask(
              args.description as string,
              (args.priority as any) || 'P1',
              []
            );
            return { success: true, data: entry, durationMs: 0 };
          }
          case 'complete_task': {
            if (!args.taskId) {
              return { success: false, error: "Missing required input 'taskId' for action 'complete_task'", durationMs: 0 };
            }
            const entry = state.completeTask(args.taskId as string, args.files as string[]);
            return { success: entry !== null, data: entry || { error: 'Task not found' }, durationMs: 0 };
          }
          case 'decision': {
            if (!args.decision || !args.rationale) {
              return { success: false, error: "Missing required inputs 'decision' and 'rationale' for action 'decision'", durationMs: 0 };
            }
            const entry = state.logDecision(args.decision as string, args.rationale as string);
            return { success: true, data: entry, durationMs: 0 };
          }
          case 'blocker': {
            if (!args.description || !args.impact) {
              return { success: false, error: "Missing required inputs 'description' and 'impact' for action 'blocker'", durationMs: 0 };
            }
            const entry = state.addBlocker(
              args.description as string,
              args.impact as string,
              (args.severity as any) || 'Medium'
            );
            return { success: true, data: entry, durationMs: 0 };
          }
          default:
            return { success: false, error: `Unknown session action: ${action}`, durationMs: 0 };
        }
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
