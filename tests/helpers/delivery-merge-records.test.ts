import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { merge } from '../../plugins/sidecut-solo/server/src/helper/lib/delivery.ts';
import { git, inventory } from '../../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import {
  atomicJson,
  defaultTask,
  Store,
} from '../../plugins/sidecut-solo/server/src/helper/lib/state.ts';
import { cleanReview, cli, commit, fakeGh, makeRepo, type Rule } from './fixture.ts';
import { provider } from './gh-replies.ts';

// The merge records a checkout keeps between merges.
describe('merge', () => {
  function task(name: string) {
    const { repo, tmp } = makeRepo();
    const store = new Store(repo, name);
    store.start('Deliver', []);
    return { repo, tmp, store, head: inventory(repo).head };
  }

  /** Merges PR `number` at this checkout's HEAD through the CLI, as Finish runs it. */
  function cliMerge(repo: string, number: string, task: string[] = []) {
    const head = inventory(repo).head;
    const path = `repos/{owner}/{repo}/pulls/${number}`;
    const [first, ...rest] = provider(head);
    fakeGh([{ ...(first as Rule), args: ['api', path] }, ...rest]);
    return cli([
      '--repo',
      repo,
      ...task,
      'merge',
      number,
      '--reviewed-head',
      head,
      '--reviewer',
      'user',
      '--review-notes',
      'x',
      '--blocking-findings',
      '0',
      '--authorized',
      '--publication-effect',
      'none',
      '--host-scope',
      'allowed',
    ]);
  }

  // Seen merging PR 56 in a checkout whose default record was "Merge PR 53", merged.
  test("a finished merge's record never blocks the next PR merged in that checkout", () => {
    const { repo } = makeRepo();
    expect(cliMerge(repo, '53').code).toBe(0);
    const record = new Store(repo, defaultTask(repo));
    expect(record.load().end_state).toBe('merged');
    // Main moves on and the next PR's branch is checked out here: the old snapshot is stale.
    commit(repo, 'next.txt', 'next\n', 'Next PR');
    const result = cliMerge(repo, '56');
    expect(result.stderr).not.toContain('Blocked');
    expect(result.code).toBe(0);
    const final = record.load();
    expect(final.merge_history?.map((item) => item.pr)).toEqual(['53', '56']);
    expect(final.end_state).toBe('merged');
  });

  test('a resumed finished merge never blocks a new task record', () => {
    const { repo } = makeRepo();
    expect(cliMerge(repo, '53').code).toBe(0);
    commit(repo, 'next.txt', 'next\n', 'Next PR');
    const record = new Store(repo, defaultTask(repo));
    // An older helper marked a stale finished record as needing reconciliation on resume.
    const data = record.load();
    data.reconciliations.push({ at: 'then', prior_end_state: 'merged', stale: true });
    data.end_state = 'needs_reconciliation';
    atomicJson(record.path, data);
    expect(record.openElsewhere()).toEqual([]);
    expect(new Store(repo, 'merge-guard-56').openElsewhere()).toEqual([]);
    // Resume still asks for a look at what changed, but that never blocks another merge.
    expect(record.resume().task.end_state).toBe('needs_reconciliation');
    expect(record.openElsewhere()).toEqual([]);
    const result = cliMerge(repo, '56', ['--task', 'merge-guard-56']);
    expect(result.stderr).not.toContain('Blocked');
    expect(new Store(repo, 'merge-guard-56').load().end_state).toBe('merged');
    // Uncertain work on a merged record still blocks: an unconfirmed action may have run.
    const open = record.load();
    open.actions.deploy = { status: 'uncertain' } as never;
    atomicJson(record.path, open);
    expect(new Store(repo, 'later').openElsewhere()).toEqual([defaultTask(repo)]);
    expect(cliMerge(repo, '57').stderr).toContain('Reconcile uncertain work');
  });

  // Seen in a real repo: "Merge PR 38" was refused before it started, merged under another
  // record, and its default record then refused every later merge in that checkout.
  test('a merge record whose merge never started never blocks the next merge', () => {
    const { repo } = makeRepo();
    const refused = cli([
      '--repo',
      repo,
      'merge',
      '38',
      '--reviewed-head',
      inventory(repo).head,
      '--reviewer',
      'user',
      '--review-notes',
      'x',
      '--blocking-findings',
      '0',
      '--publication-effect',
      'none',
      '--host-scope',
      'allowed',
    ]);
    expect(refused.stderr).toContain('has not allowed this merge');
    const record = new Store(repo, defaultTask(repo));
    expect(record.load().merge_intent).toBeUndefined();
    commit(repo, 'next.txt', 'next\n', 'Next PR');
    // Resuming it marks it for reconciliation; it still holds nothing to reconcile.
    expect(record.resume().task.end_state).toBe('needs_reconciliation');
    expect(new Store(repo, 'other').openElsewhere()).toEqual([]);
    const result = cliMerge(repo, '56');
    expect(result.stderr).not.toContain('Blocked');
    expect(result.code).toBe(0);
    const final = record.load();
    expect(final.goal).toBe('Merge PR 56');
    expect(final.end_state).toBe('merged');
    expect(final.reconciliations.some((r) => r.resolution === 'superseded')).toBe(true);
  });

  test('a merge record with recorded work still blocks after its snapshot goes stale', () => {
    const { repo } = makeRepo();
    const record = new Store(repo, defaultTask(repo));
    record.start('Merge PR 38', []);
    const data = record.load();
    data.actions.build = { status: 'done' } as never;
    atomicJson(record.path, data);
    commit(repo, 'next.txt', 'next\n', 'Next PR');
    expect(cliMerge(repo, '56').stderr).toContain('Working state changed');
  });

  test("without --task, a worktree merges past another worktree's default record", () => {
    const { repo, tmp } = makeRepo();
    // An older helper's `default` record, left by a worktree that is gone.
    const legacy = new Store(repo, 'default');
    legacy.start('Old scratch work', []);
    const data = legacy.load();
    data.repo = '/private/tmp/long-gone';
    atomicJson(legacy.path, data);
    const before = readFileSync(legacy.path, 'utf8');
    const fresh = join(tmp, 'fresh');
    git(repo, ['worktree', 'add', '--detach', fresh, 'HEAD']);
    const head = inventory(fresh).head;
    const calls = fakeGh(provider(head));
    const args = [
      'merge',
      '1',
      '--reviewed-head',
      head,
      '--reviewer',
      'user',
      '--review-notes',
      'x',
      '--blocking-findings',
      '0',
      '--authorized',
      '--publication-effect',
      'none',
      '--host-scope',
      'allowed',
    ];
    // Naming the other worktree's record still refuses.
    expect(cli(['--repo', fresh, '--task', 'default', ...args]).stderr).toContain(
      'belongs to another worktree',
    );
    expect(calls().some((call) => call[1] === '--method')).toBe(false);
    const result = cli(['--repo', fresh, ...args]);
    expect(result.code).toBe(0);
    const own = defaultTask(fresh);
    expect(own).toMatch(/^default-[0-9a-f]{12}$/);
    expect(result.stderr).toContain(`Started task record '${own}'`);
    expect(new Store(fresh, own).load().end_state).toBe('merged');
    expect(readFileSync(legacy.path, 'utf8')).toBe(before);
  });

  test('a worktree keeps using a default record it already owns', () => {
    const { repo, tmp } = makeRepo();
    new Store(repo, 'default').start('Started by an older helper', []);
    expect(defaultTask(repo)).toBe('default');
    const other = join(tmp, 'other');
    git(repo, ['worktree', 'add', '--detach', other, 'HEAD']);
    expect(defaultTask(other)).toMatch(/^default-[0-9a-f]{12}$/);
  });

  test('untracked host files under .claude/ do not block a merge', () => {
    const { repo, head } = task('host-files');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    writeFileSync(join(repo, '.claude/launch.json'), '{}\n');
    const store = new Store(repo, 'host-files');
    expect(inventory(repo).host_untracked).toEqual(['.claude/launch.json']);
    fakeGh(provider(head));
    merge(store, '1', true, cleanReview(head));
    expect(store.load().end_state).toBe('merged');
    mkdirSync(join(repo, '.claude/skills/new'), { recursive: true });
    writeFileSync(join(repo, '.claude/skills/new/SKILL.md'), 'part of the change\n');
    writeFileSync(join(repo, 'notes.txt'), 'mine\n');
    expect(inventory(repo).status).toEqual(['?? .claude/skills/new/SKILL.md', '?? notes.txt']);
  });

  test('when-green supplies merge permission without a user flag', () => {
    const { repo, tmp, head } = task('green');
    writeFileSync(join(repo, 'solo-workflow.toml'), 'merge = "when-green"\n');
    writeFileSync(join(repo, '.git/info/exclude'), 'solo-workflow.toml\n');
    store_reconcile(repo, 'green');
    writeFileSync(join(tmp, 'review.json'), JSON.stringify(cleanReview(head)));
    fakeGh(provider(head));
    const result = cli([
      '--repo',
      repo,
      '--task',
      'green',
      'merge',
      '1',
      '--review',
      join(tmp, 'review.json'),
      '--publication-effect',
      'none',
      '--host-scope',
      'allowed',
    ]);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).state).toBe('MERGED');
  });
});

function store_reconcile(repo: string, name: string) {
  const store = new Store(repo, name);
  store.resume();
  store.reconcile('Added local settings only');
}
