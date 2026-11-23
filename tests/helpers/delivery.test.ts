import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  collectChecks,
  gate,
  merge,
} from '../../plugins/sidecut-solo/server/src/helper/lib/delivery.ts';
import { git, inventory } from '../../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import {
  atomicJson,
  defaultTask,
  Store,
} from '../../plugins/sidecut-solo/server/src/helper/lib/state.ts';
import { cleanReview, cli, commit, evidence, fakeGh, makeRepo, type Rule } from './fixture.ts';

const PR = 'repos/{owner}/{repo}/pulls/1';

/** A pull request as GitHub's REST API returns it. */
function restPr(head: string, merged = false, mergeable: boolean | null = true) {
  return {
    number: 1,
    html_url: 'https://github.com/o/r/pull/1',
    head: { sha: head },
    base: { ref: 'main' },
    state: merged ? 'closed' : 'open',
    merged_at: merged ? '2026-01-01T00:00:00Z' : null,
    merge_commit_sha: merged ? 'm' : null,
    mergeable,
    mergeable_state: merged ? 'unknown' : 'clean',
  };
}

/** One page of completed check runs, as `gh api --paginate --slurp` returns them. */
function runs(...rows: [name: string, conclusion: string][]) {
  return [
    {
      check_runs: rows.map(([name, conclusion]) => ({
        name,
        status: 'completed',
        conclusion,
        html_url: `https://ci/${name}`,
      })),
    },
  ];
}

const PROTECTION = 'repos/{owner}/{repo}/branches/main/protection/required_status_checks';
const NO_STATUSES: Rule = { args: ['api'], replies: [{ stdout: { statuses: [] } }] };

/** gh answers for a clean, open PR at `head` with passing checks, then `merge` and `after`. */
function provider(
  head: string,
  mergeReply: Rule['replies'][number] = { stdout: { merged: true } },
  after: unknown = restPr(head, true),
): Rule[] {
  const pr = restPr(head);
  return [
    { args: ['api', PR], replies: [{ stdout: pr }, { stdout: pr }, { stdout: after }] },
    { args: ['api', '--paginate', '--slurp'], replies: [{ stdout: runs(['tests', 'success']) }] },
    { args: ['api', '--method', 'PUT'], replies: [mergeReply] },
    { args: ['api', PROTECTION], replies: [{ stdout: { contexts: ['tests'] } }] },
    NO_STATUSES,
  ];
}

describe('gate', () => {
  for (const state of [
    'QUEUED',
    'PENDING',
    'SKIPPED',
    'CANCELLED',
    'FAILURE',
    'NEUTRAL',
    'TIMED_OUT',
    'ACTION_REQUIRED',
    '',
  ]) {
    test(`a ${state || 'blank'} check blocks`, () => {
      const data = evidence('abc');
      (data.required_checks[0] as { state: string }).state = state;
      expect(gate('abc', data, true, cleanReview('abc')).allowed).toBe(false);
    });
  }

  test('stale, missing and unauthorized checks block', () => {
    const review = cleanReview('abc');
    expect(gate('abc', evidence('abc'), true, review).allowed).toBe(true);
    for (const mutation of [
      { head: 'old' },
      { source: 'fixture' },
      { required_checks: [] },
      { observed_at: '2000-01-01T00:00:00+00:00' },
    ]) {
      expect(gate('abc', { ...evidence('abc'), ...mutation }, true, review).allowed).toBe(false);
    }
    expect(gate('abc', evidence('abc'), false, review).allowed).toBe(false);
    expect(gate('abc', evidence('abc'), true, { ...review, head: 'old' }).allowed).toBe(false);
    const duplicate = evidence('abc');
    duplicate.required_checks = [...duplicate.required_checks, ...duplicate.required_checks];
    expect(gate('abc', duplicate, true, review).allowed).toBe(false);
  });

  test('a review records findings and never approves', () => {
    const data = evidence('abc');
    const clean = cleanReview('abc');
    expect(gate('abc', data, true, clean).allowed).toBe(true);
    // A self-written approval doesn't count: reviewer and findings must be stated.
    const reasons = gate('abc', data, true, {
      head: 'abc',
      notes: 'review',
      verdict: 'approved',
    } as never).reasons;
    expect(reasons.some((reason) => reason.includes('reviewer'))).toBe(true);
    expect(reasons.some((reason) => reason.includes('blocking findings'))).toBe(true);
    for (const change of [
      { blocking_findings: 1 },
      { reviewer: 'self' },
      { blocking_findings: '0' },
      { blocking_findings: false },
    ]) {
      expect(gate('abc', data, true, { ...clean, ...change }).allowed).toBe(false);
    }
    expect(gate('abc', data, false, clean).reasons).toContain('merge authorization missing');
  });
});

describe('checks', () => {
  test('a head change during collection blocks', () => {
    const { repo } = makeRepo();
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: restPr('old') }, { stdout: restPr('new') }] },
      { args: ['api', '--paginate', '--slurp'], replies: [{ stdout: runs(['tests', 'success']) }] },
      NO_STATUSES,
    ]);
    expect(() => collectChecks(repo, '1', ['tests'])).toThrow('head changed');
  });

  const REVIEWED = 'a'.repeat(40);
  const MOVED = 'b'.repeat(40);
  const atHead = (head: string): Rule[] => [
    { args: ['api', PR], replies: [{ stdout: restPr(head) }] },
    { args: ['api', '--paginate', '--slurp'], replies: [{ stdout: runs(['tests', 'success']) }] },
    NO_STATUSES,
  ];

  test('--reviewed-head passes when the PR head is the reviewed commit', () => {
    const { repo } = makeRepo();
    fakeGh(atHead(REVIEWED));
    const result = collectChecks(repo, '1', ['tests'], REVIEWED);
    expect(result.head).toBe(REVIEWED);
    expect(result.reviewed_head).toBe(REVIEWED);
    const shown = cli(['--repo', repo, 'checks', '1', '--reviewed-head', REVIEWED]);
    expect(shown.code).toBe(0);
    expect(JSON.parse(shown.stdout).reviewed_head).toBe(REVIEWED);
  });

  test('--reviewed-head refuses a PR whose head moved, before reading checks', () => {
    const { repo } = makeRepo();
    const calls = fakeGh(atHead(MOVED));
    expect(() => collectChecks(repo, '1', ['tests'], REVIEWED)).toThrow(
      `PR head moved: it is ${MOVED}, not the reviewed head ${REVIEWED}`,
    );
    expect(calls().some((args) => args.includes('--paginate'))).toBe(false);
    const shown = cli(['--repo', repo, 'checks', '1', '--reviewed-head', REVIEWED]);
    expect(shown.code).toBe(2);
    expect(shown.stderr).toContain('PR head moved');
  });

  for (const head of ['abc', 'A'.repeat(40), `${'a'.repeat(40)} `]) {
    test(`--reviewed-head refuses ${JSON.stringify(head)}, which isn't a full SHA`, () => {
      const { repo } = makeRepo();
      const calls = fakeGh(atHead(REVIEWED));
      expect(() => collectChecks(repo, '1', ['tests'], head)).toThrow('full commit SHA');
      expect(calls()).toEqual([]);
    });
  }

  for (const pr of ['--admin', '-1', '0', 'https://example.com/x/y/pull/1?token=bad']) {
    test(`refuses PR selector ${pr}`, () => {
      const { repo } = makeRepo();
      expect(() => collectChecks(repo, pr)).toThrow('positive number');
    });
  }

  test('local required checks cover unprotected repos and missing ones fail', () => {
    const { repo } = makeRepo();
    const calls = fakeGh(provider('abc'));
    const result = collectChecks(repo, '1', ['tests', 'lint']);
    expect(calls().some((args) => args.join(' ').includes('protection'))).toBe(false);
    expect(result.policy).toBe('local-require');
    expect(
      result.required_checks.filter((check: { name: string }) => check.name === 'lint'),
    ).toEqual([{ name: 'lint', state: 'MISSING', bucket: 'missing', link: '' }]);
    expect(
      gate(
        'abc',
        { ...evidence('abc'), required_checks: result.required_checks },
        true,
        cleanReview('abc'),
      ).allowed,
    ).toBe(false);
  });

  const matrix: [Record<string, string>, string[], string[]][] = [
    [{ 'solo-workflow.toml': '["tests"]' }, ['smoke'], ['tests', 'smoke']],
    [
      { 'solo-workflow.toml': '["obsolete"]', 'solo-workflow.local.toml': '["tests"]' },
      ['smoke'],
      ['tests', 'smoke'],
    ],
    [{ 'solo-workflow.toml': '["tests"]' }, [], ['tests']],
    [{}, ['tests', 'smoke'], ['tests', 'smoke']],
    [
      { 'solo-workflow.toml': '["tests", "tests"]' },
      ['tests', 'smoke', 'smoke'],
      ['tests', 'smoke'],
    ],
  ];
  for (const testsState of ['SUCCESS', 'FAILURE', 'MISSING']) {
    for (const [files, flags, expected] of matrix) {
      test(`extra checks add to repo requirements (${testsState}, ${JSON.stringify(files)} + ${flags})`, () => {
        const { repo } = makeRepo();
        for (const [name, list] of Object.entries(files))
          writeFileSync(join(repo, name), `required_checks = ${list}\n`);
        const saved = Object.fromEntries(
          Object.keys(files).map((name) => [name, readFileSync(join(repo, name), 'utf8')]),
        );
        const reported: [string, string][] = [['smoke', 'success']];
        if (testsState !== 'MISSING') reported.push(['tests', testsState.toLowerCase()]);
        fakeGh([
          { args: ['api', PR], replies: [{ stdout: restPr('abc') }] },
          { args: ['api', '--paginate', '--slurp'], replies: [{ stdout: runs(...reported) }] },
          NO_STATUSES,
        ]);
        const result = cli([
          '--repo',
          repo,
          'checks',
          '1',
          ...flags.flatMap((name) => ['--require-check', name]),
        ]);
        expect(result.code).toBe(0);
        const shown = JSON.parse(result.stdout);
        expect(new Set(shown.required_checks.map((check: { name: string }) => check.name))).toEqual(
          new Set(expected),
        );
        expect(shown.required_checks).toHaveLength(expected.length);
        expect(gate('abc', shown, true, cleanReview('abc')).allowed).toBe(testsState === 'SUCCESS');
        for (const [name, content] of Object.entries(saved))
          expect(readFileSync(join(repo, name), 'utf8')).toBe(content);
      });
    }
  }
});

describe('REST check data', () => {
  test('branch protection names the required checks', () => {
    const { repo } = makeRepo();
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: restPr('abc') }] },
      { args: ['api', PROTECTION], replies: [{ stdout: { contexts: ['tests'], checks: [] } }] },
      {
        args: ['api', '--paginate', '--slurp'],
        replies: [{ stdout: runs(['tests', 'success'], ['lint', 'failure']) }],
      },
      NO_STATUSES,
    ]);
    const result = collectChecks(repo, '1');
    expect(result.policy).toBe('branch-protection');
    expect(result.required_checks).toEqual([
      { name: 'tests', state: 'SUCCESS', bucket: 'pass', link: 'https://ci/tests' },
    ]);
    expect(gate('abc', result, true, cleanReview('abc')).allowed).toBe(true);
  });

  test('an unprotected branch with no local list blocks the gate', () => {
    const { repo } = makeRepo();
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: restPr('abc') }] },
      {
        args: ['api', PROTECTION],
        replies: [{ code: 1, stderr: 'gh: Branch not protected (HTTP 404)' }],
      },
      { args: ['api', '--paginate', '--slurp'], replies: [{ stdout: runs(['tests', 'success']) }] },
      NO_STATUSES,
    ]);
    const result = collectChecks(repo, '1');
    expect(result.required_checks).toEqual([]);
    expect(gate('abc', result, true, cleanReview('abc')).reasons).toContain(
      'required check set empty or unknown',
    );
  });

  test('running checks are pending and commit statuses count', () => {
    const { repo } = makeRepo();
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: restPr('abc') }] },
      {
        args: ['api', '--paginate', '--slurp'],
        replies: [{ stdout: [{ check_runs: [{ name: 'tests', status: 'in_progress' }] }] }],
      },
      {
        args: ['api'],
        replies: [
          { stdout: { statuses: [{ context: 'deploy', state: 'success', target_url: 'u' }] } },
        ],
      },
    ]);
    const result = collectChecks(repo, '1', ['tests', 'deploy']);
    expect(result.required_checks).toEqual([
      { name: 'tests', state: 'IN_PROGRESS', bucket: 'pending', link: '' },
      { name: 'deploy', state: 'SUCCESS', bucket: 'pass', link: 'u' },
    ]);
    expect(gate('abc', result, true, cleanReview('abc')).allowed).toBe(false);
  });

  test('a conflicting or still-computing PR is not clean', () => {
    const { repo } = makeRepo();
    for (const mergeable of [false, null]) {
      fakeGh([
        { args: ['api', PR], replies: [{ stdout: restPr('abc', false, mergeable) }] },
        {
          args: ['api', '--paginate', '--slurp'],
          replies: [{ stdout: runs(['tests', 'success']) }],
        },
        NO_STATUSES,
      ]);
      const result = collectChecks(repo, '1', ['tests']);
      expect(gate('abc', result, true, cleanReview('abc')).reasons).toContain(
        'PR mergeability is not confirmed clean',
      );
    }
  });

  test('a PR URL on another host names that host and repo', () => {
    const { repo } = makeRepo();
    const calls = fakeGh([
      {
        args: ['api', '--hostname', 'git.example.com', 'repos/o/r/pulls/5'],
        replies: [{ stdout: restPr('abc') }],
      },
      {
        args: ['api', '--hostname', 'git.example.com', '--paginate'],
        replies: [{ stdout: runs(['tests', 'success']) }],
      },
      { args: ['api', '--hostname', 'git.example.com'], replies: [{ stdout: { statuses: [] } }] },
    ]);
    collectChecks(repo, 'https://git.example.com/o/r/pull/5', ['tests']);
    expect(calls()[1]?.at(-1)).toBe('repos/o/r/commits/abc/check-runs?per_page=100');
  });
});

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
  test('an inline review is checked like a review file', () => {
    const { repo, head } = task('inline');
    const calls = fakeGh(provider(head));
    const base = ['--repo', repo, '--task', 'inline', 'merge', '1', '--authorized'];
    const flags = ['--publication-effect', 'none', '--host-scope', 'allowed'];
    let result = cli([...base, ...flags]);
    expect(result.stderr).toContain('needs a review');
    result = cli([
      ...base,
      '--reviewed-head',
      'f'.repeat(40),
      '--reviewer',
      'independent',
      '--review-notes',
      'x',
      '--blocking-findings',
      '0',
      ...flags,
    ]);
    expect(result.stderr).toContain('review does not cover current HEAD');
    result = cli([...base, '--review', 'r.json', '--reviewer', 'user', ...flags]);
    expect(result.stderr).toContain('not both');
    result = cli([
      ...base,
      '--reviewed-head',
      head,
      '--reviewer',
      'user',
      '--review-notes',
      'x',
      '--blocking-findings',
      '1',
      ...flags,
    ]);
    expect(result.stderr).toContain('blocking findings');
    for (const count of [undefined, '', ' ', '0x0', '-0', '1.0'])
      expect(
        cli([
          ...base,
          '--reviewed-head',
          head,
          '--reviewer',
          'user',
          '--review-notes',
          'x',
          ...(count === undefined ? [] : ['--blocking-findings', count]),
          ...flags,
        ]).stderr,
      ).toContain('blocking findings as a whole number (--blocking-findings <n>)');
    // "none" is a stated zero.
    expect(
      cli([
        ...base,
        '--reviewed-head',
        head,
        '--reviewer',
        'user',
        '--review-notes',
        'x',
        '--blocking-findings',
        'none',
        ...flags,
      ]).stderr,
    ).not.toContain('blocking findings');
    expect(calls().some((args) => args[1] === '--method')).toBe(false);
  }, 30_000);

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
    expect(result.stderr).toContain('skills/solo-finish-change/SKILL.md');
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

describe('review fixes', () => {
  test('a timestamp without a timezone is invalid', () => {
    const data = { ...evidence('abc'), observed_at: new Date().toISOString().replace('Z', '') };
    expect(gate('abc', data, true, cleanReview('abc')).reasons).toContain(
      'CI observation time missing or invalid',
    );
  });

  for (const flag of ['--authorized=false', '--publication-authorized=0']) {
    test(`a flag with a value is refused: ${flag}`, () => {
      const { repo } = makeRepo();
      const result = cli([
        '--repo',
        repo,
        'authorization',
        flag,
        '--host-scope',
        'allowed',
        '--publication-effect',
        'none',
      ]);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('takes no value');
    });
  }

  test('a timed-out run returns promptly even if a descendant escapes the process group', () => {
    const { repo } = makeRepo();
    cli(['--repo', repo, '--task', 't', 'start', 'escape']);
    const started = Date.now();
    const result = cli([
      '--repo',
      repo,
      '--task',
      't',
      'run',
      '--key',
      'k',
      '--timeout',
      '1',
      '--',
      'sh',
      '-c',
      'perl -e "use POSIX; setsid(); sleep 8" &',
    ]);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).status).toBe('uncertain');
  });
});
