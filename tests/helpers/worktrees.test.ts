import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  cleanupWorktree,
  createWorktree,
} from '../../plugins/sidecut-solo/server/src/helper/lib/delivery.ts';
import { run } from '../../plugins/sidecut-solo/server/src/helper/lib/execution.ts';
import { git } from '../../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import { owns, Store } from '../../plugins/sidecut-solo/server/src/helper/lib/state.ts';
import { makeRepo } from './fixture.ts';

describe('task worktrees', () => {
  test('a task continues from its own worktree and cleans up only preserved work', async () => {
    const { repo, tmp } = makeRepo();
    const origin = new Store(repo, 'isolated');
    origin.start('Fix addition in isolation', []);
    const path = join(tmp, 'isolated');
    createWorktree(origin, path, 'HEAD');
    const task = new Store(path, 'isolated');
    task.checkpoint('build', 'Fix add', 'addition works');
    const fix = "require('fs').writeFileSync('calc.py', 'def add(a, b):\\n    return a + b\\n')";
    expect((await run(task, 'fix', [process.execPath, '-e', fix])).status).toBe('passed');
    expect(readFileSync(join(path, 'calc.py'), 'utf8')).toContain('a + b');
    expect(readFileSync(join(repo, 'calc.py'), 'utf8')).toContain('a - b');
    git(path, ['commit', '-am', 'fix addition']);
    task.resume();
    task.reconcile('Committed the fix in the task worktree');
    task.checkpoint('review', 'Review the fix', 'diff read');
    // The original checkout no longer matches the task's snapshot and must reconcile first.
    expect(() => origin.checkpoint('finish', 'Wrap up', 'fix archived')).toThrow(
      'Working state changed',
    );
    git(repo, ['branch', 'archive/isolated', git(path, ['rev-parse', 'HEAD'])]);
    expect(cleanupWorktree(origin, path, 'archive/isolated').status).toBe('removed');
  });

  test('an unowned worktree cannot use the task', () => {
    const { repo, tmp } = makeRepo();
    new Store(repo, 'owned-only').start('Stay in recorded checkouts', []);
    const other = join(tmp, 'other');
    git(repo, ['worktree', 'add', '--detach', other, 'HEAD']);
    expect(() => new Store(other, 'owned-only').resume()).toThrow('another worktree');
  });

  test('a replaced task worktree loses access and is never cleaned up', () => {
    const { repo, tmp } = makeRepo();
    const origin = new Store(repo, 'replaced');
    origin.start('Do not adopt replacements', []);
    const path = join(tmp, 'reused');
    createWorktree(origin, path, 'HEAD');
    git(repo, ['worktree', 'remove', path]);
    git(repo, ['worktree', 'add', '--detach', path, 'HEAD']);
    expect(() => new Store(path, 'replaced').resume()).toThrow('another worktree');
    expect(() => cleanupWorktree(origin, path, 'main')).toThrow('creation identity');
    expect(existsSync(path)).toBe(true);
  });

  test('cleanup keeps dirty work, unique commits and other worktrees', () => {
    const { repo, tmp } = makeRepo();
    const store = new Store(repo, 'cleanup');
    store.start('Clean task work only', []);
    const path = join(tmp, 'owned');
    createWorktree(store, path, 'HEAD');
    writeFileSync(join(path, 'untracked'), 'valuable');
    expect(() => cleanupWorktree(store, path, 'main')).toThrow('preserve first');
    unlinkSync(join(path, 'untracked'));
    writeFileSync(join(path, 'valuable.txt'), 'unique commit\n');
    git(path, ['add', '.']);
    git(path, ['commit', '-m', 'unique work']);
    const unique = git(path, ['rev-parse', 'HEAD']);
    expect(() => cleanupWorktree(store, path, unique)).toThrow('named local branch');
    expect(() => cleanupWorktree(store, path, 'main')).toThrow('not contained');
    expect(git(path, ['rev-parse', 'HEAD'])).toBe(unique);
    git(repo, ['branch', 'archive/task-cleanup', unique]);
    expect(cleanupWorktree(store, path, 'archive/task-cleanup').status).toBe('removed');
    expect(existsSync(path)).toBe(false);
    expect(git(repo, ['rev-parse', 'archive/task-cleanup'])).toBe(unique);
    expect(() => cleanupWorktree(store, repo, 'main')).toThrow('recorded worktrees');
  });

  test('ignored files block cleanup', () => {
    const { repo, tmp } = makeRepo();
    const store = new Store(repo, 'ignored');
    store.start('Preserve ignored work', []);
    const path = join(tmp, 'owned');
    createWorktree(store, path, 'HEAD');
    writeFileSync(join(path, '.gitignore'), 'cache/\n');
    git(path, ['add', '.gitignore']);
    git(path, ['commit', '-m', 'ignore cache']);
    git(repo, ['branch', 'archive/ignored', git(path, ['rev-parse', 'HEAD'])]);
    mkdirSync(join(path, 'cache'));
    writeFileSync(join(path, 'cache/private'), 'valuable ignored work');
    expect(() => cleanupWorktree(store, path, 'archive/ignored')).toThrow('preserve first');
  });

  test('new worktrees get a Solo marker; older markers still prove ownership', () => {
    const { repo, tmp } = makeRepo();
    const store = new Store(repo, 'marker');
    store.start('preserve ownership', []);
    const path = join(tmp, 'worktree');
    createWorktree(store, path, 'HEAD');
    const record = store.load().owned_worktrees[0];
    if (!record) throw new Error('no record');
    const admin = git(path, ['rev-parse', '--path-format=absolute', '--git-dir']);
    const marker = join(admin, 'solo-workflow-owner');
    expect(readFileSync(marker, 'utf8')).toBe(record.creation_token);
    expect(owns(record)).toBe(true);
    writeFileSync(marker, 'wrong owner');
    expect(owns(record)).toBe(false); // A bad current marker must not fall back to an old token.
  });
});

test('cleanup succeeds while a sibling worktree with a longer path remains', () => {
  const { repo, tmp } = makeRepo();
  const store = new Store(repo, 'sibling');
  store.start('Remove only mine', []);
  const path = join(tmp, 'wt');
  createWorktree(store, path, 'HEAD');
  git(repo, ['worktree', 'add', '--detach', join(tmp, 'wt-2'), 'HEAD']);
  git(repo, ['branch', 'archive/sibling', 'HEAD']);
  expect(cleanupWorktree(store, path, 'archive/sibling').status).toBe('removed');
  expect(existsSync(join(tmp, 'wt-2'))).toBe(true);
});
