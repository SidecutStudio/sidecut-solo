import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  deleteMerged,
  markPrMerged,
  testHooks,
} from '../../plugins/sidecut-solo/server/src/helper/lib/delivery.ts';
import {
  cUnquote,
  forceGitVersion,
  git,
  gitRun,
  inventory,
  mergedBranches,
} from '../../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import { runCommand } from '../process.ts';
import { cli, commit, fakeGh, makeRepo, scratch } from './fixture.ts';

afterEach(() => {
  forceGitVersion(undefined);
  testHooks.beforeRefTransaction = undefined;
});

function rows<T extends { branch: string | null }>(list: T[]) {
  return Object.fromEntries(list.map((row) => [row.branch, row]));
}

function localBranches(repo: string) {
  return new Set(
    git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n'),
  );
}

/** A squash-merged branch whose lines main later changed: Git alone can't prove it landed. */
function squashThenEdit(repo: string) {
  git(repo, ['checkout', '-b', 'landed']);
  commit(repo, 'feature.txt', 'one\n', 'feature');
  git(repo, ['checkout', 'main']);
  git(repo, ['merge', '--squash', 'landed']);
  git(repo, ['commit', '-m', 'feature (#7)']);
  commit(repo, 'feature.txt', 'one, revised\n', 'later edit on main');
  git(repo, ['checkout', '-b', 'unique', 'main']);
  commit(repo, 'feature.txt', 'unmerged take\n', 'unique work');
  git(repo, ['checkout', 'main']);
  return git(repo, ['rev-parse', 'landed']);
}

/** main holds a squash merge of `squashed`; `unique` has work main lacks. */
function squashMergedAndUnique(repo: string) {
  git(repo, ['checkout', '-b', 'squashed']);
  commit(repo, 'feature.txt', 'one\n', 'feature');
  git(repo, ['config', 'branch.squashed.remote', 'origin']);
  git(repo, ['checkout', 'main']);
  git(repo, ['merge', '--squash', 'squashed']);
  git(repo, ['commit', '-m', 'feature (#1)']);
  git(repo, ['branch', 'behind', 'HEAD~1']);
  git(repo, ['checkout', '-b', 'unique']);
  commit(repo, 'only-here.txt', 'unique work\n', 'unique work');
  git(repo, ['checkout', 'main']);
  return git(repo, ['rev-parse', 'squashed']);
}

describe('inventory', () => {
  test('keeps the unstaged marker on the first entry', () => {
    const { repo } = makeRepo();
    writeFileSync(join(repo, 'calc.py'), 'changed\n');
    writeFileSync(join(repo, 'zz-new.txt'), 'untracked\n');
    expect(inventory(repo).status).toEqual([' M calc.py', '?? zz-new.txt']);
  });

  test('hashes untracked file content, including leading whitespace names', () => {
    const { repo } = makeRepo();
    const path = join(repo, ' leading.txt');
    writeFileSync(path, 'initial customer notes\n');
    const before = inventory(repo);
    writeFileSync(path, 'updated customer notes\n');
    const after = inventory(repo);
    expect(before.status).toEqual(['??  leading.txt']);
    expect(after.status).toEqual(before.status);
    expect(before.fingerprint).not.toBe(after.fingerprint);
  });

  test('counts files in every worktree without rewriting their index', () => {
    const { repo, tmp } = makeRepo();
    const other = join(tmp, 'other');
    git(repo, ['worktree', 'add', '-b', 'side', other]);
    writeFileSync(join(other, 'calc.py'), 'changed\n');
    git(other, ['mv', 'valuable.txt', 'renamed.txt']);
    writeFileSync(join(other, 'new-a.txt'), 'a\n');
    writeFileSync(join(other, 'new-b.txt'), 'b\n');
    const admin = readFileSync(join(other, '.git'), 'utf8').trim().split(/\s+/).pop() as string;
    const before = statSync(join(admin, 'index')).mtimeMs;
    const found = rows(inventory(repo).worktrees);
    expect(found.main?.current).toBe(true);
    expect(found.main?.files).toEqual({ changed: 0, untracked: 0 });
    expect(found.side?.current).toBe(false);
    expect(found.side?.path).toBe(other);
    // The rename counts once, not as two entries.
    expect(found.side?.files).toEqual({ changed: 2, untracked: 2 });
    expect(statSync(join(admin, 'index')).mtimeMs).toBe(before);
  });

  test('keeps unusual worktree paths exactly', () => {
    const { repo, tmp } = makeRepo();
    const other = join(tmp, 'résumé with\nnewline');
    git(repo, ['worktree', 'add', '-b', 'unusual', other]);
    writeFileSync(join(other, 'valuable.txt'), 'preserve me\n');
    const row = inventory(repo).worktrees.find((item) => item.branch === 'unusual');
    expect(row?.path).toBe(other);
    expect(row?.files).toEqual({ changed: 1, untracked: 0 });
    expect(row?.missing).toBeUndefined();
  });

  test('marks a missing worktree', () => {
    const { repo, tmp } = makeRepo();
    const other = join(tmp, 'gone');
    git(repo, ['worktree', 'add', '--detach', other]);
    rmSync(other, { recursive: true });
    const gone = inventory(repo).worktrees.find((row) => row.path === other);
    expect(gone?.missing).toBe(true);
    expect(gone?.files).toBeNull();
    expect(gone?.branch).toBeNull();
  });

  test('reports upstream and ahead/behind as of the last fetch', () => {
    const { repo, tmp } = makeRepo();
    const remote = join(tmp, 'remote.git');
    git(tmp, ['init', '--bare', remote]);
    git(repo, ['remote', 'add', 'origin', remote]);
    git(repo, ['push', '-u', 'origin', 'main']);
    commit(repo, 'pushed.txt', 'pushed\n', 'pushed work');
    git(repo, ['push', 'origin', 'main']);
    git(repo, ['branch', '--track', 'behind', 'origin/main']);
    git(repo, ['branch', '-f', 'behind', 'HEAD~1']);
    commit(repo, 'ahead.txt', 'unpushed\n', 'unpushed work');
    git(repo, ['branch', 'local-only']);
    // An upstream whose remote branch no longer exists, as after a merged PR's branch is deleted.
    git(repo, ['branch', 'pushed-then-deleted']);
    git(repo, ['config', 'branch.pushed-then-deleted.remote', 'origin']);
    git(repo, ['config', 'branch.pushed-then-deleted.merge', 'refs/heads/deleted']);
    const found = rows(inventory(repo).branches);
    expect(found.main?.upstream).toBe('origin/main');
    expect([found.main?.ahead, found.main?.behind]).toEqual([1, 0]);
    expect(found['local-only']?.upstream).toBeNull();
    expect(found['local-only']?.sync).toBe('no upstream');
    expect([found.behind?.ahead, found.behind?.behind]).toEqual([0, 1]);
    expect(found.behind?.sync).toBe('behind 1');
    expect(found['pushed-then-deleted']?.sync).toBe('upstream gone');
    const merged = rows(mergedBranches(repo, 'main').branches);
    expect(merged['local-only']?.sync).toBe('no upstream');
    expect(merged.main?.ahead).toBe(1);
  });

  test('works on an unborn repository', () => {
    const root = join(scratch(), 'new');
    mkdirSync(root);
    git(root, ['init', '-b', 'main']);
    expect(inventory(root).head).toBe('(unborn)');
  });
});

describe('older Git without worktree list -z', () => {
  test('lists worktrees, locks and detached heads', () => {
    forceGitVersion([2, 34]);
    const { repo, tmp } = makeRepo();
    const other = join(tmp, 'side tree');
    git(repo, ['worktree', 'add', '-b', 'side', other]);
    writeFileSync(join(other, 'new.txt'), 'keep\n');
    git(repo, ['worktree', 'lock', '--reason', 'résumé "busy"\nsecond line', other]);
    const detached = join(tmp, 'detached');
    git(repo, ['worktree', 'add', '--detach', detached]);
    const found = inventory(repo).worktrees;
    const byPath = Object.fromEntries(found.map((row) => [row.path, row]));
    expect(found).toHaveLength(3);
    expect(byPath[other]?.branch).toBe('side');
    expect(byPath[other]?.files).toEqual({ changed: 0, untracked: 1 });
    expect(byPath[other]?.locked).toBe('résumé "busy"\nsecond line');
    expect(byPath[detached]?.detached).toBe(true);
    expect(found.find((row) => row.branch === 'main')?.current).toBe(true);
  });

  for (const name of [
    'two\nlines',
    'a\nbranch x',
    'a\nbare',
    'a\nworktree /b',
    'a\n\nworktree /c',
  ]) {
    test(`refuses an ambiguous newline path ${JSON.stringify(name)}`, () => {
      const { repo, tmp } = makeRepo();
      git(repo, ['worktree', 'add', '--detach', join(tmp, name)]);
      forceGitVersion([2, 34]);
      expect(() => inventory(repo)).toThrow('contains a newline');
    });
  }

  const quoting: [string, string][] = [
    ['agent busy', 'agent busy'],
    ['"r\\303\\251sum\\303\\2511"', 'résumé1'],
    ['"tab\\there \\"q\\" back\\\\slash\\nnext"', 'tab\there "q" back\\slash\nnext'],
  ];
  for (const [quoted, plain] of quoting) {
    test(`unquotes ${quoted}`, () => expect(cUnquote(quoted)).toBe(plain));
  }
  for (const bad of ['"trailing\\"', '"\\8xx"', '"\\q"']) {
    test(`refuses malformed quoting ${bad}`, () =>
      expect(() => cUnquote(bad)).toThrow('unreadable quoted value'));
  }
});

describe('merged', () => {
  test('shows whether one branch covers another', () => {
    const { repo } = makeRepo();
    git(repo, ['checkout', '-b', 'older']);
    commit(repo, 'feature.txt', 'one\n', 'feature');
    git(repo, ['checkout', '-b', 'newer', 'main']);
    commit(repo, 'more.txt', 'more\n', 'more work');
    git(repo, ['cherry-pick', 'older']);
    git(repo, ['checkout', '-b', 'diverged', 'main']);
    commit(repo, 'feature.txt', 'different\n', 'other take');
    git(repo, ['checkout', 'main']);
    const found = rows(mergedBranches(repo, 'newer').branches);
    expect(found.older?.status).toBe('squash-merged');
    expect(found.diverged?.status).toBe('unproven');
  });

  test('classifies squash, ancestor and unique branches', () => {
    const { repo } = makeRepo();
    git(repo, ['checkout', '-b', 'squashed']);
    commit(repo, 'feature.txt', 'one\n', 'feature part 1');
    commit(repo, 'feature.txt', 'one\ntwo\n', 'feature part 2');
    git(repo, ['checkout', 'main']);
    git(repo, ['merge', '--squash', 'squashed']);
    git(repo, ['commit', '-m', 'feature (#1)']);
    commit(repo, 'later.txt', 'later\n', 'later work on main');
    git(repo, ['branch', 'behind', 'HEAD~1']);
    git(repo, ['checkout', '-b', 'unique', 'HEAD~1']);
    commit(repo, 'only-here.txt', 'unique work\n', 'unique work');
    git(repo, ['checkout', 'main']);
    const found = rows(mergedBranches(repo, 'main').branches);
    expect(found.squashed?.status).toBe('squash-merged');
    expect(found.behind?.status).toBe('ancestor');
    expect(found.unique?.status).toBe('unproven');
    expect(found.main?.current).toBe(true);
    expect(found.unique?.current).toBe(false);
    expect(git(repo, ['branch', '--show-current'])).toBe('main');
  });

  test('a reverted squash does not prove current preservation', () => {
    const { repo } = makeRepo();
    git(repo, ['checkout', '-b', 'reverted-feature']);
    commit(repo, 'feature.txt', 'valuable feature\n', 'feature');
    git(repo, ['checkout', 'main']);
    git(repo, ['merge', '--squash', 'reverted-feature']);
    git(repo, ['commit', '-m', 'squash feature']);
    git(repo, ['revert', '--no-edit', 'HEAD']);
    expect(rows(mergedBranches(repo, 'main').branches)['reverted-feature']?.status).toBe(
      'unproven',
    );
    expect(git(repo, ['show', 'reverted-feature:feature.txt'])).toBe('valuable feature');
  });

  test('an orphan branch is unproven without aborting the inventory', () => {
    const { repo } = makeRepo();
    git(repo, ['checkout', '--orphan', 'unrelated-history']);
    git(repo, ['rm', '-rf', '.']);
    commit(repo, 'orphan.txt', 'independent\n', 'unrelated root');
    git(repo, ['checkout', 'main']);
    const found = rows(mergedBranches(repo, 'main').branches);
    expect(found['unrelated-history']?.status).toBe('unproven');
    expect(found.main?.status).toBe('ancestor');
  });

  test('a merged PR head upgrades only the exact tip', () => {
    const { repo } = makeRepo();
    const tip = squashThenEdit(repo);
    const calls = fakeGh([
      {
        args: ['api', '--paginate', '--slurp'],
        replies: [
          {
            stdout: [
              [
                restMerged(7, tip, git(repo, ['rev-parse', 'main~1'])),
                restMerged(8, '0'.repeat(40), '1'.repeat(40)),
              ],
              [{ number: 9, head: { sha: tip }, merged_at: null, merge_commit_sha: null }],
            ],
          },
        ],
      },
    ]);
    const result = markPrMerged(repo, mergedBranches(repo, 'main'));
    const found = rows(result.branches);
    expect(found.landed?.status).toBe('pr-merged');
    expect(found.landed?.pr).toBe(7);
    expect(found.unique?.status).toBe('unproven');
    const first = calls()[0] as string[];
    expect(first.at(-1)).toContain('state=closed&base=main&');
    expect(result.pr_lookup).toBe('checked 2 merged PRs into main');
  });

  test('without gh unproven branches stay unproven', () => {
    const { repo } = makeRepo();
    squashThenEdit(repo);
    fakeGh([{ args: ['api'], replies: [{ code: 1, stderr: 'not logged in' }] }]);
    const result = markPrMerged(repo, mergedBranches(repo, 'main'));
    expect(
      new Set(result.branches.filter((row) => row.branch !== 'main').map((row) => row.status)),
    ).toEqual(new Set(['unproven']));
    expect(result.pr_lookup?.startsWith('unavailable:')).toBe(true);
  });

  test('skips GitHub when everything is proven', () => {
    const { repo } = makeRepo();
    const calls = fakeGh([]);
    expect(markPrMerged(repo, mergedBranches(repo, 'main')).pr_lookup).toBeUndefined();
    expect(calls()).toEqual([]);
  });

  test('a PR merge commit must be reachable from the resolved target', () => {
    const { repo } = makeRepo();
    const tip = squashThenEdit(repo);
    const mergeCommit = git(repo, ['rev-parse', 'main~1']);
    fakeGh([
      {
        args: ['api', '--paginate', '--slurp'],
        replies: [{ stdout: [[restMerged(7, tip, mergeCommit)]] }],
      },
    ]);
    const row = {
      branch: 'landed',
      tip,
      status: 'unproven',
      current: false,
      upstream: null,
      ahead: null,
      behind: null,
      sync: '',
    };
    const result = markPrMerged(repo, {
      into: 'main',
      target: git(repo, ['rev-parse', 'main~2']),
      branches: [row],
    });
    expect(result.branches[0]?.status).toBe('unproven');
  });
});

describe('delete-merged', () => {
  test('removes proven branches and says how to restore them', () => {
    const { repo } = makeRepo();
    const tip = squashMergedAndUnique(repo);
    const result = deleteMerged(repo, 'main', ['squashed', 'behind']);
    expect(localBranches(repo)).toEqual(new Set(['main', 'unique']));
    expect(result.deleted.map((row) => row.branch)).toEqual(['squashed', 'behind']);
    expect(result.deleted[0]?.status).toBe('squash-merged');
    expect(result.deleted[0]?.restore).toBe(`git branch squashed ${tip}`);
    expect(gitRun(repo, ['config', '--get', 'branch.squashed.remote']).code).not.toBe(0);
  });

  test('deletes nothing if any branch is unproven', () => {
    const { repo } = makeRepo();
    squashMergedAndUnique(repo);
    fakeGh([{ args: ['api'], replies: [{ code: 1, stderr: 'offline' }] }]);
    expect(() => deleteMerged(repo, 'main', ['squashed', 'unique'])).toThrow(
      /Deleted nothing.*unique: unproven/,
    );
    expect(localBranches(repo)).toEqual(new Set(['main', 'squashed', 'behind', 'unique']));
  });

  for (const [name, reason] of [
    ['main', 'it is the target'],
    ['missing', 'no such local branch'],
    ['wt', 'checked out'],
  ]) {
    test(`refuses ${name}: ${reason}`, () => {
      const { repo, tmp } = makeRepo();
      squashMergedAndUnique(repo);
      git(repo, ['worktree', 'add', '-q', join(tmp, 'wt'), '-b', 'wt']);
      fakeGh([{ args: ['api'], replies: [{ code: 1, stderr: 'offline' }] }]);
      expect(() => deleteMerged(repo, 'main', [name as string])).toThrow(`${name}: ${reason}`);
      expect(localBranches(repo).has('wt')).toBe(true);
    });
  }

  test('uses a merged PR as proof', () => {
    const { repo } = makeRepo();
    const tip = squashThenEdit(repo);
    fakeGh([
      {
        args: ['api', '--paginate', '--slurp'],
        replies: [{ stdout: [[restMerged(7, tip, git(repo, ['rev-parse', 'main~1']))]] }],
      },
    ]);
    const result = deleteMerged(repo, 'main', ['landed']);
    expect(result.deleted[0]?.status).toBe('pr-merged');
    expect(localBranches(repo).has('landed')).toBe(false);
  });

  test('refuses a concurrent tip change atomically', () => {
    const { repo } = makeRepo();
    squashMergedAndUnique(repo);
    testHooks.beforeRefTransaction = () => git(repo, ['branch', '--force', 'behind', 'unique']);
    expect(() => deleteMerged(repo, 'main', ['squashed', 'behind'])).toThrow(
      /Deleted nothing.*transaction failed/,
    );
    expect(localBranches(repo).has('squashed') && localBranches(repo).has('behind')).toBe(true);
    expect(git(repo, ['rev-parse', 'behind'])).toBe(git(repo, ['rev-parse', 'unique']));
  });

  test('works from the CLI', () => {
    const { repo } = makeRepo();
    squashMergedAndUnique(repo);
    fakeGh([{ args: ['api'], replies: [{ code: 1, stderr: 'offline' }] }]);
    const ok = cli(['--repo', repo, 'delete-merged', '--into', 'main', 'squashed']);
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout).deleted[0].branch).toBe('squashed');
    const refused = cli(['--repo', repo, 'delete-merged', '--into', 'main', 'unique']);
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain('Deleted nothing');
  });
});

describe('remote-state', () => {
  function withRemote() {
    const { repo, tmp } = makeRepo();
    const remote = join(tmp, 'remote.git');
    git(tmp, ['init', '--bare', '-b', 'main', remote]);
    git(repo, ['remote', 'add', 'origin', remote]);
    writeFileSync(join(repo, 'plugin.json'), '{"version": "1.0.0"}\n');
    git(repo, ['add', 'plugin.json']);
    git(repo, ['commit', '-m', 'plugin']);
    git(repo, ['push', '-u', 'origin', 'main']);
    return repo;
  }

  test('fetches the default branch and passes a bumped version', () => {
    const repo = withRemote();
    writeFileSync(join(repo, 'plugin.json'), '{"version": "1.1.0"}\n');
    const result = JSON.parse(
      cli(['--repo', repo, 'remote-state', '--version-path', 'plugin.json']).stdout,
    );
    expect(result.remote_state).toBe('verified');
    expect(result.default_branch).toBe('main');
    expect(result.version_gate).toBe('passed');
  });

  test('an equal remote version blocks the release', () => {
    const repo = withRemote();
    const result = cli(['--repo', repo, 'remote-state', '--version-path', 'plugin.json']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('release version collision');
  });

  test('an unreachable remote is unverified, never assumed current', () => {
    const { repo } = makeRepo();
    git(repo, ['remote', 'add', 'origin', join(scratch(), 'missing.git')]);
    const result = cli(['--repo', repo, 'remote-state']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('remote state unverified');
  });

  test('a remote that starts with a dash never reaches git as an option', () => {
    const repo = withRemote();
    const marker = join(scratch(), 'ran');
    const result = cli(['--repo', repo, 'remote-state', `--remote=--upload-pack=touch ${marker};`]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('remote must be a remote name or URL');
    expect(existsSync(marker)).toBe(false);
  });

  test('the version path must stay inside the repo', () => {
    const repo = withRemote();
    expect(
      cli(['--repo', repo, 'remote-state', '--version-path', '../plugin.json']).stderr,
    ).toContain('relative');
  });
});

describe('cli', () => {
  test('state commands print a summary', () => {
    const { repo } = makeRepo();
    const run = (...args: string[]) =>
      JSON.parse(cli(['--repo', repo, '--task', 't', ...args]).stdout);
    const started = run('start', 'Ship it', '--budget', '2');
    expect(started.increments).toBe('0/2');
    expect(started.snapshot).toBeUndefined();
    const step = run('checkpoint', 'build', '--next', 'edit', '--acceptance', 'tests pass');
    expect(step.acceptance).toBe('tests pass');
    expect(step.dirty_entries).toBe(0);
    expect(run('resume').task.snapshot).toBeDefined();
  });

  test('--repo and --task also work after the command, but never inside a run command', () => {
    const { repo } = makeRepo();
    const after = cli(['start', 'Ship it', '--task', 'late', '--repo', repo]);
    expect(after.code).toBe(0);
    expect(JSON.parse(cli(['--repo', repo, '--task', 'late', 'resume']).stdout).task.goal).toBe(
      'Ship it',
    );
    const clash = cli(['--task', 'a', 'resume', '--task', 'b', '--repo', repo]);
    expect(clash.code).toBe(2);
    expect(clash.stderr).toContain('--task given twice');
    const repeated = cli(['--repo', repo, 'resume', '--task', 'a', '--task', 'b']);
    expect(repeated.code).toBe(2);
    expect(repeated.stderr).toContain('--task given twice');
    const ran = cli([
      '--repo',
      repo,
      '--task',
      'late',
      'run',
      '--key',
      'k',
      '--',
      'echo',
      '--task',
      'x',
    ]);
    expect(ran.code).toBe(0);
    expect(ran.stdout).toContain('--task x');
  });

  test('an explicit --repo works from a deleted working directory', () => {
    const { repo } = makeRepo();
    const gone = join(scratch(), 'gone');
    mkdirSync(gone);
    const script = `cd ${JSON.stringify(gone)} && rmdir ${JSON.stringify(gone)} && exec node ${JSON.stringify(join(import.meta.dirname, '..', '..', 'plugins/sidecut-solo/server/src/helper/solo.ts'))}`;
    const withRepo = runCommand(
      ['sh', '-c', `${script} --repo ${JSON.stringify(repo)} inventory`],
      { env: process.env },
    );
    expect(withRepo.status).toBe(0);
    expect(JSON.parse(withRepo.stdout.toString()).root).toBe(repo);
    mkdirSync(gone);
    const without = runCommand(['sh', '-c', `${script} inventory`], { env: process.env });
    expect(without.status).toBe(2);
    expect(without.stderr.toString().startsWith('Blocked:')).toBe(true);
  });

  test('unknown options and missing arguments are refused', () => {
    const { repo } = makeRepo();
    expect(cli(['--repo', repo, 'merged']).stderr).toContain('--into is required');
    expect(cli(['--repo', repo, 'inventory', '--force']).stderr).toContain(
      'unknown option --force',
    );
    expect(cli(['nope']).code).toBe(2);
    expect(cli(['--help']).code).toBe(0);
  });
});

/** A merged pull request as GitHub's REST API lists it. */
function restMerged(number: number, head: string, mergeCommit: string) {
  return {
    number,
    head: { sha: head },
    merged_at: '2026-01-01T00:00:00Z',
    merge_commit_sha: mergeCommit,
  };
}
