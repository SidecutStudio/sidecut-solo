import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { merge } from '../../plugins/sidecut-solo/server/src/helper/lib/delivery.ts';
import { git, inventory } from '../../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import { atomicJson, Store } from '../../plugins/sidecut-solo/server/src/helper/lib/state.ts';
import { cleanReview, cli, commit, fakeGh, makeRepo, type Rule } from './fixture.ts';
import { PR, provider, restPr } from './gh-replies.ts';

describe('merge', () => {
  function task(name: string) {
    const { repo, tmp } = makeRepo();
    const store = new Store(repo, name);
    store.start('Deliver', []);
    return { repo, tmp, store, head: inventory(repo).head };
  }

  test('cannot bypass reconciliation, and blocks before the network', () => {
    const { store } = task('merge');
    const data = store.load();
    data.end_state = 'needs_reconciliation';
    atomicJson(store.path, data);
    const calls = fakeGh([]);
    expect(() => merge(store, '1', true, {})).toThrow('Reconcile');
    expect(calls()).toEqual([]);
  });

  test('does not reuse an old intent', () => {
    const { store, head } = task('merge-repeat');
    const data = store.load();
    data.merge_intent = { head, status: 'started' } as never;
    atomicJson(store.path, data);
    fakeGh(provider(head));
    expect(() => merge(store, '1', true, cleanReview(head))).toThrow('Prior merge intent');
  });

  test('a failed merge needs reconciling, then allows a retry', () => {
    const { store, head } = task('merge-failed');
    fakeGh(provider(head, { code: 1, stderr: 'timed out talking to GitHub' }));
    expect(() => merge(store, '1', true, cleanReview(head))).toThrow('reconcile before retry');
    let data = store.load();
    expect(data.end_state).toBe('needs_reconciliation');
    expect(data.merge_intent?.status).toBe('uncertain');
    expect(() => merge(store, '1', true, cleanReview(head))).toThrow('Reconcile');
    store.reconcile('Provider shows PR 1 still open and unmerged');
    data = store.load();
    expect(data.merge_intent).toBeUndefined();
    expect(data.merge_history?.[0]?.status).toBe('reconciled');
  });

  test('the merge method is restricted', () => {
    const { store } = task('merge-method');
    expect(() => merge(store, '1', true, {}, '--admin')).toThrow('Merge method');
  });

  for (const [name, after] of [
    ['unconfirmed', 'open'],
    ['invalid-json', 'not json'],
  ] as const) {
    test(`an ${name} post-merge state stays uncertain`, () => {
      const { store, head } = task('merge-confirmation');
      fakeGh(provider(head, undefined, after === 'open' ? restPr(head) : after));
      expect(() => merge(store, '1', true, cleanReview(head))).toThrow(
        'Post-merge state unconfirmed',
      );
      const data = store.load();
      expect(data.merge_intent?.status).toBe('uncertain');
      expect(data.end_state).toBe('needs_reconciliation');
      expect(store.resume().reconciliation.uncertain_merge?.head).toBe(head);
      expect(() => store.checkpoint('finish', 'claim delivery', 'merged')).toThrow('Reconcile');
    });
  }

  test('a verified merge is archived so the task can merge again', () => {
    const { store, head } = task('merge-twice');
    // The catch-all status rule ends provider(), so PR 2's rule goes first.
    const calls = fakeGh([
      { ...provider(head)[0], args: ['api', 'repos/{owner}/{repo}/pulls/2'] } as Rule,
      ...provider(head),
    ]);
    const data = store.load();
    // Records from older helpers kept a verified intent in place.
    data.merge_intent = { pr: '0', head, status: 'verified' } as never;
    atomicJson(store.path, data);
    for (const number of ['1', '2']) {
      merge(store, number, true, cleanReview(head));
      store.reconcile(`Provider shows PR ${number} merged`);
    }
    const merged = calls().filter((args) => args[1] === '--method');
    expect(merged.map((args) => args[3])).toEqual([
      `${PR}/merge`,
      'repos/{owner}/{repo}/pulls/2/merge',
    ]);
    expect(merged[0]).toContain(`sha=${head}`);
    expect(merged[0]).toContain('merge_method=squash');
    const final = store.load();
    expect(final.merge_intent).toBeUndefined();
    expect(final.merge_history?.map((item) => item.pr)).toEqual(['0', '1', '2']);
    expect(final.end_state).toBe('merged');
  });

  test('the CLI starts a task record when a merge has none', () => {
    const { repo, head } = task('unused');
    const calls = fakeGh(provider(head));
    const result = cli([
      '--repo',
      repo,
      '--task',
      'short-fix',
      'merge',
      '1',
      '--reviewed-head',
      head,
      '--reviewer',
      'independent',
      '--review-notes',
      'Read the diff and tests',
      '--blocking-findings',
      '0',
      '--authorized',
      '--publication-effect',
      'none',
      '--host-scope',
      'allowed',
    ]);
    expect(result.stderr).toContain("Started task record 'short-fix'");
    expect(JSON.parse(result.stdout).state).toBe('MERGED');
    expect(calls().some((args) => args[1] === '--method')).toBe(true);
    expect(new Store(repo, 'short-fix').load().end_state).toBe('merged');
  });

  // Each bad count runs the helper against the fake provider, which takes a few seconds in all.
  // An inline review is checked like a review file. Each case is a refusal before any merge.
  const inline = (head: string) => [
    '--reviewed-head',
    head,
    '--reviewer',
    'user',
    '--review-notes',
    'x',
  ];
  const cases: [string, (head: string) => string[], string, boolean][] = [
    ['no review', () => [], 'needs a review', true],
    [
      'a review of another head',
      () => [
        ...inline('f'.repeat(40)).slice(0, 2),
        '--reviewer',
        'independent',
        '--review-notes',
        'x',
        '--blocking-findings',
        '0',
      ],
      'review does not cover current HEAD',
      true,
    ],
    [
      'a review file and inline flags',
      () => ['--review', 'r.json', '--reviewer', 'user'],
      'not both',
      true,
    ],
    [
      'blocking findings',
      (head) => [...inline(head), '--blocking-findings', '1'],
      'blocking findings',
      true,
    ],
    ...[undefined, '', ' ', '0x0', '-0', '1.0'].map(
      (count): [string, (head: string) => string[], string, boolean] => [
        `findings count ${JSON.stringify(count)}`,
        (head) => [...inline(head), ...(count === undefined ? [] : ['--blocking-findings', count])],
        'blocking findings as a whole number (--blocking-findings <n>)',
        true,
      ],
    ),
    // "none" is a stated zero, so that review lets the merge go ahead.
    [
      'findings count "none"',
      (head) => [...inline(head), '--blocking-findings', 'none'],
      'blocking findings',
      false,
    ],
  ];
  for (const [name, review, message, refused] of cases) {
    test(`an inline review is checked like a review file: ${name}`, () => {
      const { repo, head } = task('inline');
      const calls = fakeGh(provider(head));
      const result = cli([
        ...['--repo', repo, '--task', 'inline', 'merge', '1', '--authorized'],
        ...review(head),
        ...['--publication-effect', 'none', '--host-scope', 'allowed'],
      ]);
      if (refused) {
        expect(result.stderr).toContain(message);
        expect(calls().some((args) => args[1] === '--method')).toBe(false);
      } else {
        expect(result.stderr).not.toContain(message);
        expect(result.code).toBe(0);
      }
    });
  }

  test('one refusal lists every unmet requirement and points to Finish', () => {
    const { repo, head } = task('all-at-once');
    writeFileSync(join(repo, 'notes.txt'), 'mine\n');
    store_reconcile(repo, 'all-at-once');
    const calls = fakeGh(provider(head));
    const result = cli([
      ...['--repo', repo, '--task', 'all-at-once', 'merge', '1', '--reviewed-head', head],
      ...['--reviewer', 'user', '--review-notes', 'x'],
      ...['--publication-effect', 'automatic', '--host-scope', 'allowed'],
    ]);
    expect(result.code).toBe(2);
    for (const reason of [
      'the user has not allowed this merge (--authorized)',
      'blocking findings as a whole number',
      'Delivery worktree must be clean (?? notes.txt)',
      'publishes a release the user has not allowed',
    ])
      expect(result.stderr).toContain(reason);
    expect(result.stderr).toContain('skills/solo-deliver-change/SKILL.md');
    // Missing permission keeps the provider untouched.
    expect(calls()).toEqual([]);
    // Without it, the same refusal also judges the PR at its head.
    const again = cli([
      ...['--repo', repo, '--task', 'all-at-once', 'merge', '1', '--reviewed-head', head],
      ...['--reviewer', 'user', '--review-notes', 'x', '--authorized'],
      ...['--publication-effect', 'none', '--host-scope', 'allowed'],
    ]);
    expect(again.stderr).toContain('blocking findings as a whole number');
    expect(again.stderr).toContain('Delivery worktree must be clean');
    expect(calls().some((args) => args[1] === '--method')).toBe(false);
  }, 30_000);

  test('a PR head checked out in another worktree is named, and merges from there', () => {
    const { repo, tmp } = makeRepo();
    const feature = join(tmp, 'feature');
    git(repo, ['worktree', 'add', '-b', 'feature', feature]);
    commit(feature, 'feature.txt', 'new\n', 'feature work');
    const head = inventory(feature).head;
    // The refused run reads the open PR twice before the merge run reads it again.
    const rules = provider(head);
    const open = { stdout: restPr(head) };
    (rules[0] as Rule).replies.unshift(open, open);
    const calls = fakeGh(rules);
    const args = [
      ...['merge', '1', '--reviewed-head', head, '--reviewer', 'independent'],
      ...['--review-notes', 'x', '--blocking-findings', '0', '--authorized'],
      ...['--publication-effect', 'none', '--host-scope', 'allowed'],
    ];
    const refused = cli(['--repo', repo, ...args]);
    expect(refused.stderr).toContain(`it is checked out in ${feature}`);
    expect(refused.stderr).toContain(`--repo ${JSON.stringify(feature)}`);
    expect(refused.stderr).not.toContain('review does not cover');
    expect(calls().some((call) => call[1] === '--method')).toBe(false);
    const merged = cli(['--repo', feature, ...args]);
    expect(merged.stderr).not.toContain('Blocked');
    expect(merged.code).toBe(0);
    expect(JSON.parse(merged.stdout).state).toBe('MERGED');
  }, 30_000);

  test("a merge under a new task record waits for another task's uncertain work", () => {
    const { repo, head } = task('stuck');
    const stuck = new Store(repo, 'stuck');
    const data = stuck.load();
    data.end_state = 'needs_reconciliation';
    atomicJson(stuck.path, data);
    const calls = fakeGh(provider(head));
    const result = cli([
      '--repo',
      repo,
      '--task',
      'fresh',
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
    ]);
    expect(result.stderr).toContain("Task 'stuck' still has uncertain work");
    expect(new Store(repo, 'fresh').exists()).toBe(false);
    expect(calls().some((args) => args[1] === '--method')).toBe(false);
  });
});

function store_reconcile(repo: string, name: string) {
  const store = new Store(repo, name);
  store.resume();
  store.reconcile('Added local settings only');
}
