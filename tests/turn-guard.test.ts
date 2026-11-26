// The turn guard: a PR handed to automerge keeps the session going until something waits on it,
// and skills a brief names are raised when they never load. The first test is the session the
// builder-remote-connector record caught: label, end the turn, merge, nobody wakes.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { git } from '../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import { cli, fakeGh, makeRepo, type Rule, scratch } from './helpers/fixture.ts';
import { PLUGIN } from './package-rules.ts';

const HOOKS = join(PLUGIN, 'hooks');
const SCRIPT: Record<string, string> = {
  PreToolUse: 'pre-tool-use-automerge-handoff.mjs',
  PostToolUse: 'post-tool-use-named-skills.mjs',
  UserPromptSubmit: 'user-prompt-submit-named-skills.mjs',
  Stop: 'stop-turn-guard.mjs',
};

function soloRepo() {
  const { repo } = makeRepo();
  writeFileSync(join(repo, 'solo-workflow.toml'), 'merge = "when-green"\n');
  git(repo, ['checkout', '-q', '-b', 'feature']);
  return repo;
}

function hook(input: { hook_event_name: string; [key: string]: unknown }, home: string) {
  const done = spawnSync('node', [join(HOOKS, SCRIPT[input.hook_event_name] as string)], {
    input: JSON.stringify(input),
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });
  expect(done.status).toBe(0);
  return done.stdout.trim()
    ? (JSON.parse(done.stdout) as { decision: string; reason: string })
    : null;
}

const bash = (repo: string, command: string, session = 's1') => ({
  hook_event_name: 'PreToolUse',
  session_id: session,
  cwd: repo,
  tool_name: 'Bash',
  tool_input: { command },
});
const stop = (repo: string, session = 's1', active = false) => ({
  hook_event_name: 'Stop',
  session_id: session,
  cwd: repo,
  stop_hook_active: active,
});
const prompt = (repo: string, text: string, session = 's1') => ({
  hook_event_name: 'UserPromptSubmit',
  session_id: session,
  cwd: repo,
  prompt: text,
});

const handoffs = (repo: string) => join(repo, '.git', 'solo-handoffs');
const record = (repo: string, name = 'pr-461.json') =>
  JSON.parse(readFileSync(join(handoffs(repo), name), 'utf8'));

describe('automerge handoff', () => {
  test('a labelled PR keeps the turn going until something waits on it', () => {
    // The session this guards against: label the PR, end the turn, and nobody wakes on the merge.
    const repo = soloRepo();
    const home = scratch();
    expect(hook(bash(repo, 'gh pr edit 461 --add-label automerge'), home)).toBeNull();
    expect(readdirSync(handoffs(repo))).toEqual(['pr-461.json']);
    const refused = hook(stop(repo), home);
    expect(refused?.decision).toBe('block');
    expect(refused?.reason).toContain('solo wait-merge 461');
    expect(refused?.reason).toContain('steps after the merge');
  });

  test('a running wait-merge lets the turn end', () => {
    const repo = soloRepo();
    const home = scratch();
    hook(bash(repo, 'gh pr merge 461 --auto --squash'), home);
    const path = join(handoffs(repo), 'pr-461.json');
    writeFileSync(
      path,
      JSON.stringify({ ...record(repo), waiter: { pid: process.pid, at: 'now' } }),
    );
    expect(hook(stop(repo), home)).toBeNull();
    // A waiter that has exited no longer counts.
    writeFileSync(
      path,
      JSON.stringify({ ...record(repo), waiter: { pid: 2 ** 22 + 7, at: 'now' } }),
    );
    expect(hook(stop(repo), home)?.decision).toBe('block');
  });

  test("auto-merge on this branch's PR, and the API forms, are recorded", () => {
    const home = scratch();
    const cases: [string, string][] = [
      ['git push -u origin feature && gh pr merge --auto --squash', 'branch-feature.json'],
      [
        "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
        'branch-feature.json',
      ],
      ['gh api repos/o/r/issues/461/labels -f "labels[]=automerge"', 'pr-461.json'],
      ['gh pr edit https://github.com/o/r/pull/461 --add-label "bug,automerge"', 'pr-461.json'],
      ['gh -R o/r pr edit --add-label automerge 461', 'pr-461.json'],
      ['gh pr create --title t --body b --label automerge', 'branch-feature.json'],
      ['gh issue edit 461 --add-label automerge', 'pr-461.json'],
      ['PR=461; gh pr merge "$PR" --auto', 'branch-feature.json'],
      ["bash -lc 'gh pr merge 461 --auto'", 'pr-461.json'],
      ['timeout 60 env GH_TOKEN=x gh pr merge 461 --auto', 'pr-461.json'],
      ['(gh pr merge 461 --auto)', 'pr-461.json'],
      ['timeout -s KILL 60 gh pr merge 461 --auto', 'pr-461.json'],
      ['if true; then gh pr merge 461 --auto; fi', 'pr-461.json'],
    ];
    for (const [command, name] of cases) {
      const repo = soloRepo();
      hook(bash(repo, command), home);
      expect(readdirSync(handoffs(repo)), command).toEqual([name]);
    }
    const repo = soloRepo();
    hook(bash(repo, 'gh pr merge --auto'), home);
    expect(hook(stop(repo), home)?.reason).toContain('the PR for feature');
  });

  test("another session's handoff doesn't hold this one", () => {
    const repo = soloRepo();
    const home = scratch();
    hook(bash(repo, 'gh pr edit 461 --add-label automerge', 'other'), home);
    expect(hook(stop(repo, 's1'), home)).toBeNull();
    expect(hook(stop(repo, 'other'), home)?.decision).toBe('block');
  });

  test('a record with no session holds no one, and a waiter covers only its own PR', () => {
    const repo = soloRepo();
    const home = scratch();
    mkdirSync(handoffs(repo), { recursive: true });
    writeFileSync(join(handoffs(repo), 'pr-5.json'), JSON.stringify({ ref: '5' }));
    expect(hook(stop(repo), home)).toBeNull();
    hook(bash(repo, 'gh pr edit 461 --add-label automerge'), home);
    hook(bash(repo, 'gh pr edit 462 --add-label automerge'), home);
    const path = join(handoffs(repo), 'pr-461.json');
    writeFileSync(
      path,
      JSON.stringify({ ...record(repo), waiter: { pid: process.pid, at: 'now' } }),
    );
    const refused = hook(stop(repo), home);
    expect(refused?.reason).toContain('PR #462');
    expect(refused?.reason).not.toContain('PR #461');
  });

  test('the user still gets their stop after two refusals, until their next prompt', () => {
    const repo = soloRepo();
    const home = scratch();
    hook(bash(repo, 'gh pr edit 461 --add-label automerge'), home);
    expect(hook(stop(repo), home)?.decision).toBe('block');
    expect(hook(stop(repo, 's1', true), home)?.decision).toBe('block');
    expect(hook(stop(repo, 's1', true), home)).toBeNull();
    hook(prompt(repo, 'carry on'), home);
    expect(hook(stop(repo), home)?.decision).toBe('block');
  });

  test('a long chain of assignments is read in linear time', () => {
    const repo = soloRepo();
    const started = Date.now();
    hook(bash(repo, `${'a='.repeat(5000)}x gh pr view 1`), scratch());
    expect(Date.now() - started).toBeLessThan(3000);
    expect(existsSync(handoffs(repo))).toBe(false);
  });

  test('ordinary commands and repos without Solo settings record nothing', () => {
    const home = scratch();
    const repo = soloRepo();
    for (const command of [
      'gh pr edit 461 --add-label bug',
      'gh pr merge 461 --squash --match-head-commit abc',
      'git commit -m "turn on automerge later"',
      'gh pr view 461',
      'gh pr comment 461 --body "gh pr merge --auto later"',
      'gh pr edit 461 --add-label bug --remove-label automerge',
    ])
      hook(bash(repo, command), home);
    expect(existsSync(handoffs(repo))).toBe(false);
    expect(hook(stop(repo), home)).toBeNull();
    const { repo: plain } = makeRepo();
    hook(bash(plain, 'gh pr edit 461 --add-label automerge'), home);
    expect(existsSync(handoffs(plain))).toBe(false);
  });
});

describe('solo wait-merge', () => {
  const PR = 'repos/{owner}/{repo}/pulls/461';
  const rest = (merged: boolean) => ({
    number: 461,
    html_url: 'https://github.com/o/r/pull/461',
    head: { sha: 'h', ref: 'feature' },
    base: { ref: 'main' },
    state: merged ? 'closed' : 'open',
    merged_at: merged ? '2026-11-26T19:34:50Z' : null,
    merge_commit_sha: merged ? '7f4d285' : null,
    mergeable: true,
    mergeable_state: 'clean',
  });
  const checks = (conclusion: string | null): Rule => ({
    args: ['api', '--paginate', '--slurp'],
    replies: [
      {
        stdout: [
          {
            check_runs: [
              {
                name: 'gate',
                status: conclusion ? 'completed' : 'in_progress',
                conclusion,
                html_url: 'https://ci/gate',
              },
            ],
          },
        ],
      },
    ],
  });
  const statuses: Rule = { args: ['api'], replies: [{ stdout: { statuses: [] } }] };
  const labels = (...names: string[]): Rule => ({
    args: ['pr', 'view'],
    replies: [{ stdout: { labels: names.map((name) => ({ name })), autoMergeRequest: null } }],
  });
  const wait = (repo: string) =>
    cli(['--repo', repo, 'wait-merge', '461', '--require-check', 'gate', '--interval', '0.05']);

  test('waits through pending checks, returns the merge and clears the handoff', () => {
    const repo = soloRepo();
    const home = scratch();
    hook(bash(repo, 'gh pr edit 461 --add-label automerge'), home);
    const open = { stdout: rest(false) };
    fakeGh([
      { args: ['api', PR], replies: [open, open, open, open, { stdout: rest(true) }] },
      checks(null),
      statuses,
      labels('automerge'),
    ]);
    const done = cli([
      '--repo',
      repo,
      'wait-merge',
      '461',
      '--require-check',
      'gate',
      '--interval',
      '0.05',
    ]);
    expect(done.code).toBe(0);
    const result = JSON.parse(done.stdout);
    expect(result.status).toBe('merged');
    expect(result.merge_commit).toBe('7f4d285');
    expect(readdirSync(handoffs(repo))).toEqual([]);
  });

  test('a failed required check returns, and the hold comes back for the next stop', () => {
    const repo = soloRepo();
    const home = scratch();
    hook(bash(repo, 'gh pr edit 461 --add-label automerge'), home);
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest(false) }] },
      checks('failure'),
      statuses,
      labels('automerge'),
    ]);
    const done = cli([
      '--repo',
      repo,
      'wait-merge',
      '461',
      '--require-check',
      'gate',
      '--interval',
      '0.05',
    ]);
    expect(done.code).toBe(1);
    expect(JSON.parse(done.stdout)).toMatchObject({
      status: 'check-failed',
      failed_checks: ['gate'],
    });
    expect(record(repo).waiter).toBeUndefined();
    expect(hook(stop(repo), home)?.reason).toContain('solo wait-merge 461');
  });

  test('a label taken off ends the wait and the hold', () => {
    const repo = soloRepo();
    const home = scratch();
    hook(bash(repo, 'gh pr merge --auto'), home);
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest(false) }] },
      checks(null),
      statuses,
      labels('bug'),
    ]);
    const done = wait(repo);
    expect(done.code).toBe(1);
    expect(JSON.parse(done.stdout).status).toBe('not-handed-off');
    // The branch record goes too: wait-merge read the PR's branch from GitHub.
    expect(readdirSync(handoffs(repo))).toEqual([]);
    expect(hook(stop(repo), home)).toBeNull();
  });
});

describe('named skills', () => {
  test('a brief naming three skills raises the two that never loaded, once', () => {
    const home = scratch();
    const repo = scratch();
    mkdirSync(join(repo, 'x'));
    const brief =
      'Plan with `solo-plan-change`, build with `solo-build-change`, and deliver through `sidecut-solo:solo-deliver-change`. Not solo-made-up.';
    hook({ hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd: repo, prompt: brief }, home);
    hook(
      {
        hook_event_name: 'PostToolUse',
        session_id: 's1',
        cwd: repo,
        tool_name: 'Skill',
        tool_input: { skill: 'sidecut-solo:solo-plan-change' },
      },
      home,
    );
    const raised = hook(stop(repo), home);
    expect(raised?.decision).toBe('block');
    expect(raised?.reason).toContain(
      'sidecut-solo:solo-build-change, sidecut-solo:solo-deliver-change',
    );
    expect(raised?.reason).not.toContain('solo-plan-change');
    expect(raised?.reason).not.toContain('made-up');
    expect(hook(stop(repo), home)).toBeNull();
  });

  test('a brief whose named skills all loaded ends the turn quietly', () => {
    const home = scratch();
    const repo = scratch();
    hook(
      {
        hook_event_name: 'UserPromptSubmit',
        session_id: 's2',
        cwd: repo,
        prompt: 'Use solo-review-code.',
      },
      home,
    );
    // Codex reads the skill with a shell command instead of a Skill tool.
    hook(
      {
        hook_event_name: 'PostToolUse',
        session_id: 's2',
        turn_id: 't',
        cwd: repo,
        tool_name: 'Bash',
        tool_input: {
          command: `sed -n 1,200p ${join(PLUGIN, 'skills', 'solo-review-code', 'SKILL.md')}`,
        },
      },
      home,
    );
    expect(hook(stop(repo, 's2'), home)).toBeNull();
  });
});
