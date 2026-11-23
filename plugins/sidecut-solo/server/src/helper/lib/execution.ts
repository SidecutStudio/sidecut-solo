// Bounded commands with intent recorded before execution and no blind replay.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inventory, WorkflowError } from './git.ts';
import { type Action, now, type Store } from './state.ts';

const KEEP = 20_000;

function tail(chunks: Buffer[]): string {
  return Buffer.concat(chunks).subarray(-80_000).toString('utf8').slice(-KEEP);
}

type Outcome = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

/**
 * Runs argv in its own process group so a timeout stops every descendant before effects are
 * snapshotted. Pipes inherited by descendants keep the command pending until they close.
 */
function execute(argv: string[], cwd: string, timeoutMs: number): Promise<Outcome> {
  return new Promise((done, fail) => {
    const child = spawn(argv[0] as string, argv.slice(1), {
      cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    // Bound memory by bytes: only the last 80KB of each stream is ever reported.
    const keep = (target: Buffer[]) => {
      let size = 0;
      return (chunk: Buffer) => {
        target.push(chunk);
        size += chunk.length;
        while (target.length > 1 && size - (target[0] as Buffer).length >= 80_000) {
          size -= (target.shift() as Buffer).length;
        }
      };
    };
    child.stdout.on('data', keep(out));
    child.stderr.on('data', keep(err));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-(child.pid as number), 'SIGKILL');
      } catch {}
      // A descendant that left the process group may still hold the pipes; stop waiting on them.
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      done({ code: null, stdout: tail(out), stderr: tail(err), timedOut });
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (!timedOut) done({ code, stdout: tail(out), stderr: tail(err), timedOut });
    });
  });
}

export async function run(store: Store, key: string, argv: string[], timeout = 120) {
  if (!argv.length || !(timeout >= 1 && timeout <= 900) || !key.trim()) {
    throw new WorkflowError('Command, action key and timeout of 1–900 seconds required');
  }
  const signature = createHash('sha256').update(JSON.stringify(argv)).digest('hex');
  return store.writerAsync(async () => {
    const data = store.load();
    const intent = data.merge_intent?.status ?? '';
    if (
      data.end_state === 'needs_reconciliation' ||
      intent === 'started' ||
      intent === 'uncertain'
    ) {
      throw new WorkflowError('Reconcile changed state and uncertain actions before execution');
    }
    const previous = data.actions[key];
    if (previous) {
      if (previous.signature !== signature) {
        throw new WorkflowError('Action ID reused for a different command');
      }
      if (previous.status === 'started') {
        throw new WorkflowError('Uncertain action; inspect effects, never replay automatically');
      }
      return { ...previous, replayed: false, cached: true };
    }
    const actual = inventory(store.repo);
    if (actual.fingerprint !== data.snapshot.fingerprint) {
      throw new WorkflowError('Working state changed; resume and checkpoint before execution');
    }
    const action: Action = {
      signature,
      argv,
      status: 'started',
      started_at: now(),
      before: actual,
    };
    data.actions[key] = action;
    store.save(data);
    try {
      const outcome = await execute(argv, store.repo, timeout * 1000);
      if (outcome.timedOut) {
        Object.assign(action, { status: 'uncertain', error: 'TimeoutExpired' });
        data.end_state = 'needs_reconciliation';
      } else {
        Object.assign(action, {
          status: outcome.code === 0 ? 'passed' : 'failed',
          returncode: outcome.code,
          stdout: outcome.stdout,
          stderr: outcome.stderr,
        });
      }
    } catch (error) {
      Object.assign(action, { status: 'uncertain', error: (error as Error).name || 'OSError' });
      data.end_state = 'needs_reconciliation';
    }
    action.finished_at = now();
    action.after = inventory(store.repo);
    data.snapshot = action.after;
    data.updated_at = now();
    data.evidence.push({
      kind: 'command',
      action: key,
      head: action.after.head,
      status: action.status,
      fingerprint: action.after.fingerprint,
      at: now(),
    });
    store.save(data);
    return action;
  });
}
