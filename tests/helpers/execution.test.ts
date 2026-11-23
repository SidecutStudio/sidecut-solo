import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, test } from 'vitest';
import { run } from '../../plugins/sidecut-solo/server/src/helper/lib/execution.ts';
import { atomicJson, Store } from '../../plugins/sidecut-solo/server/src/helper/lib/state.ts';
import { makeRepo } from './fixture.ts';

describe('run', () => {
  for (const status of ['started', 'uncertain']) {
    test(`a ${status} merge intent blocks execution before resume`, async () => {
      const { repo } = makeRepo();
      const store = new Store(repo, 'merge-intent');
      const data = store.start('Reconcile interrupted merge', []);
      data.merge_intent = { status } as never;
      atomicJson(store.path, data);
      await expect(run(store, 'blocked', ['touch', 'unexpected'])).rejects.toThrow('Reconcile');
      expect(existsSync(join(repo, 'unexpected'))).toBe(false);
    });
  }

  for (const parentWait of [0, 30]) {
    test(`a timeout stops descendants before recording effects (parent waits ${parentWait}s)`, async () => {
      const { repo } = makeRepo();
      const store = new Store(repo, 'timeout-tree');
      store.start('Stop command descendants on timeout', []);
      const script = `(touch child-started; sleep 2; touch late-write) & sleep ${parentWait}`;
      const action = await run(store, 'timeout', ['sh', '-c', script], 1);
      expect(action.status).toBe('uncertain');
      expect((action as { error?: string }).error).toBe('TimeoutExpired');
      expect(store.load().end_state).toBe('needs_reconciliation');
      expect(existsSync(join(repo, 'child-started'))).toBe(true);
      await sleep(1500);
      expect(existsSync(join(repo, 'late-write'))).toBe(false);
    });
  }

  test('large output is bounded without deadlocking', async () => {
    const { repo } = makeRepo();
    const store = new Store(repo, 'large-output');
    store.start('Keep only bounded command output', []);
    const code =
      "process.stdout.write('a'.repeat(3000000) + 'VISIBLE_OUT'); process.stderr.write('b'.repeat(3000000) + 'VISIBLE_ERR')";
    const action = (await run(store, 'large', [process.execPath, '-e', code], 15)) as {
      status: string;
      stdout: string;
      stderr: string;
    };
    expect(action.status).toBe('passed');
    expect(action.stdout.endsWith('VISIBLE_OUT')).toBe(true);
    expect(action.stderr.endsWith('VISIBLE_ERR')).toBe(true);
    expect(action.stdout.length).toBeLessThanOrEqual(20000);
    expect(action.stderr.length).toBeLessThanOrEqual(20000);
  });

  test('a failing command is recorded as failed', async () => {
    const { repo } = makeRepo();
    const store = new Store(repo, 'fails');
    store.start('Record failures', []);
    const action = await run(store, 'fail', ['sh', '-c', 'echo nope >&2; exit 3']);
    expect(action.status).toBe('failed');
    expect(action.returncode).toBe(3);
    expect(action.stderr).toBe('nope\n');
  });
});
