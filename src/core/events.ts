/**
 * ForceKit Event System
 *
 * Typed event emitter for agent-to-agent and tool-to-engine communication.
 * All framework events flow through this bus, enabling plugins to observe
 * and react to lifecycle changes without tight coupling.
 */

export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

/** All events the framework can emit */
export interface ForceKitEvents {
  'agent:start': { agentName: string; goal: string; timestamp: Date };
  'agent:complete': { agentName: string; result: AgentResult; timestamp: Date };
  'agent:error': { agentName: string; error: Error; timestamp: Date };
  'tool:invoke': { toolName: string; args: Record<string, unknown>; timestamp: Date };
  'tool:result': { toolName: string; result: unknown; durationMs: number; timestamp: Date };
  'tool:error': { toolName: string; error: Error; timestamp: Date };
  'state:change': { key: string; oldValue: unknown; newValue: unknown };
  'session:start': { agent: string; goal: string; timestamp: Date };
  'session:end': { agent: string; summary: string; timestamp: Date };
  'plugin:loaded': { pluginName: string; version: string };
  'lint:complete': { fileCount: number; errorCount: number; warningCount: number };
  'verify:result': { metadataType: string; name: string; exists: boolean };
}

export interface AgentResult {
  success: boolean;
  summary: string;
  filesChanged: string[];
  errors: string[];
}

/**
 * Typed event bus for the ForceKit framework.
 *
 * Usage:
 *   const bus = new EventBus();
 *   bus.on('agent:start', (payload) => console.log(payload.agentName));
 *   bus.emit('agent:start', { agentName: 'developer', goal: '...', timestamp: new Date() });
 */
export class EventBus {
  private listeners = new Map<string, Set<EventHandler<any>>>();

  /**
   * Register an event handler.
   */
  on<K extends keyof ForceKitEvents>(event: K, handler: EventHandler<ForceKitEvents[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  /**
   * Register a one-time event handler.
   */
  once<K extends keyof ForceKitEvents>(event: K, handler: EventHandler<ForceKitEvents[K]>): void {
    const wrapper: EventHandler<ForceKitEvents[K]> = (payload) => {
      this.off(event, wrapper);
      return handler(payload);
    };
    this.on(event, wrapper);
  }

  /**
   * Remove an event handler.
   */
  off<K extends keyof ForceKitEvents>(event: K, handler: EventHandler<ForceKitEvents[K]>): void {
    this.listeners.get(event)?.delete(handler);
  }

  /**
   * Emit an event to all registered handlers.
   */
  async emit<K extends keyof ForceKitEvents>(event: K, payload: ForceKitEvents[K]): Promise<void> {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    const promises: Promise<void>[] = [];
    for (const handler of handlers) {
      try {
        const result = handler(payload);
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (error) {
        console.error(`[ForceKit] Event handler error for '${event}':`, error);
      }
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Remove all handlers for an event, or all handlers entirely.
   */
  clear(event?: keyof ForceKitEvents): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the count of listeners for a specific event.
   */
  listenerCount(event: keyof ForceKitEvents): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

/** Singleton event bus instance for the framework */
export const eventBus = new EventBus();
