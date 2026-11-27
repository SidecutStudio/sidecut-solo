import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { git, inventory } from '../../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import { cli, commit, fakeGh, makeRepo, type Rule } from './fixture.ts';
import { PR, provider, restPr } from './gh-replies.ts';

describe('saved reviews and stacked PRs', () => {
  const OPEN_LIST = 'repos/{owner}/{repo}/pulls?state=open&per_page=100';
  const flags = ['--authorized', '--publication-effect', 'none', '--host-scope', 'allowed'];
  const review = (repo: string, head: string, count = '0') =>
    cli([
      ...['--repo', repo, 'review', '--reviewed-head', head, '--reviewer', 'independent'],
      ...['--level', 'standard', '--review-notes', 'Read the diff and tests'],
      ...['--blocking-findings', count],
    ]);

  test('merge uses the review saved for HEAD, and a merge leaves one behind', () => {
    const { repo } = makeRepo();
    const head = inventory(repo).head;
    const saved = review(repo, head);
    expect(saved.code).toBe(0);
    expect(JSON.parse(saved.stdout).path).toContain(join('solo-reviews', `${head}.json`));
    fakeGh(provider(head));
    const merged = cli(['--repo', repo, 'merge', '1', ...flags]);
    expect(merged.stderr).not.toContain('Blocked');
    expect(JSON.parse(merged.stdout).state).toBe('MERGED');

    // An inline review that merges is saved too.
    const other = makeRepo().repo;
    const otherHead = inventory(other).head;
    fakeGh(provider(otherHead));
    const inline = cli([
      ...['--repo', other, 'merge', '1', '--reviewed-head', otherHead, '--reviewer', 'user'],
      ...['--review-notes', 'x', '--blocking-findings', '0', ...flags],
    ]);
    expect(inline.code).toBe(0);
    const record = join(git(other, ['rev-parse', '--git-common-dir']), 'solo-reviews');
    expect(
      JSON.parse(readFileSync(join(other, record, `${otherHead}.json`), 'utf8')).reviewer,
    ).toBe('user');
  }, 30_000);

  test('--reviewed-head alone uses the review saved for that commit', () => {
    const { repo } = makeRepo();
    const head = inventory(repo).head;
    const calls = fakeGh(provider(head));
    const merge = ['--repo', repo, 'merge', '1', '--reviewed-head', head, ...flags];
    expect(cli(merge).stderr).toContain(`no review is saved for ${head}`);
    expect(calls()).toEqual([]);
    expect(review(repo, head).code).toBe(0);
    const merged = cli(merge);
    expect(merged.stderr).not.toContain('Blocked');
    expect(JSON.parse(merged.stdout).state).toBe('MERGED');
  }, 30_000);

  test('review refuses a short SHA, an unknown commit and missing notes', () => {
    const { repo } = makeRepo();
    const head = inventory(repo).head;
    expect(review(repo, head.slice(0, 12)).stderr).toContain('full commit SHA');
    expect(review(repo, 'f'.repeat(40)).stderr).toContain('not a commit');
    expect(
      cli([
        ...['--repo', repo, 'review', '--reviewed-head', head, '--reviewer', 'independent'],
        ...['--level', 'deep', '--review-notes', '', '--blocking-findings', '0'],
      ]).stderr,
    ).toContain('needs notes');
  });

  test('commits after the reviewed head block the merge and are named', () => {
    const { repo } = makeRepo();
    const reviewed = inventory(repo).head;
    expect(review(repo, reviewed).code).toBe(0);
    commit(repo, 'pick.ts', 'fixed\n', 'logic fix after review');
    const head = inventory(repo).head;
    // The inline refusal reads the open PR twice before the merge run reads it again.
    const rules = provider(head);
    const open = { stdout: restPr(head) };
    (rules[0] as Rule).replies.unshift(open, open);
    const calls = fakeGh(rules);
    // No review for HEAD: the saved one below it is named before the network is touched.
    let result = cli(['--repo', repo, 'merge', '1', ...flags]);
    expect(result.stderr).toContain(`1 commit after the reviewed head ${reviewed.slice(0, 12)}`);
    expect(calls()).toEqual([]);
    // The same review given inline is refused with the same reason, not a generic one.
    result = cli([
      ...['--repo', repo, 'merge', '1', '--reviewed-head', reviewed, '--reviewer', 'independent'],
      ...['--review-notes', 'x', '--blocking-findings', '0', ...flags],
    ]);
    expect(result.stderr).toContain('1 commit after the reviewed head');
    expect(result.stderr).not.toContain('review does not cover current HEAD');
    expect(calls().some((call) => call[1] === '--method')).toBe(false);
    // Reviewing the new head clears it.
    expect(review(repo, head).code).toBe(0);
    result = cli(['--repo', repo, 'merge', '1', ...flags]);
    expect(result.code).toBe(0);
  }, 30_000);

  test("a review of a commit already on the base branch isn't named for a new branch", () => {
    const { repo } = makeRepo();
    writeFileSync(join(repo, 'solo-workflow.toml'), 'base_branch = "main"\n');
    writeFileSync(join(repo, '.git/info/exclude'), 'solo-workflow.toml\n');
    expect(review(repo, inventory(repo).head).code).toBe(0);
    git(repo, ['switch', '-c', 'next']);
    commit(repo, 'new.txt', 'new\n', 'a new change');
    const result = cli(['--repo', repo, 'merge', '1', ...flags]);
    expect(result.stderr).toContain('needs a review');
    expect(result.stderr).not.toContain('after the reviewed head');
  });

  test('a stacked PR waits for the one below it, and a merge names the PRs stacked on it', () => {
    const { repo } = makeRepo();
    writeFileSync(join(repo, 'solo-workflow.toml'), 'base_branch = "main"\n');
    writeFileSync(join(repo, '.git/info/exclude'), 'solo-workflow.toml\n');
    const head = inventory(repo).head;
    expect(review(repo, head).code).toBe(0);
    const here = { full_name: 'o/r' };
    const fork = { full_name: 'someone/r' };
    const side = (ref: string, repo = here) => ({ ref, repo });
    const pr = (base: string, merged = false) => ({
      ...restPr(head, merged),
      head: { sha: head, ...side('step-2') },
      base: side(base),
    });
    const open = (number: number, headRef: string, base: string, repo = here) => ({
      number,
      head: side(headRef, repo),
      base: side(base),
    });
    const list = [
      open(1, 'step-1', 'main'),
      open(2, 'step-2', 'step-1'),
      open(3, 'step-3', 'step-2'),
      open(4, 'release', 'main', fork),
    ];
    const rules = (base: string, pages = [list]) => [
      { args: ['api', OPEN_LIST], replies: [{ stdout: pages }] },
      {
        args: ['api', PR],
        replies: [{ stdout: pr(base) }, { stdout: pr(base) }, { stdout: pr(base, true) }],
      },
      ...provider(head).slice(1),
    ];
    let calls = fakeGh(rules('step-1'));
    const refused = cli(['--repo', repo, 'merge', '1', ...flags]);
    expect(refused.stderr).toContain('is stacked on PR 1 (step-1): merge PR 1 first');
    expect(calls().some((call) => call[1] === '--method')).toBe(false);

    // A fork's branch named like this PR's base is not a PR below it.
    fakeGh(rules('release', [[open(4, 'release', 'main', fork)]]));
    expect(cli(['--repo', repo, 'merge', '1', ...flags]).stderr).not.toContain('stacked');

    calls = fakeGh(rules('main'));
    const merged = cli(['--repo', repo, 'merge', '1', ...flags]);
    expect(merged.code).toBe(0);
    const stacked = JSON.parse(merged.stdout).stacked_prs;
    expect(stacked).toEqual([
      expect.objectContaining({
        pr: 3,
        retarget: 'gh api -X PATCH repos/{owner}/{repo}/pulls/3 -f base=main',
      }),
    ]);
  }, 30_000);

  test('brief names the helper, the required checks and the follow-up rule', () => {
    const { repo } = makeRepo();
    writeFileSync(join(repo, 'solo-workflow.toml'), 'required_checks = ["gate", "e2e"]\n');
    const out = cli(['--repo', repo, 'brief']);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain(join('server', 'data', 'helper', 'solo'));
    expect(out.stdout).toContain('gate, e2e');
    expect(out.stdout).toContain('solo review --reviewed-head');
    expect(out.stdout).toContain('follow-ups');
    expect(out.stdout).toContain('--no-verify');
    expect(out.stdout).toContain('solo automerge <pr>');
    expect(out.stdout).toContain('After 3 deep rounds');
  });
});

describe('deep review rounds', () => {
  const save = (repo: string, level: string, count: string, scope?: string) =>
    cli([
      ...['--repo', repo, 'review', '--reviewed-head', inventory(repo).head],
      ...['--reviewer', 'independent', '--level', level, '--review-notes', 'Read the change'],
      ...['--blocking-findings', count, ...(scope ? ['--scope', scope] : [])],
    ]);
  let n = 0;
  const fix = (repo: string) => commit(repo, `fix${++n}.ts`, `${n}\n`, `fix ${n}`);

  test('a fourth deep round on the same change is refused with the two choices', () => {
    const { repo } = makeRepo();
    git(repo, ['checkout', '-q', '-b', 'feature']);
    for (const round of [1, 2, 3]) {
      fix(repo);
      const saved = save(repo, 'deep', round < 3 ? '1' : '0');
      expect(saved.code).toBe(0);
      expect(JSON.parse(saved.stdout).deep_rounds).toEqual({ used: round, cap: 3 });
    }
    fix(repo);
    const fourth = save(repo, 'deep', '0');
    expect(fourth.code).toBe(2);
    expect(fourth.stderr).toContain('3 deep review rounds');
    expect(fourth.stderr).toContain('rethink the design or accept the remaining minor findings');
    // Re-saving the third round's own head is the same round, and lighter reviews still record.
    expect(save(repo, 'standard', '0').code).toBe(0);
    // After a round with no blocker or major findings, the fix diff alone is reviewed.
    expect(save(repo, 'deep', '0', 'fix-diff').code).toBe(0);
  }, 30_000);

  test('the cap comes from deep_review_rounds, and a bad value is refused', () => {
    const { repo } = makeRepo();
    git(repo, ['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repo, 'solo-workflow.local.toml'), 'deep_review_rounds = 1\n');
    fix(repo);
    expect(save(repo, 'deep', '0').code).toBe(0);
    fix(repo);
    expect(save(repo, 'deep', '0').stderr).toContain('the most deep_review_rounds allows (1)');
    writeFileSync(join(repo, 'solo-workflow.local.toml'), 'deep_review_rounds = 0\n');
    expect(save(repo, 'deep', '0').stderr).toContain('whole number of at least 1');
  }, 30_000);

  test('rounds count only on this change: reviews already on the base branch belong to earlier PRs', () => {
    const { repo } = makeRepo();
    for (let i = 0; i < 3; i++) {
      fix(repo);
      expect(save(repo, 'deep', '0').code).toBe(0);
    }
    git(repo, ['checkout', '-q', '-b', 'feature']);
    fix(repo);
    writeFileSync(join(repo, 'solo-workflow.local.toml'), 'base_branch = "main"\n');
    expect(JSON.parse(save(repo, 'deep', '0').stdout).deep_rounds.used).toBe(1);
  }, 30_000);

  test('a branch stacked on another counts only its own reviews, before and after that one merges', () => {
    const { repo } = makeRepo();
    git(repo, ['checkout', '-q', '-b', 'lower']);
    for (let i = 0; i < 3; i++) {
      fix(repo);
      expect(save(repo, 'deep', '0').code).toBe(0);
    }
    git(repo, ['checkout', '-q', '-b', 'upper']);
    fix(repo);
    // The lower branch's clean review is not this change's earlier review.
    expect(save(repo, 'deep', '0', 'fix-diff').stderr).toContain('no earlier review');
    expect(JSON.parse(save(repo, 'deep', '0').stdout).deep_rounds.used).toBe(1);
  }, 30_000);

  test('a fix-diff review needs an earlier review that left no blocker or major findings', () => {
    const { repo } = makeRepo();
    git(repo, ['checkout', '-q', '-b', 'feature']);
    fix(repo);
    expect(save(repo, 'deep', '0', 'fix-diff').stderr).toContain('no earlier review');
    expect(save(repo, 'deep', '2').code).toBe(0);
    fix(repo);
    expect(save(repo, 'deep', '0', 'fix-diff').stderr).toContain('left 2 blocker or major');
    expect(
      cli([
        ...['--repo', repo, 'review', '--reviewed-head', inventory(repo).head],
        ...['--reviewer', 'user', '--review-notes', 'x', '--blocking-findings', '0'],
      ]).stderr,
    ).toContain('--level is required');
  }, 30_000);
});
