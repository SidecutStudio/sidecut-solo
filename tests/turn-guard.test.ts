// The turn guard: a PR handed to automerge keeps the session going until something waits on it,
// and skills a brief names are raised when they never load. Handoffs come from the record
// `solo automerge` writes and from GitHub's own view of this branch's PR; no shell text is read.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { git } from '../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import { cli, commit, fakeGh, makeRepo, type Rule, scratch } from './helpers/fixture.ts';
import { PLUGIN } from './package-rules.ts';

const HOOKS = join(PLUGIN, 'hooks');
const SCRIPT: Record<string, string> = {
  PostToolUse: 'post-tool-use-named-skills.mjs',
  UserPromptSubmit: 'user-prompt-submit-named-skills.mjs',
  Stop: 'stop-turn-guard.mjs',
};

function soloRepo({ pushed = false } = {}) {
  const { repo } = makeRepo();
  writeFileSync(join(repo, 'solo-workflow.toml'), 'merge = "when-green"\n');
  git(repo, ['checkout', '-q', '-b', 'feature']);
  if (pushed) {
    // An upstream is all the guard needs to ask GitHub about this branch's PR.
    git(repo, ['remote', 'add', 'origin', join(repo, 'nowhere')]);
    git(repo, ['update-ref', 'refs/remotes/origin/feature', 'HEAD']);
    git(repo, ['branch', '-q', '--set-upstream-to', 'origin/feature']);
  }
  return repo;
}

function hook(input: Record<string, unknown>, home: string, event = 'Stop') {
  const done = spawnSync('node', [join(HOOKS, SCRIPT[event] as string)], {
    input: JSON.stringify(input),
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });
  expect(done.status).toBe(0);
  return done.stdout.trim()
    ? (JSON.parse(done.stdout) as { decision: string; reason: string })
    : null;
}

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
/** A handoff record as `solo automerge` leaves it for this worktree. */
const recorded = (repo: string, extra: Record<string, unknown> = {}) => {
  mkdirSync(handoffs(repo), { recursive: true });
  writeFileSync(
    join(handoffs(repo), 'pr-461.json'),
    JSON.stringify({ ref: '461', via: 'auto-merge', worktree: repo, blocks: 0, ...extra }),
  );
};

/** GitHub's answer for this branch's PR, as `gh pr view` gives it. */
const branchView = (state: string, labels: string[], auto: boolean): Rule => ({
  args: ['pr', 'view', '--json', 'number,state,labels,autoMergeRequest'],
  replies: [
    {
      stdout: {
        number: 461,
        state,
        labels: labels.map((name) => ({ name })),
        autoMergeRequest: auto ? { mergeMethod: 'SQUASH' } : null,
      },
    },
  ],
});

const started: ChildProcess[] = [];
afterEach(() => {
  for (const child of started.splice(0)) child.kill('SIGKILL');
});
function sleeper() {
  const child = spawn('node', ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  started.push(child);
  return child.pid as number;
}
const later = (ms: number) => new Date(Date.now() + ms).toISOString();

describe('automerge handoff', () => {
  test('a recorded handoff keeps the turn going until something waits on it', () => {
    // The session this guards against: hand the PR off, end the turn, and nobody wakes on the merge.
    const repo = soloRepo();
    const home = scratch();
    recorded(repo);
    const refused = hook(stop(repo), home);
    expect(refused?.decision).toBe('block');
    expect(refused?.reason).toContain('solo wait-merge 461');
    expect(refused?.reason).toContain('steps after the merge');
    expect(refused?.reason).toContain('run_in_background');
  });

  test('a live waiter inside its announced wait lets the turn end', () => {
    const repo = soloRepo();
    const home = scratch();
    recorded(repo, { waiter: { pid: sleeper(), at: 'now', until: later(60_000) } });
    expect(hook(stop(repo), home)).toBeNull();
  });

  test('a waiter past its wait, or a dead one, does not silence the hold', () => {
    const repo = soloRepo();
    const home = scratch();
    recorded(repo, { waiter: { pid: sleeper(), at: 'now', until: later(-1000) } });
    expect(hook(stop(repo), home)?.reason).toContain('solo wait-merge 461');
    const dead = spawnSync('node', ['-e', '0']).pid;
    recorded(repo, { waiter: { pid: dead, at: 'now', until: later(60_000) } });
    expect(hook(stop(repo), home)?.reason).toContain('solo wait-merge 461');
  });

  test("another worktree's handoff doesn't hold this one", () => {
    const repo = soloRepo();
    const home = scratch();
    recorded(repo, { worktree: '/elsewhere' });
    expect(hook(stop(repo), home)).toBeNull();
    // A wait alone names no worktree, so it holds no one either.
    recorded(repo, { worktree: undefined });
    expect(hook(stop(repo), home)).toBeNull();
  });

  test('the user still gets their stop after two refusals, until their next prompt', () => {
    const repo = soloRepo();
    const home = scratch();
    recorded(repo);
    expect(hook(stop(repo), home)?.decision).toBe('block');
    expect(hook(stop(repo, 's1', true), home)?.decision).toBe('block');
    expect(hook(stop(repo, 's1', true), home)).toBeNull();
    hook(prompt(repo, 'keep going'), home, 'UserPromptSubmit');
    expect(hook(stop(repo), home)?.decision).toBe('block');
  });

  test('auto-merge set on GitHub outside Solo is caught and sent to solo automerge', () => {
    const repo = soloRepo({ pushed: true });
    const home = scratch();
    fakeGh([branchView('OPEN', [], true)]);
    const refused = hook(stop(repo), home);
    expect(refused?.reason).toContain('not through Solo');
    expect(refused?.reason).toContain('`solo automerge 461`');
    expect(record(repo)).toMatchObject({ ref: '461', worktree: repo, outside_solo: true });
  });

  test('a merge label set outside Solo names the label to pass', () => {
    const repo = soloRepo({ pushed: true });
    const home = scratch();
    fakeGh([branchView('OPEN', ['bug', 'automerge'], false)]);
    expect(hook(stop(repo), home)?.reason).toContain('`solo automerge 461 --label automerge`');
  });

  test("GitHub's word that the PR merged or left automerge clears the record", () => {
    const repo = soloRepo({ pushed: true });
    const home = scratch();
    recorded(repo);
    fakeGh([branchView('MERGED', ['automerge'], false)]);
    expect(hook(stop(repo), home)).toBeNull();
    expect(existsSync(join(handoffs(repo), 'pr-461.json'))).toBe(false);
    recorded(repo);
    fakeGh([branchView('OPEN', ['bug'], false)]);
    expect(hook(stop(repo), home)).toBeNull();
    expect(existsSync(join(handoffs(repo), 'pr-461.json'))).toBe(false);
  });

  test('a branch never pushed, or a repo without Solo settings, costs no GitHub call', () => {
    const repo = soloRepo();
    const home = scratch();
    const calls = fakeGh([branchView('OPEN', [], true)]);
    expect(hook(stop(repo), home)).toBeNull();
    const { repo: plain } = makeRepo();
    expect(hook(stop(plain), home)).toBeNull();
    expect(calls()).toEqual([]);
  });

  test('a GitHub that cannot answer lets the session carry on', () => {
    const repo = soloRepo({ pushed: true });
    const home = scratch();
    fakeGh([{ args: ['pr'], replies: [{ code: 1, stderr: 'offline' }] }]);
    expect(hook(stop(repo), home)).toBeNull();
  });

  test('Antigravity gets the same hold in its own shape, fresh for each user message', () => {
    const repo = soloRepo();
    const home = scratch();
    recorded(repo);
    const stopIn = (said: string) =>
      hook({ conversationId: 'c1', workspacePaths: [repo], lastUserInput: said }, home);
    const held = stopIn('ship it');
    expect(held?.decision).toBe('continue');
    expect(held?.reason).toContain('solo wait-merge 461');
    expect(stopIn('ship it')?.decision).toBe('continue');
    expect(stopIn('ship it')).toBeNull();
    // No prompt hook there: a new user message is what gives the hold back.
    expect(stopIn('and the release?')?.decision).toBe('continue');
  });
});

describe('solo automerge and wait-merge', () => {
  const PR = 'repos/{owner}/{repo}/pulls/461';
  // Branch protection holds an open PR back while its required checks run.
  const rest = (head: string, merged: boolean, state = 'blocked', base = 'main') => ({
    number: 461,
    html_url: 'https://github.com/o/r/pull/461',
    head: { sha: head, ref: 'feature' },
    base: { ref: base },
    state: merged ? 'closed' : 'open',
    merged_at: merged ? '2026-11-26T19:34:50Z' : null,
    merge_commit_sha: merged ? '7f4d285' : null,
    mergeable: true,
    mergeable_state: state,
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
    args: ['pr', 'view', '461'],
    replies: [{ stdout: { labels: names.map((name) => ({ name })), autoMergeRequest: null } }],
  });
  const handOff: Rule = { args: ['pr', 'merge'], replies: [{ stdout: '' }] };
  const permission = ['--authorized', '--publication-effect', 'none', '--host-scope', 'allowed'];
  const reviewed = (repo: string, head: string) =>
    cli([
      ...['--repo', repo, 'review', '--reviewed-head', head, '--reviewer', 'independent'],
      ...['--level', 'standard', '--review-notes', 'read it', '--blocking-findings', '0'],
    ]);
  const automerge = (repo: string, ...extra: string[]) =>
    cli([
      ...['--repo', repo, 'automerge', '461', '--require-check', 'gate', '--interval', '0.05'],
      ...permission,
      ...extra,
    ]);

  test('hands off a reviewed head, records it for this worktree and waits for the merge', () => {
    const repo = soloRepo();
    const home = scratch();
    const head = git(repo, ['rev-parse', 'HEAD']);
    expect(reviewed(repo, head).code).toBe(0);
    const open = { stdout: rest(head, false) };
    const calls = fakeGh([
      { args: ['api', PR], replies: [open, open, open, open, { stdout: rest(head, true) }] },
      checks(null),
      {
        args: ['api', 'repos/{owner}/{repo}/branches/main/protection/required_status_checks'],
        replies: [{ stdout: { contexts: ['gate'] } }],
      },
      handOff,
      statuses,
      labels('automerge'),
    ]);
    const done = automerge(repo);
    expect(done.code).toBe(0);
    expect(JSON.parse(done.stdout)).toMatchObject({
      status: 'merged',
      via: 'auto-merge',
      merge_commit: '7f4d285',
    });
    expect(calls()).toContainEqual([
      ...['pr', 'merge', '461', '--auto', '--squash', '--match-head-commit', head],
    ]);
    expect(readdirSync(handoffs(repo))).toEqual([]);
    expect(hook(stop(repo), home)).toBeNull();
  });

  test('--no-wait leaves a record the turn guard holds the session to', () => {
    const repo = soloRepo();
    const home = scratch();
    const head = git(repo, ['rev-parse', 'HEAD']);
    reviewed(repo, head);
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest(head, false) }] },
      checks(null),
      {
        args: ['api', 'repos/{owner}/{repo}/branches/main/protection/required_status_checks'],
        replies: [{ stdout: { contexts: ['gate'] } }],
      },
      handOff,
      statuses,
    ]);
    const done = automerge(repo, '--no-wait');
    expect(done.code).toBe(0);
    expect(JSON.parse(done.stdout).status).toBe('handed-off');
    expect(record(repo)).toMatchObject({ ref: '461', head, worktree: repo });
    expect(hook(stop(repo), home)?.reason).toContain('solo wait-merge 461');
  });

  test('a merge label goes on through the REST API', () => {
    const repo = soloRepo();
    const head = git(repo, ['rev-parse', 'HEAD']);
    reviewed(repo, head);
    const calls = fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest(head, false) }] },
      checks(null),
      { args: ['api', '--method', 'POST'], replies: [{ stdout: [] }] },
      statuses,
    ]);
    const done = automerge(repo, '--no-wait', '--label', 'automerge');
    expect(JSON.parse(done.stdout).via).toBe('label automerge');
    expect(calls()).toContainEqual([
      ...['api', '--method', 'POST', 'repos/{owner}/{repo}/issues/461/labels'],
      ...['-f', 'labels[]=automerge'],
    ]);
    expect(automerge(repo, '--no-wait', '--label', 'ready').stderr).toContain(
      "doesn't look like a merge label",
    );
  });

  test('refuses what auto-merge would merge at once, a missing check and a stacked PR', () => {
    const repo = soloRepo();
    const head = git(repo, ['rev-parse', 'HEAD']);
    reviewed(repo, head);
    // Nothing holds a clean PR back, so gh would merge it now instead of turning auto-merge on.
    let calls = fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest(head, false, 'clean') }] },
      checks(null),
      {
        args: ['api', 'repos/{owner}/{repo}/branches/main/protection/required_status_checks'],
        replies: [{ stdout: { contexts: ['gate'] } }],
      },
      handOff,
      statuses,
    ]);
    const clean = automerge(repo, '--no-wait');
    expect(clean.code).toBe(2);
    expect(clean.stderr).toContain('GitHub would merge this PR at once');
    expect(calls().some((call) => call[0] === 'pr' && call[1] === 'merge')).toBe(false);
    // Until GitHub has worked mergeability out, gh's own read could still find it clean.
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest(head, false, 'unknown') }] },
      checks(null),
      {
        args: ['api', 'repos/{owner}/{repo}/branches/main/protection/required_status_checks'],
        replies: [{ stdout: { contexts: ['gate'] } }],
      },
      handOff,
      statuses,
    ]);
    expect(automerge(repo, '--no-wait').stderr).toContain('run solo automerge again in a moment');
    // Auto-merge waits only for what branch protection requires; Solo's extra check must pass first.
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest(head, false) }] },
      checks(null),
      {
        args: ['api', 'repos/{owner}/{repo}/branches/main/protection/required_status_checks'],
        replies: [{ stdout: { contexts: ['build'] } }],
      },
      handOff,
      statuses,
    ]);
    expect(automerge(repo, '--no-wait').stderr).toContain("branch protection doesn't require gate");
    // A label workflow decides for itself.
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest(head, false, 'clean') }] },
      checks(null),
      { args: ['api', '--method', 'POST'], replies: [{ stdout: [] }] },
      statuses,
    ]);
    expect(automerge(repo, '--no-wait', '--label', 'automerge').code).toBe(0);
    // A required check that never reported can't be waited on.
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest(head, false) }] },
      { args: ['api', '--paginate', '--slurp'], replies: [{ stdout: [{ check_runs: [] }] }] },
      {
        args: ['api', 'repos/{owner}/{repo}/branches/main/protection/required_status_checks'],
        replies: [{ stdout: { contexts: ['gate'] } }],
      },
      handOff,
      statuses,
    ]);
    expect(automerge(repo, '--no-wait').stderr).toContain('gate (missing)');
    // A PR stacked on another open PR's branch waits for the one below.
    writeFileSync(join(repo, 'solo-workflow.local.toml'), 'base_branch = "main"\n');
    calls = fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest(head, false, 'blocked', 'lower') }] },
      checks(null),
      {
        args: ['api', 'repos/{owner}/{repo}/pulls?state=open&per_page=100'],
        replies: [
          {
            stdout: [
              [
                {
                  number: 460,
                  head: { ref: 'lower', repo: { full_name: 'o/r' } },
                  base: { ref: 'main', repo: { full_name: 'o/r' } },
                },
              ],
            ],
          },
        ],
      },
      {
        args: ['api', 'repos/{owner}/{repo}/branches/main/protection/required_status_checks'],
        replies: [{ stdout: { contexts: ['gate'] } }],
      },
      handOff,
      statuses,
    ]);
    expect(automerge(repo, '--no-wait').stderr).toContain('stacked on PR 460');
    expect(calls().some((call) => call[0] === 'pr' && call[1] === 'merge')).toBe(false);
  });

  test("a handoff the turn guard caught outside Solo is Solo's once solo automerge runs", () => {
    const repo = soloRepo();
    const home = scratch();
    const head = git(repo, ['rev-parse', 'HEAD']);
    reviewed(repo, head);
    recorded(repo, { outside_solo: true, blocks: 2 });
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest(head, false) }] },
      checks(null),
      {
        args: ['api', 'repos/{owner}/{repo}/branches/main/protection/required_status_checks'],
        replies: [{ stdout: { contexts: ['gate'] } }],
      },
      handOff,
      statuses,
    ]);
    expect(automerge(repo, '--no-wait').code).toBe(0);
    expect(record(repo).outside_solo).toBeUndefined();
    expect(hook(stop(repo), home)?.reason).toContain('solo wait-merge 461');
  });

  test('refuses a head without a clean saved review, or without permission, and hands nothing off', () => {
    const repo = soloRepo();
    const head = git(repo, ['rev-parse', 'HEAD']);
    reviewed(repo, head);
    commit(repo, 'calc.py', 'def add(a, b):\n    return a + b\n', 'fix');
    const next = git(repo, ['rev-parse', 'HEAD']);
    const calls = fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest(next, false) }] },
      checks(null),
      {
        args: ['api', 'repos/{owner}/{repo}/branches/main/protection/required_status_checks'],
        replies: [{ stdout: { contexts: ['gate'] } }],
      },
      handOff,
      statuses,
    ]);
    const unreviewed = automerge(repo, '--no-wait');
    expect(unreviewed.code).toBe(2);
    expect(unreviewed.stderr).toContain('1 commit after the reviewed head');
    const unallowed = cli([
      ...['--repo', repo, 'automerge', '461', '--require-check', 'gate', '--no-wait'],
    ]);
    expect(unallowed.stderr).toContain('inspect what merging triggers first');
    expect(calls().some((call) => call[0] === 'pr' && call[1] === 'merge')).toBe(false);
    expect(existsSync(handoffs(repo))).toBe(false);
  });

  test('a failed required check returns, and the hold comes back for the next stop', () => {
    const repo = soloRepo();
    const home = scratch();
    recorded(repo);
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest('h', false) }] },
      checks('failure'),
      statuses,
      labels('automerge'),
    ]);
    const done = cli([
      ...['--repo', repo, 'wait-merge', '461', '--require-check', 'gate', '--interval', '0.05'],
    ]);
    expect(done.code).toBe(1);
    expect(JSON.parse(done.stdout)).toMatchObject({
      status: 'check-failed',
      failed_checks: ['gate'],
    });
    expect(record(repo).waiter).toBeUndefined();
    expect(hook(stop(repo), home)?.reason).toContain('solo wait-merge 461');
  });

  test('a wait that timed out gives the hold back, and its waiter announced its end', async () => {
    const repo = soloRepo();
    const home = scratch();
    recorded(repo);
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest('h', false) }] },
      checks(null),
      statuses,
      labels('automerge'),
    ]);
    const child = spawn(
      process.execPath,
      [
        join(PLUGIN, 'server', 'data', 'helper', 'solo.mjs'),
        ...['--repo', repo, 'wait-merge', '461', '--timeout', '1', '--interval', '0.05'],
      ],
      { env: process.env, stdio: 'ignore' },
    );
    started.push(child);
    for (let i = 0; i < 100 && !record(repo).waiter; i++)
      await new Promise((done) => setTimeout(done, 20));
    const waiter = record(repo).waiter;
    expect(waiter.pid).toBe(child.pid);
    expect(Date.parse(waiter.until)).toBeGreaterThan(Date.now());
    expect(hook(stop(repo), home)).toBeNull();
    await new Promise((done) => child.on('exit', done));
    expect(record(repo).waiter).toBeUndefined();
    expect(hook(stop(repo), home)?.reason).toContain('solo wait-merge 461');
  });

  test('a push after the handoff takes the PR off automerge instead of merging it unreviewed', () => {
    const repo = soloRepo();
    const home = scratch();
    recorded(repo, { head: 'reviewed', via: 'label automerge' });
    const calls = fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest('pushed-later', false) }] },
      checks(null),
      { args: ['api', '--method', 'DELETE'], replies: [{ stdout: [] }] },
      statuses,
      labels('automerge'),
    ]);
    const done = cli([
      ...['--repo', repo, 'wait-merge', '461', '--require-check', 'gate', '--interval', '0.05'],
    ]);
    expect(done.code).toBe(1);
    expect(JSON.parse(done.stdout)).toMatchObject({ status: 'head-moved' });
    expect(JSON.parse(done.stdout).next).toContain('taken off automerge');
    expect(calls()).toContainEqual([
      ...['api', '--method', 'DELETE', 'repos/{owner}/{repo}/issues/461/labels/automerge'],
    ]);
    expect(readdirSync(handoffs(repo))).toEqual([]);
    expect(hook(stop(repo), home)).toBeNull();
  });

  test('a push that merged before a poll saw it is reported as merged unreviewed', () => {
    const repo = soloRepo();
    recorded(repo, { head: 'reviewed' });
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest('pushed-later', true) }] },
      checks('success'),
      statuses,
      labels('automerge'),
    ]);
    const done = cli([
      ...['--repo', repo, 'wait-merge', '461', '--require-check', 'gate', '--interval', '0.05'],
    ]);
    expect(done.code).toBe(1);
    const result = JSON.parse(done.stdout);
    expect(result.status).toBe('merged-unreviewed');
    expect(result.next).toContain('review reviewed..pushed-later');
    expect(readdirSync(handoffs(repo))).toEqual([]);
  });

  test('a label taken off ends the wait and the hold', () => {
    const repo = soloRepo();
    const home = scratch();
    recorded(repo);
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: rest('h', false) }] },
      checks(null),
      statuses,
      labels('bug'),
    ]);
    const done = cli([
      ...['--repo', repo, 'wait-merge', '461', '--require-check', 'gate', '--interval', '0.05'],
    ]);
    expect(done.code).toBe(1);
    expect(JSON.parse(done.stdout).status).toBe('not-handed-off');
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
    hook(prompt(repo, brief), home, 'UserPromptSubmit');
    hook(
      {
        hook_event_name: 'PostToolUse',
        session_id: 's1',
        cwd: repo,
        tool_name: 'Skill',
        tool_input: { skill: 'sidecut-solo:solo-plan-change' },
      },
      home,
      'PostToolUse',
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

  test('a skill quoted in a peer session message is not this session’s', () => {
    const home = scratch();
    const repo = scratch();
    const relayed = [
      '<cross-session-message from="local_x">Ran `sidecut-solo:solo-test-behavior`; PR #3 is green.</cross-session-message>',
      '<~agent-message>use solo-review-code</~agent-message>',
      '<side-sessions-event>solo-plan-change finished</side-sessions-event>',
      '<pasted_content id="p1">Run /sidecut-solo:solo-deliver-change now.</pasted_content>',
      '<task-notification>solo-diagnose-problem done',
    ];
    for (const [i, text] of relayed.entries()) {
      const session = `r${i}`;
      hook(prompt(repo, `Thanks, carry on.\n${text}`, session), home, 'UserPromptSubmit');
      expect(hook(stop(repo, session), home)).toBeNull();
    }
  });

  test('skills inside code, quotes or meant for a later step are left out', () => {
    const home = scratch();
    const repo = scratch();
    const brief = [
      'Fix the hook and add tests.',
      '```',
      'solo review --skill solo-review-code',
      '```',
      '> Earlier the user said: use solo-write-copy.',
      'Run `sed -n 1p skills/solo-build-change/SKILL.md` to compare.',
      'A later step runs solo-test-behavior, and the session that started you will use solo-compare-plugin.',
    ].join('\n');
    hook(prompt(repo, brief, 'q1'), home, 'UserPromptSubmit');
    expect(hook(stop(repo, 'q1'), home)).toBeNull();
  });

  test('a deferred clause leaves the rest of its sentence counted, and code naming a tag is code', () => {
    const home = scratch();
    const repo = scratch();
    const brief = [
      'Fix it with solo-build-change and open a follow-up PR.',
      'Use solo-review-code on the diff, which was written later in the day.',
      'The `<task-notification>` tag is relayed, so plan with solo-plan-change.',
      '```solo-write-copy``` is not a fence.',
    ].join('\n');
    hook(prompt(repo, brief, 'd1'), home, 'UserPromptSubmit');
    expect(hook(stop(repo, 'd1'), home)?.reason).toContain(
      'sidecut-solo:solo-build-change, sidecut-solo:solo-review-code, sidecut-solo:solo-plan-change, sidecut-solo:solo-write-copy',
    );
  });

  test('a deferral leading a clause or a list covers what follows it', () => {
    const home = scratch();
    const repo = scratch();
    const brief = [
      'Later, run solo-deliver-change.',
      'Next step: solo-test-behavior',
      'Use solo-build-change (later: solo-compare-plugin)',
      'Plan with solo-plan-change — another session runs solo-write-copy.',
      'After that:',
      '- solo-diagnose-problem',
      '- solo-research-topic',
      'Now check it with solo-review-code.',
    ].join('\n');
    hook(prompt(repo, brief, 'l1'), home, 'UserPromptSubmit');
    const reason = hook(stop(repo, 'l1'), home)?.reason ?? '';
    expect(reason).toContain(
      'sidecut-solo:solo-build-change, sidecut-solo:solo-plan-change, sidecut-solo:solo-review-code,',
    );
    for (const later of [
      'deliver-change',
      'test-behavior',
      'compare-plugin',
      'write-copy',
      'diagnose-problem',
      'research-topic',
    ])
      expect(reason).not.toContain(`solo-${later}`);
  });

  test('a huge run of one character is read quickly', () => {
    const home = scratch();
    const repo = scratch();
    for (const text of [
      '`'.repeat(200_000),
      ' '.repeat(200_000),
      '<agent-message '.repeat(20_000),
    ]) {
      const started = Date.now();
      hook(prompt(repo, text, 'h1'), home, 'UserPromptSubmit');
      expect(Date.now() - started).toBeLessThan(3000);
    }
  });

  test('own words beside a relayed block and a slash command still count, on Codex too', () => {
    const home = scratch();
    const repo = scratch();
    const text =
      '<cross-session-message>solo-test-behavior passed</cross-session-message>\nNow review it with solo-review-code.\n/sidecut-solo:solo-deliver-change after that.';
    hook({ ...prompt(repo, text, 'c1'), turn_id: 't' }, home, 'UserPromptSubmit');
    const raised = hook({ ...stop(repo, 'c1'), turn_id: 't' }, home);
    expect(raised?.decision).toBe('block');
    expect(raised?.reason).toContain(
      'sidecut-solo:solo-review-code, sidecut-solo:solo-deliver-change',
    );
    expect(raised?.reason).not.toContain('solo-test-behavior');
  });

  test('a brief whose named skills all loaded ends the turn quietly', () => {
    const home = scratch();
    const repo = scratch();
    hook(prompt(repo, 'Use solo-review-code.', 's2'), home, 'UserPromptSubmit');
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
      'PostToolUse',
    );
    expect(hook(stop(repo, 's2'), home)).toBeNull();
  });
});
