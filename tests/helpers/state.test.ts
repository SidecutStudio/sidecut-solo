import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { run } from '../../plugins/sidecut-solo/server/src/helper/lib/execution.ts';
import { commonDir, git, inventory } from '../../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import {
  atomicJson,
  Store,
  type Task,
} from '../../plugins/sidecut-solo/server/src/helper/lib/state.ts';
import { runCommand } from '../process.ts';
import { makeRepo, scratch } from './fixture.ts';

const write = (path: string) => [
  process.execPath,
  '-e',
  `require('fs').writeFileSync(${JSON.stringify(path)}, 'once')`,
];
const noop = [process.execPath, '-e', "console.log('must not run')"];

describe('task records', () => {
  test('a stale checkpoint needs reconciling and actions never run twice', async () => {
    const { repo } = makeRepo();
    const store = new Store(repo, 'recovery');
    const original = store.start('Fix addition', ['preserve customer notes'], 2);
    writeFileSync(join(repo, 'valuable.txt'), 'user changed this\n');
    writeFileSync(join(repo, 'notes.private'), 'unique untracked notes');
    expect(store.resume().reconciliation.stale).toBe(true);
    expect(store.resume().task.end_state).toBe('needs_reconciliation');
    await expect(run(store, 'repair', noop)).rejects.toThrow('Reconcile');
    store.reconcile('Inspected dirty tracked file and unique notes; both preserved');
    store.checkpoint('build', 'Fix add only', 'addition works; notes unchanged');
    const action = write('count');
    expect((await run(store, 'once', action)).status).toBe('passed');
    expect(((await run(store, 'once', action)) as { cached?: boolean }).cached).toBe(true);
    expect(readFileSync(join(repo, 'count'), 'utf8')).toBe('once');
    await expect(run(store, 'once', noop)).rejects.toThrow('different command');
    expect(original.snapshot.head).toBe(inventory(repo).head);
    expect(readFileSync(join(repo, 'valuable.txt'), 'utf8')).toBe('user changed this\n');
    expect(readFileSync(join(repo, 'notes.private'), 'utf8')).toBe('unique untracked notes');
  });

  test('a process killed after recording intent leaves an uncertain action', () => {
    const { repo } = makeRepo();
    const store = new Store(repo, 'interrupted');
    store.start('Survive stop', []);
    const lib = join(
      import.meta.dirname,
      '..',
      '..',
      'plugins/sidecut-solo/server/src/helper/lib/state.ts',
    );
    const script = `
      import { Store, atomicJson } from ${JSON.stringify(lib)};
      const s = new Store(process.argv[2], 'interrupted');
      s.writer(() => {
        const d = s.load();
        d.actions['commit-1'] = { status: 'started', signature: 'fixture' };
        atomicJson(s.path, d);
        process.exit(73);
      });`;
    const file = join(scratch(), 'crash.ts');
    writeFileSync(file, script);
    expect(runCommand([process.execPath, file, repo], { env: process.env }).status).toBe(73);
    expect(existsSync(store.lock)).toBe(true);
    expect(() => store.resume()).toThrow('Writer lock exists');
    expect(JSON.parse(readFileSync(store.lock, 'utf8')).pid).not.toBe(process.pid);
    rmSync(store.lock);
    expect(store.resume().reconciliation.uncertain_actions).toEqual(['commit-1']);
    store.reconcile('Verified no commit was written; retain old key and use a new action ID');
    expect(store.load().actions['commit-1']?.status).toBe('reconciled');
  });

  test('task IDs, writer locks, budgets and schema versions are guarded', () => {
    const { repo } = makeRepo();
    expect(() => new Store(repo, '../escape')).toThrow('Task ID');
    const store = new Store(repo, 'bounded');
    store.start('Bounded', [], 1);
    expect(() => store.writer(() => store.checkpoint('build', 'one', 'one'))).toThrow(
      'Writer lock',
    );
    store.checkpoint('build', 'one', 'one');
    expect(() => store.checkpoint('build', 'two', 'two')).toThrow('budget exhausted');
    const data = store.load() as unknown as Record<string, unknown>;
    data.schema_version = 42;
    atomicJson(store.path, data);
    expect(() => store.load()).toThrow('Unsupported');
  });

  test('a missing tool is uncertain, not success', async () => {
    const { repo } = makeRepo();
    const store = new Store(repo, 'tools');
    store.start('Check missing tools', []);
    expect((await run(store, 'missing', ['nonexistent-solo-binary'])).status).toBe('uncertain');
    await expect(run(store, 'new-action', noop)).rejects.toThrow('Reconcile');
    expect(store.resume().reconciliation.uncertain_actions).toEqual(['missing']);
  });

  for (const status of ['started', 'uncertain']) {
    test(`a ${status} merge intent needs reconciling after a crash`, async () => {
      const { repo } = makeRepo();
      const store = new Store(repo, 'merge-crash');
      store.start('Recover interrupted merge', []);
      const data = store.load();
      data.merge_intent = {
        pr: '1',
        head: data.snapshot.head,
        status,
        reviewer: 'same-agent',
        at: '',
      };
      atomicJson(store.path, data);
      // Even before resume, a new checkpoint cannot conceal an unconfirmed remote effect.
      expect(() => store.checkpoint('build', 'continue', 'verified')).toThrow('Reconcile');
      const resumed = store.resume();
      expect(resumed.reconciliation.stale).toBe(false);
      expect(resumed.reconciliation.uncertain_merge?.pr).toBe('1');
      expect(resumed.task.end_state).toBe('needs_reconciliation');
      await expect(run(store, 'new-action', noop)).rejects.toThrow('Reconcile');
      store.reconcile('Provider confirms merge outcome; work preserved');
      store.checkpoint('finish', 'report', 'provider verified');
      expect(store.load().merge_history?.at(-1)?.status).toBe('reconciled');
    });
  }

  test('resuming again does not duplicate increments or overwrite the task', () => {
    const { repo } = makeRepo();
    const store = new Store(repo, 'reentry');
    store.start('Resume repeatedly', []);
    store.checkpoint('investigate', 'inspect', 'observed');
    for (let i = 0; i < 4; i++) expect(store.resume().reconciliation.stale).toBe(false);
    expect(store.load().increments).toHaveLength(1);
    expect(() => store.start('overwrite', [])).toThrow('Task exists');
  });

  test('staged-only changes and a branch switch invalidate the snapshot', () => {
    const { repo } = makeRepo();
    const store = new Store(repo, 'index');
    store.start('Preserve staged work', []);
    const original = readFileSync(join(repo, 'valuable.txt'));
    writeFileSync(join(repo, 'valuable.txt'), 'user staged content\n');
    git(repo, ['add', 'valuable.txt']);
    writeFileSync(join(repo, 'valuable.txt'), original);
    expect(store.resume().reconciliation.stale).toBe(true);
    store.reconcile('Observed distinct index and working content; preserved both');
    git(repo, ['checkout', '-b', 'same-head-another-branch']);
    expect(store.resume().reconciliation.stale).toBe(true);
  });

  test('works in an unborn repository', () => {
    const root = join(scratch(), 'new');
    mkdirSync(root);
    git(root, ['init', '-b', 'main']);
    new Store(root, 'initial').start('Build in a new repo', []);
  });

  test('a verify checkpoint refuses unreconciled subject changes', () => {
    const { repo } = makeRepo();
    const store = new Store(repo, 'qa-subject');
    store.start('Exercise addition', []);
    store.checkpoint('build', 'implement', 'addition works');
    writeFileSync(join(repo, 'calc.py'), 'def add(a, b):\n    return a + b\n');
    expect(() => store.checkpoint('verify', 'exercise addition', '2 + 3 equals 5')).toThrow(
      'Working state changed',
    );
    store.resume();
    expect(() => store.checkpoint('verify', 'exercise addition', '2 + 3 equals 5')).toThrow(
      'Reconcile',
    );
    store.reconcile('Inspected addition fix and preserved user work; no QA executed yet');
    const recorded = store.checkpoint('verify', 'exercise addition', '2 + 3 equals 5');
    expect(recorded.phase).toBe('verify');
    expect(recorded.increments.at(-1)?.acceptance).toBe('2 + 3 equals 5');
    expect(recorded.evidence).toEqual([]); // Checkpoint intent is not a QA pass or review receipt.
  });

  for (const kind of ['action', 'merge']) {
    test(`a checkpoint cannot hide an uncertain ${kind}`, () => {
      const { repo } = makeRepo();
      const store = new Store(repo, 'qa-uncertain');
      const data = store.start('Exercise interrupted workflow', []) as Task;
      if (kind === 'action')
        data.actions['previous-run'] = { status: 'started', signature: 'fixture' } as never;
      else data.merge_intent = { status: 'uncertain', pr: '1' } as never;
      atomicJson(store.path, data);
      expect(() => store.checkpoint('verify', 'rerun scenario', 'fresh evidence')).toThrow(
        'Reconcile',
      );
      expect(store.load().phase).toBe('investigate');
    });
  }

  test('older phase names are read as the Solo names', () => {
    const { repo } = makeRepo();
    const store = new Store(repo, 'renamed-phase');
    store.start('Pick an approach', [], 4);
    for (const [old, current] of [
      ['brainstorm', 'explore'],
      ['inspect', 'investigate'],
      ['qa', 'verify'],
    ]) {
      store.checkpoint(old as string, 'next', 'done');
      expect(store.load().phase).toBe(current as string);
    }
    expect(() => store.checkpoint('ideate', 'x', 'y')).toThrow('Unknown phase');
  });

  test('the missing-record error prints a recovery command that works', () => {
    const { repo, tmp } = makeRepo();
    const spaced = join(tmp, 'repo with spaces');
    renameSync(repo, spaced);
    let message = '';
    try {
      new Store(spaced, 'short-fix').load();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('No task record');
    expect(message).toContain('short task');
    const command = message.split('otherwise run:\n')[1] as string;
    expect(runCommand(['sh', '-c', command], { env: process.env }).status).toBe(0);
    expect(new Store(spaced, 'short-fix').load().goal).toBe('Describe this task');
  });
});

test('new tasks use solo-workflow/', () => {
  const { repo } = makeRepo();
  const store = new Store(repo, 'current');
  store.start('new work', []);
  expect(store.path).toBe(join(commonDir(repo), 'solo-workflow/current/task.json'));
});
