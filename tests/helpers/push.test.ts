import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { push } from '../../plugins/sidecut-solo/server/src/helper/lib/delivery.ts';
import { git, gitRun } from '../../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import { cli, commit, makeRepo } from './fixture.ts';

/** A repo whose main is pushed to a bare origin, with Git's default push.default. */
function withRemote() {
  const { repo, tmp } = makeRepo();
  const remote = join(tmp, 'remote.git');
  git(tmp, ['init', '--bare', '-b', 'main', remote]);
  git(repo, ['remote', 'add', 'origin', remote]);
  git(repo, ['push', '-u', 'origin', 'main']);
  git(repo, ['config', 'push.default', 'simple']);
  return { repo, tmp, remote };
}

function remoteTip(remote: string, branch: string): string | null {
  return gitRun(remote, ['rev-parse', '--verify', `refs/heads/${branch}`]).stdout.trim() || null;
}

describe('push', () => {
  test('pushes by the upstream name from a branch Git itself refuses to push bare', () => {
    const { repo, remote } = withRemote();
    git(repo, ['switch', '-c', 'one-app-step-2']);
    commit(repo, 'step.txt', 'step\n', 'step 2');
    git(repo, ['push', '-u', 'origin', 'one-app-step-2']);
    // A second worktree can't check out one-app-step-2, so its branch gets another name.
    git(repo, ['switch', '-c', 'worktree-one-app-step-2', '--track', 'origin/one-app-step-2']);
    commit(repo, 'step.txt', 'step, fixed\n', 'review fixes');
    const head = git(repo, ['rev-parse', 'HEAD']);
    const bare = gitRun(repo, ['push']);
    expect(bare.code).not.toBe(0);
    expect(bare.stderr).toContain('upstream');
    expect(remoteTip(remote, 'one-app-step-2')).not.toBe(head);
    const result = push(repo, 'main');
    expect(result).toMatchObject({ branch: 'one-app-step-2', status: 'pushed', after: head });
    expect(remoteTip(remote, 'one-app-step-2')).toBe(head);
    expect(push(repo, 'main').status).toBe('up-to-date');
  });

  test('a first push sets the upstream, through the CLI', () => {
    const { repo, remote } = withRemote();
    git(repo, ['switch', '-c', 'feature']);
    commit(repo, 'feature.txt', 'one\n', 'feature');
    const result = cli(['--repo', repo, 'push']);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      remote: 'origin',
      branch: 'feature',
      status: 'pushed',
      upstream_set: true,
    });
    expect(remoteTip(remote, 'feature')).toBe(git(repo, ['rev-parse', 'HEAD']));
    expect(git(repo, ['config', 'branch.feature.merge'])).toBe('refs/heads/feature');
    expect(git(repo, ['config', 'branch.feature.remote'])).toBe('origin');
  });

  test('refuses a detached HEAD without --to, bad names, unknown remotes and the base branch', () => {
    const { repo, remote } = withRemote();
    commit(repo, 'calc.py', 'def add(a, b):\n    return a + b\n', 'fix add');
    const mainTip = remoteTip(remote, 'main');
    expect(() => push(repo, 'main')).toThrow('base branch');
    expect(() => push(repo, undefined)).toThrow('base branch'); // asked of the remote
    git(repo, ['switch', '--detach']);
    expect(() => push(repo, 'main')).toThrow('Detached HEAD');
    for (const to of ['-x', 'a b', 'a:b', 'bad..name']) {
      expect(() => push(repo, 'main', { to })).toThrow('Not a usable branch name');
    }
    expect(() => push(repo, 'main', { to: 'x', remote: 'nope' })).toThrow('No remote named');
    expect(remoteTip(remote, 'main')).toBe(mainTip);
  });

  test('never forces: a non-fast-forward push is refused and the remote keeps its tip', () => {
    const { repo, remote } = withRemote();
    git(repo, ['switch', '-c', 'feature']);
    commit(repo, 'feature.txt', 'one\n', 'one');
    commit(repo, 'feature.txt', 'two\n', 'two');
    expect(push(repo, 'main').status).toBe('pushed');
    const tip = remoteTip(remote, 'feature');
    git(repo, ['reset', '--hard', 'HEAD~1']);
    expect(() => push(repo, 'main')).toThrow('Push refused');
    expect(remoteTip(remote, 'feature')).toBe(tip);
  });

  test('a failing pre-push hook shows its own output, with tokens redacted', () => {
    const { repo, remote } = withRemote();
    git(repo, ['switch', '-c', 'feature']);
    commit(repo, 'feature.txt', 'one\n', 'one');
    const hooks = join(repo, '.git', 'hooks');
    git(repo, ['config', 'core.hooksPath', hooks]);
    const hook = join(hooks, 'pre-push');
    writeFileSync(
      hook,
      [
        '#!/bin/sh',
        'echo "check failed: 3 tests broke"',
        // More stderr noise than the tail keeps must not push the reason out.
        'for i in $(seq 45); do echo "noise $i" >&2; done',
        // A token longer than the tail's character budget is still hidden, not cut in half.
        `echo "token=ghp_${'A'.repeat(1200)}" >&2`,
        'exit 1',
        '',
      ].join('\n'),
    );
    chmodSync(hook, 0o755);
    const result = cli(['--repo', repo, 'push']);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Push refused (exit 1)');
    expect(result.stderr).toContain('check failed: 3 tests broke');
    expect(result.stderr).toContain('failed to push some refs');
    expect(result.stderr).not.toContain('AAAA');
    expect(result.stderr).toContain('[redacted]');
    expect(remoteTip(remote, 'feature')).toBeNull();
  });

  test('says pushed only when the remote tip reads back as HEAD', () => {
    const { repo, remote } = withRemote();
    git(repo, ['switch', '-c', 'feature']);
    commit(repo, 'feature.txt', 'one\n', 'one');
    expect(push(repo, 'main').status).toBe('pushed');
    // A remote that quietly puts the branch back: the push exits 0, the tip never moved.
    mkdirSync(join(remote, 'hooks'), { recursive: true });
    const hook = join(remote, 'hooks', 'post-receive');
    writeFileSync(
      hook,
      '#!/bin/sh\nwhile read old new ref; do git update-ref "$ref" "$old"; done\n',
    );
    chmodSync(hook, 0o755);
    commit(repo, 'feature.txt', 'two\n', 'two');
    expect(() => push(repo, 'main')).toThrow('Push unconfirmed');
  });
});
