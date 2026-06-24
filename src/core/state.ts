/**
 * ForceKit State Manager
 *
 * JSON-backed state management that replaces brittle markdown regex edits.
 * State is stored as structured JSON and can be rendered to human-readable
 * markdown for backward compatibility with the v1 context pack format.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { EventBus } from './events.js';

// ─── State Types ────────────────────────────────────────────────

export interface SessionEntry {
  id: string;
  date: string;
  agent: string;
  goal: string;
  status: 'active' | 'completed' | 'aborted';
  summary?: string;
  filesChanged: string[];
  startedAt: string;
  endedAt?: string;
}

export interface TaskEntry {
  id: string;
  description: string;
  status: 'upcoming' | 'in_progress' | 'completed';
  priority: 'P0' | 'P1' | 'P2';
  dependencies: string[];
  branch?: string;
  filesChanged: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DecisionEntry {
  id: string;
  date: string;
  decision: string;
  rationale: string;
}

export interface BlockerEntry {
  id: string;
  description: string;
  impact: string;
  severity: 'High' | 'Medium' | 'Low';
  addedAt: string;
  resolvedAt?: string;
}

export interface InventoryItem {
  name: string;
  type: string;
  layer?: string;
  description?: string;
  lastVerified?: string;
}

export interface EnvironmentState {
  name: string;
  lastDeploy?: string;
  status: 'healthy' | 'warning' | 'error';
  notes?: string;
}

export interface GovernorLimit {
  name: string;
  current: number;
  max: number;
}

export interface ForceKitStateData {
  version: string;
  projectStatus: string;
  lastUpdated: string;

  sessions: SessionEntry[];
  tasks: TaskEntry[];
  decisions: DecisionEntry[];
  blockers: BlockerEntry[];

  inventory: {
    objects: InventoryItem[];
    classes: InventoryItem[];
    lwcComponents: InventoryItem[];
    flows: InventoryItem[];
    triggers: InventoryItem[];
    permissionSets: InventoryItem[];
  };

  environments: EnvironmentState[];
  governorLimits: GovernorLimit[];
}

// ─── Default State ──────────────────────────────────────────────

function createDefaultState(): ForceKitStateData {
  return {
    version: '2.0.0',
    projectStatus: 'on_track',
    lastUpdated: new Date().toISOString(),
    sessions: [],
    tasks: [],
    decisions: [],
    blockers: [],
    inventory: {
      objects: [],
      classes: [],
      lwcComponents: [],
      flows: [],
      triggers: [],
      permissionSets: [],
    },
    environments: [
      { name: 'Dev Sandbox', status: 'healthy' },
      { name: 'QA Sandbox', status: 'healthy' },
      { name: 'UAT Sandbox', status: 'healthy' },
      { name: 'Production', status: 'healthy' },
    ],
    governorLimits: [],
  };
}

// ─── State Manager ──────────────────────────────────────────────

export class ForceKitState {
  private data: ForceKitStateData;
  private statePath: string;
  private events?: EventBus;

  constructor(projectRoot: string, events?: EventBus) {
    this.statePath = join(projectRoot, '.forcekit', 'state.json');
    this.events = events;
    this.data = this.load();
  }

  // ─── Persistence ────────────────────────────────────────────

  private load(): ForceKitStateData {
    if (existsSync(this.statePath)) {
      try {
        const raw = readFileSync(this.statePath, 'utf-8');
        return JSON.parse(raw) as ForceKitStateData;
      } catch {
        console.warn('[ForceKit] Corrupted state file, creating fresh state.');
        return createDefaultState();
      }
    }
    return createDefaultState();
  }

  save(): void {
    this.data.lastUpdated = new Date().toISOString();
    const dir = dirname(this.statePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Atomic write: write to temp, then rename
    const tmpPath = this.statePath + '.tmp';
    writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf-8');

    // Node.js rename is atomic on the same filesystem
    renameSync(tmpPath, this.statePath);
  }

  /** Get a read-only snapshot of the full state */
  getSnapshot(): Readonly<ForceKitStateData> {
    return structuredClone(this.data);
  }

  // ─── Sessions ───────────────────────────────────────────────

  startSession(agent: string, goal: string): SessionEntry {
    const session: SessionEntry = {
      id: this.generateId(),
      date: new Date().toISOString().split('T')[0],
      agent,
      goal,
      status: 'active',
      filesChanged: [],
      startedAt: new Date().toISOString(),
    };

    this.data.sessions.unshift(session);
    this.save();

    this.events?.emit('session:start', {
      agent,
      goal,
      timestamp: new Date(),
    });

    return session;
  }

  endSession(summary: string, filesChanged: string[] = []): SessionEntry | null {
    const active = this.data.sessions.find((s) => s.status === 'active');
    if (!active) return null;

    active.status = 'completed';
    active.summary = summary;
    active.filesChanged = filesChanged;
    active.endedAt = new Date().toISOString();
    this.save();

    this.events?.emit('session:end', {
      agent: active.agent,
      summary,
      timestamp: new Date(),
    });

    return active;
  }

  getActiveSession(): SessionEntry | undefined {
    return this.data.sessions.find((s) => s.status === 'active');
  }

  getRecentSessions(count: number = 5): SessionEntry[] {
    return this.data.sessions.slice(0, count);
  }

  // ─── Tasks ──────────────────────────────────────────────────

  addTask(description: string, priority: 'P0' | 'P1' | 'P2' = 'P1', dependencies: string[] = []): TaskEntry {
    const task: TaskEntry = {
      id: this.generateId(),
      description,
      status: 'upcoming',
      priority,
      dependencies,
      filesChanged: [],
      createdAt: new Date().toISOString(),
    };

    this.data.tasks.push(task);
    this.save();
    return task;
  }

  startTask(taskId: string, branch?: string): TaskEntry | null {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    task.status = 'in_progress';
    task.startedAt = new Date().toISOString();
    if (branch) task.branch = branch;
    this.save();
    return task;
  }

  completeTask(taskId: string, filesChanged: string[] = []): TaskEntry | null {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.filesChanged = filesChanged;
    this.save();
    return task;
  }

  getTasksByStatus(status: TaskEntry['status']): TaskEntry[] {
    return this.data.tasks.filter((t) => t.status === status);
  }

  // ─── Decisions ──────────────────────────────────────────────

  logDecision(decision: string, rationale: string): DecisionEntry {
    const entry: DecisionEntry = {
      id: this.generateId(),
      date: new Date().toISOString().split('T')[0],
      decision,
      rationale,
    };

    this.data.decisions.unshift(entry);
    this.save();
    return entry;
  }

  // ─── Blockers ───────────────────────────────────────────────

  addBlocker(description: string, impact: string, severity: BlockerEntry['severity'] = 'Medium'): BlockerEntry {
    const blocker: BlockerEntry = {
      id: this.generateId(),
      description,
      impact,
      severity,
      addedAt: new Date().toISOString(),
    };

    this.data.blockers.push(blocker);
    this.data.projectStatus = severity === 'High' ? 'blocked' : 'at_risk';
    this.save();
    return blocker;
  }

  resolveBlocker(blockerId: string): BlockerEntry | null {
    const blocker = this.data.blockers.find((b) => b.id === blockerId);
    if (!blocker) return null;

    blocker.resolvedAt = new Date().toISOString();

    // Recalculate project status
    const unresolvedBlockers = this.data.blockers.filter((b) => !b.resolvedAt);
    if (unresolvedBlockers.length === 0) {
      this.data.projectStatus = 'on_track';
    }

    this.save();
    return blocker;
  }

  getActiveBlockers(): BlockerEntry[] {
    return this.data.blockers.filter((b) => !b.resolvedAt);
  }

  // ─── Inventory ──────────────────────────────────────────────

  registerMetadata(
    category: keyof ForceKitStateData['inventory'],
    item: InventoryItem
  ): void {
    const list = this.data.inventory[category];
    const existing = list.findIndex((i) => i.name === item.name);

    if (existing >= 0) {
      list[existing] = { ...list[existing], ...item };
    } else {
      list.push(item);
    }

    this.save();
  }

  removeMetadata(
    category: keyof ForceKitStateData['inventory'],
    name: string
  ): boolean {
    const list = this.data.inventory[category];
    const index = list.findIndex((i) => i.name === name);
    if (index < 0) return false;

    list.splice(index, 1);
    this.save();
    return true;
  }

  getInventory(category?: keyof ForceKitStateData['inventory']): InventoryItem[] | ForceKitStateData['inventory'] {
    if (category) {
      return [...this.data.inventory[category]];
    }
    return structuredClone(this.data.inventory);
  }

  // ─── Governor Limits ────────────────────────────────────────

  updateGovernorLimits(limits: GovernorLimit[]): void {
    this.data.governorLimits = limits;
    this.save();
  }

  // ─── Environments ───────────────────────────────────────────

  updateEnvironment(name: string, updates: Partial<EnvironmentState>): void {
    const env = this.data.environments.find((e) => e.name === name);
    if (env) {
      Object.assign(env, updates);
      this.save();
    }
  }

  // ─── Markdown Rendering ─────────────────────────────────────

  /** Render the current state to a human-readable markdown string (backward compat) */
  renderCurrentStateMarkdown(): string {
    const statusEmoji: Record<string, string> = {
      on_track: '🟢 On Track',
      at_risk: '🟡 At Risk',
      blocked: '🔴 Blocked',
    };

    let md = `# Current State\n\n`;
    md += `> 🤖 **AUTO-GENERATED** from ForceKit v2 state. Do not edit directly.\n\n---\n\n`;
    md += `## Project Status\n\n`;
    md += `**Last Updated:** ${this.data.lastUpdated.split('T')[0]}\n`;
    md += `**Overall Status:** ${statusEmoji[this.data.projectStatus] ?? this.data.projectStatus}\n\n---\n\n`;

    // Active Work
    md += `## Active Work\n\n`;
    md += `### In Progress\n\n`;
    const inProgress = this.getTasksByStatus('in_progress');
    if (inProgress.length === 0) {
      md += `_No tasks in progress._\n\n`;
    } else {
      for (const t of inProgress) {
        md += `- [/] ${t.description}${t.branch ? ` | Branch: \`${t.branch}\`` : ''} | Started: ${t.startedAt?.split('T')[0]}\n`;
      }
      md += '\n';
    }

    md += `### Upcoming\n\n`;
    const upcoming = this.getTasksByStatus('upcoming');
    if (upcoming.length === 0) {
      md += `_No upcoming tasks._\n\n`;
    } else {
      for (const t of upcoming) {
        md += `- [ ] ${t.description} | Priority: ${t.priority}\n`;
      }
      md += '\n';
    }

    md += `### Recently Completed\n\n`;
    const completed = this.getTasksByStatus('completed').slice(0, 10);
    if (completed.length === 0) {
      md += `_No completed tasks yet._\n\n`;
    } else {
      for (const t of completed) {
        md += `- [x] ${t.description} | Completed: ${t.completedAt?.split('T')[0]}\n`;
      }
      md += '\n';
    }

    // Blockers
    md += `---\n\n## Blockers\n\n`;
    const activeBlockers = this.getActiveBlockers();
    if (activeBlockers.length === 0) {
      md += `| Blocker | Impact | Severity | Added |\n|---------|--------|----------|-------|\n| _None_ | | | |\n\n`;
    } else {
      md += `| Blocker | Impact | Severity | Added |\n|---------|--------|----------|-------|\n`;
      for (const b of activeBlockers) {
        md += `| ${b.description} | ${b.impact} | ${b.severity} | ${b.addedAt.split('T')[0]} |\n`;
      }
      md += '\n';
    }

    // Decisions
    md += `---\n\n## Decisions\n\n`;
    if (this.data.decisions.length === 0) {
      md += `| Date | Decision | Rationale |\n|------|----------|-----------|\n| | | |\n\n`;
    } else {
      md += `| Date | Decision | Rationale |\n|------|----------|-----------|\n`;
      for (const d of this.data.decisions.slice(0, 20)) {
        md += `| ${d.date} | ${d.decision} | ${d.rationale} |\n`;
      }
      md += '\n';
    }

    // Environment State
    md += `---\n\n## Environment State\n\n`;
    md += `| Environment | Last Deploy | Status | Notes |\n|-------------|-------------|--------|-------|\n`;
    const envStatusEmoji: Record<string, string> = {
      healthy: '🟢',
      warning: '🟡',
      error: '🔴',
    };
    for (const env of this.data.environments || []) {
      md += `| ${env.name} | ${env.lastDeploy ?? '—'} | ${envStatusEmoji[env.status] ?? env.status} | ${env.notes ?? ''} |\n`;
    }
    md += `\n`;

    // Governor Limit Watch
    md += `---\n\n## Governor Limit Watch\n\n`;
    md += `| Limit | Current Usage | Max | Risk |\n|-------|---------------|-----|------|\n`;
    for (const lim of this.data.governorLimits || []) {
      const isStorage = lim.name.includes('Storage');
      const currentFormatted = isStorage ? `${lim.current} MB` : lim.current.toLocaleString();
      const maxFormatted = isStorage ? `${lim.max} MB` : lim.max.toLocaleString();
      
      let riskEmoji = '🟢';
      if (lim.max > 0) {
        const pct = (lim.current / lim.max) * 100;
        if (pct >= 80) riskEmoji = '🔴';
        else if (pct >= 50) riskEmoji = '🟡';
      }
      md += `| ${lim.name} | ${currentFormatted} | ${maxFormatted} | ${riskEmoji} |\n`;
    }
    md += `\n`;

    // Files Changed This Session
    const activeSession = this.getActiveSession();
    if (activeSession) {
      md += `---\n\n## Files Changed This Session\n\n`;
      md += `| File | Action | Notes |\n|------|--------|-------|\n`;
      for (const file of activeSession.filesChanged) {
        md += `| ${file} | MODIFY | Updated during this session |\n`;
      }
      if (activeSession.filesChanged.length === 0) {
        md += `| _None_ | | |\n`;
      }
      md += `\n`;
    }

    // Session Log
    md += `---\n\n## Session Log\n\n`;
    for (const s of this.data.sessions.slice(0, 10)) {
      md += `### ${s.date} | ${s.agent} | ${s.goal}\n`;
      if (s.summary) {
        md += `- ✅ ${s.summary}\n`;
      } else if (s.status === 'active') {
        md += `- 🟡 Session in progress\n`;
      }
      md += `- **Files:** ${s.filesChanged.length > 0 ? s.filesChanged.join(', ') : '_None_'}\n\n`;
    }

    return md;
  }

  /** Render inventory to markdown */
  renderInventoryMarkdown(): string {
    let md = `# Metadata Inventory\n\n`;
    md += `> 🤖 **AUTO-GENERATED** from ForceKit v2 state.\n\n---\n\n`;

    const { objects, classes, lwcComponents, flows, triggers, permissionSets } = this.data.inventory;

    md += `## Custom Objects\n\n`;
    md += `| API Name | Type | Description |\n|----------|------|-------------|\n`;
    for (const o of objects) {
      md += `| ${o.name} | ${o.type} | ${o.description ?? ''} |\n`;
    }
    if (objects.length === 0) md += `| _None_ | | |\n`;

    md += `\n---\n\n## Apex Classes\n\n`;
    md += `| Name | Layer | Description |\n|------|-------|-------------|\n`;
    for (const c of classes) {
      md += `| ${c.name} | ${c.layer ?? ''} | ${c.description ?? ''} |\n`;
    }
    if (classes.length === 0) md += `| _None_ | | |\n`;

    md += `\n---\n\n## LWC Components\n\n`;
    md += `| Name | Description |\n|------|-------------|\n`;
    for (const l of lwcComponents) {
      md += `| ${l.name} | ${l.description ?? ''} |\n`;
    }
    if (lwcComponents.length === 0) md += `| _None_ | |\n`;

    md += `\n---\n\n## Flows\n\n`;
    md += `| Name | Type | Description |\n|------|------|-------------|\n`;
    for (const f of flows) {
      md += `| ${f.name} | ${f.type} | ${f.description ?? ''} |\n`;
    }
    if (flows.length === 0) md += `| _None_ | | |\n`;

    md += `\n---\n\n## Triggers\n\n`;
    md += `| Name | Object | Description |\n|------|--------|-------------|\n`;
    for (const t of triggers) {
      md += `| ${t.name} | ${t.type} | ${t.description ?? ''} |\n`;
    }
    if (triggers.length === 0) md += `| _None_ | | |\n`;

    md += `\n---\n\n## Permission Sets\n\n`;
    md += `| Name | Description |\n|------|-------------|\n`;
    for (const p of permissionSets) {
      md += `| ${p.name} | ${p.description ?? ''} |\n`;
    }
    if (permissionSets.length === 0) md += `| _None_ | |\n`;

    md += `\n---\n\n_Last scan: ${this.data.lastUpdated}_\n`;

    return md;
  }

  // ─── Helpers ────────────────────────────────────────────────

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
}
