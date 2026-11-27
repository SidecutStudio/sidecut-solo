// The merge guard: in a Solo repo a shell command that names a gh merge is refused and sent to
// `solo merge` or `solo automerge`. It is a word check, so these tests cover what it catches, what
// it leaves alone, where it applies and how each host is answered; not shell forms.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PLUGIN } from './package-rules.ts';

const HOOK = join(PLUGIN, 'hooks', 'pre-tool-use-merge-guard.mjs');

let dir = '';
let solo = '';
let other = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'solo-guard-'));
  solo = join(dir, 'solo');
  other = join(dir, 'other');
  for (const repo of [solo, other]) {
    await mkdir(join(repo, 'nested'), { recursive: true });
    execFileSync('git', ['-C', repo, 'init', '-q']);
  }
  await writeFile(join(solo, 'solo-workflow.toml'), 'merge = "when-green"\n');
});
afterAll(() => rm(dir, { recursive: true, force: true }));

/** Runs the hook from `run` with Claude Code's PreToolUse input for a Bash command. */
function guard(command: string, cwd: string, run = dir, raw?: string, description = '') {
  const input =
    raw ??
    JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd,
      tool_name: 'Bash',
      tool_input: { command, description },
    });
  const proc = spawnSync(process.execPath, [HOOK], {
    cwd: run,
    env: process.env,
    input,
    encoding: 'utf8',
  });
  return { code: proc.status, out: proc.stdout };
}

const decision = (out: string) =>
  out ? JSON.parse(out).hookSpecificOutput.permissionDecision : 'none';

describe('merge guard hook', () => {
  const merges = [
    'gh pr merge 42 --squash',
    'gh pr merge 42 --squash --admin',
    'gh pr merge --auto --squash',
    'gh pr merge 42 --squash --match-head-commit 0123456789abcdef0123456789abcdef01234567',
    'gh -R o/r pr merge 42',
    'gh pr --repo=o/r merge 42',
    'cd web && gh pr merge 42',
    "bash -lc 'gh pr merge 1 --squash'",
    'docker exec c sh -c "gh pr merge 1"',
    'gh api -X PUT repos/o/r/pulls/42/merge -f merge_method=squash',
    "gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'",
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
  ];
  for (const command of merges) {
    test(`refuses and points at the helper: ${command}`, () => {
      const { code, out } = guard(command, solo);
      expect(code).toBe(0);
      expect(decision(out)).toBe('deny');
      const reason = JSON.parse(out).hookSpecificOutput.permissionDecisionReason;
      expect(reason).toContain('solo merge <pr>');
      expect(reason).toContain('solo automerge <pr>');
    });
  }

  const allowed = [
    'gh pr view 42 --json mergeable,mergedAt',
    'gh pr checks 42',
    'git merge origin/main',
    'git fetch && git merge --ff-only origin/main',
    'sh plugins/sidecut-solo/server/data/helper/solo merge 42 --authorized',
    'solo automerge 42 --label automerge',
    'gh pr merge 42 --disable-auto',
    'gh pr edit 42 --add-label automerge',
  ];
  for (const command of allowed) {
    test(`stays silent for: ${command}`, () => {
      expect(guard(command, solo)).toEqual({ code: 0, out: '' });
    });
  }

  test('a message that mentions a gh merge is refused too, with the way round it', () => {
    const { out } = guard('git commit -m "Stop gh pr merge in hooks"', solo);
    expect(decision(out)).toBe('deny');
    expect(JSON.parse(out).hookSpecificOutput.permissionDecisionReason).toContain(
      'put that text in a file',
    );
  });

  test('ignores the description Claude writes for the command', () => {
    expect(guard('gh pr view 42', solo, dir, undefined, 'gh pr merge 42')).toEqual({
      code: 0,
      out: '',
    });
  });

  test('stays fast on a long command', () => {
    const started = performance.now();
    expect(guard(`echo ${'gh pr view 1; '.repeat(20_000)}`, solo)).toEqual({ code: 0, out: '' });
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test('refuses from a nested directory, and stays silent outside a Solo repo', () => {
    expect(decision(guard('gh pr merge 1', join(solo, 'nested')).out)).toBe('deny');
    expect(guard('gh pr merge 1', other)).toEqual({ code: 0, out: '' });
    expect(guard('gh pr merge 1', dir)).toEqual({ code: 0, out: '' });
  });

  test('falls back to its own directory when the input has no usable cwd', () => {
    const raw = '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 1"}}';
    expect(decision(guard('', '', solo, raw).out)).toBe('deny');
    expect(guard('', '', other, raw)).toEqual({ code: 0, out: '' });
  });

  test('stays silent on malformed input', () => {
    expect(guard('', '', solo, 'not json')).toEqual({ code: 0, out: '' });
  });

  test('answers Antigravity in its own shape, from the command and folder it names', () => {
    const raw = JSON.stringify({
      toolCall: { name: 'run_command', args: { CommandLine: 'gh pr merge 3', Cwd: solo } },
      conversationId: 'c1',
      workspacePaths: [other],
    });
    const { out } = guard('', '', dir, raw);
    expect(JSON.parse(out)).toMatchObject({ decision: 'deny' });
    expect(JSON.parse(out).reason).toContain('solo merge <pr>');
  });

  test('all three hosts register the merge guard and the turn guard', async () => {
    const claude = JSON.parse(await readFile(join(PLUGIN, '.claude-plugin/plugin.json'), 'utf8'));
    const codex = JSON.parse(await readFile(join(PLUGIN, '.codex-plugin/plugin.json'), 'utf8'));
    expect(claude.hooks).toBeUndefined();
    expect(codex.hooks).toBe('./hooks/codex-hooks.json');
    expect(existsSync(join(PLUGIN, 'plugin.json'))).toBe(false);
    const hooks = JSON.parse(await readFile(join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'));
    expect(Object.keys(hooks.hooks).sort()).toEqual([
      'PostToolUse',
      'PreToolUse',
      'Stop',
      'UserPromptSubmit',
    ]);
    const codexHooks = JSON.parse(await readFile(join(PLUGIN, 'hooks/codex-hooks.json'), 'utf8'));
    for (const event of ['PreToolUse', 'Stop', 'UserPromptSubmit'])
      expect(codexHooks.hooks[event]).toEqual(hooks.hooks[event]);
    const [group] = hooks.hooks.PreToolUse;
    expect(group.matcher).toBe('Bash');
    expect(group.hooks).toEqual([
      {
        type: 'command',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the host fills this in, not JavaScript.
        command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool-use-merge-guard.mjs"',
        timeout: 5,
      },
    ]);
    // Antigravity reads hooks.json at the plugin root and runs hooks from that folder.
    const antigravity = JSON.parse(await readFile(join(PLUGIN, 'hooks.json'), 'utf8'));
    expect(antigravity['merge-guard'].PreToolUse[0]).toMatchObject({ matcher: 'run_command' });
    expect(antigravity['merge-guard'].PreToolUse[0].hooks[0].command).toBe(
      'node ./hooks/pre-tool-use-merge-guard.mjs',
    );
    expect(antigravity['turn-guard'].Stop[0].command).toBe('node ./hooks/stop-turn-guard.mjs');
  });
});
