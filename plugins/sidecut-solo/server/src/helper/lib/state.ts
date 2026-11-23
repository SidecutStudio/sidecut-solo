// Versioned task records, exclusive writers and conservative crash recovery. Records live under
// the Git common directory at solo-workflow/<task>/.
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { commonDir, git, type Inventory, inventory, WorkflowError } from './git.ts';
import { pluginRoot } from './paths.ts';

const RECORD_DIRS = ['solo-workflow'];
const OWNER_MARKERS = RECORD_DIRS.map((name) => `${name}-owner`);
const PHASES = ['explore', 'investigate', 'plan', 'build', 'verify', 'review', 'finish'];
// Phase names older records and habits still use.
const PHASE_ALIASES: Record<string, string> = {
  brainstorm: 'explore',
  inspect: 'investigate',
  qa: 'verify',
};
const OPEN = new Set(['started', 'uncertain']);

export function now(): string {
  return new Date().toISOString();
}

export function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.write-${randomBytes(6).toString('hex')}`);
  try {
    const fd = openSync(temp, 'wx', 0o600);
    try {
      writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

export type OwnedWorktree = {
  path: string;
  created_from: string;
  status: string;
  at: string;
  creation_token: string;
  preserved_at?: string;
  removed_at?: string;
};

export type Action = {
  signature: string;
  argv: string[];
  status: string;
  started_at: string;
  before: Inventory;
  after?: Inventory;
  finished_at?: string;
  returncode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
  resolution?: string;
};

export type MergeIntent = {
  pr: string;
  head: string;
  reviewer: string;
  status: string;
  at: string;
  error?: string;
  resolution?: string;
  after?: unknown;
};

export type Task = {
  schema_version: 1;
  repo: string;
  goal: string;
  constraints: string[];
  budget_increments: number | null;
  phase: string;
  next_action: string;
  created_at: string;
  updated_at: string;
  snapshot: Inventory;
  increments: { phase: string; next_action: string; acceptance: string; at: string }[];
  actions: Record<string, Action>;
  evidence: unknown[];
  owned_worktrees: OwnedWorktree[];
  reconciliations: Record<string, unknown>[];
  end_state: string;
  merge_intent?: MergeIntent;
  merge_history?: MergeIntent[];
};

/** Whether the worktree at a task's record is still the one that task created. */
export function owns(record: OwnedWorktree): boolean {
  const stat = lstatSync(record.path, { throwIfNoEntry: false });
  if (!record.creation_token || !stat || stat.isSymbolicLink() || !stat.isDirectory()) return false;
  let admin: string;
  try {
    admin = git(record.path, ['rev-parse', '--path-format=absolute', '--git-dir']);
  } catch {
    return false;
  }
  const marker = OWNER_MARKERS.map((name) => join(admin, name)).find((path) => existsSync(path));
  return Boolean(marker) && readFileSync(marker as string, 'ascii') === record.creation_token;
}

/** Whether a task record belongs to the worktree at `root`, directly or through one it created. */
function belongsTo(data: Task, root: string): boolean {
  return (
    root === data.repo ||
    data.owned_worktrees.some(
      (item) => item.path === root && item.status === 'created' && owns(item),
    )
  );
}

/**
 * The task ID used when no --task is given. Each worktree gets its own, so a record another
 * worktree left under the default name (even one long gone) never blocks this one. A `default`
 * record this worktree already uses keeps working.
 */
export function defaultTask(repo: string): string {
  const root = realpathSync(git(repo, ['rev-parse', '--show-toplevel']));
  const legacy = join(commonDir(repo), RECORD_DIRS[0] as string, 'default', 'task.json');
  try {
    if (belongsTo(JSON.parse(readFileSync(legacy, 'utf8')) as Task, root)) return 'default';
  } catch {
    // No legacy record, or an unreadable one: use this worktree's own name.
  }
  const digest = createHash('sha256').update(root).digest('hex');
  return `default-${digest.slice(0, 12)}`;
}

function uncertain(data: Task): boolean {
  return (
    Object.values(data.actions).some((action) => OPEN.has(action.status)) ||
    OPEN.has(data.merge_intent?.status ?? '')
  );
}

/** The end state a record needing reconciliation had before its last unresolved resume. */
function priorEndState(data: Task): string {
  // Repeated resumes must not erase the state that first needed inspection. Stop at the last
  // resolution: older merges cannot complete newer work.
  for (const item of [...data.reconciliations].reverse()) {
    if ('resolution' in item) break;
    const prior = item.prior_end_state as string | undefined;
    if (prior && prior !== 'needs_reconciliation') return prior;
  }
  return 'in_progress';
}

/**
 * A task whose merge was verified and that has nothing uncertain left: finished history. Its
 * snapshot going stale (main moved, another branch checked out) is expected, not a risk, so it
 * never blocks a later merge, here or under another task record. A record an older helper left
 * in `needs_reconciliation` only because it went stale after its merge counts too.
 */
export function finished(data: Task): boolean {
  if (uncertain(data)) return false;
  if (data.end_state === 'merged') return true;
  return data.end_state === 'needs_reconciliation' && priorEndState(data) === 'merged';
}

/**
 * A record `merge` started for one PR whose merge never began: no merge intent or history, no
 * actions, increments, evidence or worktrees. Nothing ran under it, so its snapshot protects
 * nothing and it must not hold up later merges.
 */
export function unstartedMerge(data: Task): boolean {
  return (
    /^Merge PR \S+$/.test(data.goal) &&
    !data.merge_intent &&
    !data.merge_history?.length &&
    Object.keys(data.actions).length === 0 &&
    data.increments.length === 0 &&
    data.evidence.length === 0 &&
    data.owned_worktrees.length === 0
  );
}

export class Store {
  readonly repo: string;
  readonly directory: string;
  readonly others: string[];
  readonly path: string;
  readonly lock: string;

  constructor(repo: string, task: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(task)) {
      throw new WorkflowError('Task ID must be a bounded filename, not a path');
    }
    this.repo = existsSync(repo) ? realpathSync(repo) : resolve(repo);
    const common = commonDir(repo);
    const candidates = RECORD_DIRS.map((name) => join(common, name, task));
    const existing = candidates.filter((path) => existsSync(path));
    if (existing.length > 1) {
      throw new WorkflowError(
        'Ambiguous task records: current and older record directories both exist',
      );
    }
    this.directory = existing[0] ?? (candidates[0] as string);
    this.others = candidates.filter((path) => path !== this.directory);
    this.path = join(this.directory, 'task.json');
    this.lock = join(this.directory, 'writer.lock');
  }

  private acquire(): void {
    if (this.others.some((path) => existsSync(path))) {
      throw new WorkflowError(
        'Task directory changed or is ambiguous; inspect both records before resuming',
      );
    }
    mkdirSync(this.directory, { recursive: true });
    let fd: number;
    try {
      fd = openSync(this.lock, 'wx', 0o600);
    } catch {
      throw new WorkflowError(
        `Writer lock exists: ${this.lock}. Verify the owner stopped before removing it.`,
      );
    }
    try {
      writeSync(fd, JSON.stringify({ pid: process.pid, created_at: now() }));
    } finally {
      closeSync(fd);
    }
  }

  private release(): void {
    rmSync(this.lock, { force: true });
  }

  writer<T>(body: () => T): T {
    this.acquire();
    try {
      return body();
    } finally {
      this.release();
    }
  }

  async writerAsync<T>(body: () => Promise<T>): Promise<T> {
    this.acquire();
    try {
      return await body();
    } finally {
      this.release();
    }
  }

  exists(): boolean {
    return existsSync(this.path);
  }

  /** Other task records here with an uncertain action or merge, or awaiting reconciliation. */
  openElsewhere(): string[] {
    const common = commonDir(this.repo);
    const names: string[] = [];
    for (const dir of RECORD_DIRS) {
      const base = join(common, dir);
      if (!existsSync(base)) continue;
      for (const name of readdirSync(base)) {
        const path = join(base, name, 'task.json');
        if (path === this.path || !existsSync(path)) continue;
        try {
          const data = JSON.parse(readFileSync(path, 'utf8')) as Task;
          if (finished(data) || unstartedMerge(data)) continue;
          if (data.end_state === 'needs_reconciliation' || uncertain(data)) names.push(name);
        } catch {
          names.push(name);
        }
      }
    }
    return names.sort();
  }

  load(): Task {
    let text: string;
    try {
      text = readFileSync(this.path, 'utf8');
    } catch {
      const name = this.directory.split('/').pop();
      throw new WorkflowError(
        `No task record for '${name}'. Merge requires task state even for a short task. If the ` +
          'task already exists, use its original --task ID and resume; otherwise run:\n' +
          [
            'sh',
            join(pluginRoot, 'server', 'data', 'helper', 'solo'),
            '--repo',
            this.repo,
            '--task',
            name as string,
            'start',
            'Describe this task',
          ]
            .map(shellQuote)
            .join(' '),
      );
    }
    const data = JSON.parse(text) as Task;
    if (data.schema_version !== 1) {
      throw new WorkflowError('Unsupported task schema; preserve and migrate explicitly');
    }
    const root = inventory(this.repo).root;
    if (!belongsTo(data, root)) {
      const name = this.directory.split('/').pop();
      throw new WorkflowError(
        `Task record '${name}' belongs to another worktree (${data.repo}), not ${root}. ` +
          'Run the command from there, or pick a new --task ID for work in this worktree.',
      );
    }
    return data;
  }

  save(data: Task): void {
    atomicJson(this.path, data);
  }

  start(goal: string, constraints: string[], budget?: number): Task {
    return this.writer(() => {
      if (existsSync(this.path))
        throw new WorkflowError('Task exists; use resume instead of overwriting');
      if (!goal.trim() || (budget !== undefined && budget < 1)) {
        throw new WorkflowError('Goal required and increment budget must be positive');
      }
      const actual = inventory(this.repo);
      const data: Task = {
        schema_version: 1,
        repo: actual.root,
        goal,
        constraints,
        budget_increments: budget ?? null,
        phase: 'investigate',
        next_action: 'Choose one bounded increment',
        created_at: now(),
        updated_at: now(),
        snapshot: actual,
        increments: [],
        actions: {},
        evidence: [],
        owned_worktrees: [],
        reconciliations: [],
        end_state: 'in_progress',
      };
      this.save(data);
      return data;
    });
  }

  resume() {
    return this.writer(() => {
      const data = this.load();
      const actual = inventory(this.repo);
      const stale = actual.fingerprint !== data.snapshot.fingerprint;
      const pending = Object.entries(data.actions)
        .filter(([, action]) => OPEN.has(action.status))
        .map(([key]) => key);
      const intent = data.merge_intent;
      const uncertainMerge = Boolean(intent && OPEN.has(intent.status));
      const reconciliation = {
        at: now(),
        prior_end_state: data.end_state,
        stale,
        uncertain_actions: pending,
        uncertain_merge: uncertainMerge ? { ...intent } : null,
        prior_head: data.snapshot.head,
        actual_head: actual.head,
        ci: 'unknown; re-check CI',
      };
      data.reconciliations.push(reconciliation);
      data.snapshot = actual;
      data.updated_at = now();
      if (stale || pending.length || uncertainMerge || data.end_state === 'needs_reconciliation') {
        data.end_state = 'needs_reconciliation';
      }
      this.save(data);
      return { reconciliation, task: data };
    });
  }

  reconcile(evidence: string): Task {
    if (!evidence.trim()) throw new WorkflowError('Describe observed effects and preserved work');
    return this.writer(() => {
      const data = this.load();
      let endState = data.end_state;
      if (endState === 'needs_reconciliation') endState = priorEndState(data);
      endState = endState === 'merged' && !uncertain(data) ? 'merged' : 'in_progress';
      for (const action of Object.values(data.actions)) {
        if (OPEN.has(action.status))
          Object.assign(action, { status: 'reconciled', resolution: evidence });
      }
      const intent = data.merge_intent;
      if (intent && OPEN.has(intent.status)) {
        // The operator has inspected the provider; keep the record, allow a new attempt.
        Object.assign(intent, { status: 'reconciled', resolution: evidence });
        data.merge_history = [...(data.merge_history ?? []), intent];
        delete data.merge_intent;
      }
      data.reconciliations.push({ at: now(), resolution: evidence });
      Object.assign(data, {
        snapshot: inventory(this.repo),
        end_state: endState,
        updated_at: now(),
      });
      this.save(data);
      return data;
    });
  }

  checkpoint(phase: string, nextAction: string, acceptance: string): Task {
    const name = PHASE_ALIASES[phase] ?? phase;
    if (!PHASES.includes(name)) throw new WorkflowError('Unknown phase');
    if (!nextAction.trim() || !acceptance.trim()) {
      throw new WorkflowError('Next action and acceptance criteria required');
    }
    return this.writer(() => {
      const data = this.load();
      if (data.end_state === 'needs_reconciliation' || uncertain(data)) {
        throw new WorkflowError('Reconcile uncertain work before checkpointing');
      }
      if (inventory(this.repo).fingerprint !== data.snapshot.fingerprint) {
        throw new WorkflowError('Working state changed; resume and reconcile before checkpointing');
      }
      const limit = data.budget_increments;
      if (limit !== null && data.increments.length >= limit) {
        throw new WorkflowError('Increment budget exhausted; revisit scope with user');
      }
      data.increments.push({ phase: name, next_action: nextAction, acceptance, at: now() });
      Object.assign(data, {
        phase: name,
        end_state: name === 'build' ? 'in_progress' : data.end_state,
        next_action: nextAction,
        updated_at: now(),
        snapshot: inventory(this.repo),
      });
      this.save(data);
      return data;
    });
  }
}

function shellQuote(value: string): string {
  return /^[\w./=:@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}
