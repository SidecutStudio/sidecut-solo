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
async function guard(command: string, cwd: string, run = dir, raw?: string, description = '') {
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

function decision(out: string) {
  return out ? JSON.parse(out).hookSpecificOutput.permissionDecision : 'none';
}

describe('merge guard hook', () => {
  // `gh pr merge --admin` is the one form that asks GitHub to skip required checks and reviews.
  const denies = [
    'gh pr merge 42 --squash --admin',
    'gh pr merge --admin 42',
    'cd web && gh pr merge 42 --admin',
    'gh -R o/r pr merge 42 --admin',
    'gh pr --repo=o/r merge 42 --admin',
    'cd web\ngh pr merge 42 --admin',
    'gh pr \\\n  merge 42 --admin',
    'GH_REPO=o/r gh pr merge 1 --admin',
    'timeout 60 gh pr merge 1 --admin',
    '/opt/homebrew/bin/gh pr merge 1 --admin',
    '{ gh pr merge 1 --admin; }',
    'bash -c "gh pr merge 1 --admin"',
    "bash -lc 'gh pr merge 1 --squash --admin'",
    '(gh pr merge 1 --admin)',
    'echo $(gh pr merge 1 --admin)',
    'gh pr merge 1 --admin&&echo ok',
    'gh pr merge 1 --admin|tee x',
    'gh pr merge 1 "--admin"',
    'gh pr merge 5 \\--admin',
    'g\\h pr merge 5 --admin',
    'gh pr merge 5 -\\-admin',
    'gh pr merge 5 --ad\\min',
    'gh pr merge 1 --subject "a & b" --admin',
    'gh pr merge 1 --body "x|y" --admin',
  ];
  for (const command of denies) {
    test(`refuses without asking: ${command}`, async () => {
      const { code, out } = await guard(command, solo);
      expect(code).toBe(0);
      expect(decision(out)).toBe('deny');
    });
  }

  // Never a prompt, even in Bypass permissions mode: GitHub's required-checks ruleset decides.
  const allows = [
    'gh pr merge 42 --squash',
    'gh pr merge --auto --squash',
    'gh pr merge 42 --squash --match-head-commit abc123',
    'git add -A && git commit -qm "Name it" && git push -u origin b 2>&1 | tail -2\ngh pr create --title t --body b\ngh pr merge --auto --squash',
    'gh api -X PUT repos/o/r/pulls/42/merge -f merge_method=squash',
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
    'node plugins/sidecut-solo/server/data/helper/solo.mjs --task t merge',
    'gh pr view 42',
    'git merge main',
    "grep -rn 'gh pr merge --admin' .",
    "git commit -m 'never gh pr merge --admin'",
    'gh pr create --body "Never gh pr merge --admin"',
    "bash -c 'echo gh pr merge 1 --admin'",
    'gh pr merge 42 --squash --admin-notes',
  ];
  for (const command of allows) {
    test(`stays silent for: ${command}`, async () => {
      expect(await guard(command, solo)).toEqual({ code: 0, out: '' });
    });
  }

  test('ignores the description Claude writes for the command', async () => {
    const out = await guard('gh pr view 42', solo, dir, undefined, 'gh pr merge 42 --admin');
    expect(out).toEqual({ code: 0, out: '' });
  });

  test('stays fast on a long command', async () => {
    const started = performance.now();
    const command = `cat <<'EOF'\n${'echo gh pr view --admin \n'.repeat(5000)}EOF`;
    expect(await guard(command, solo)).toEqual({ code: 0, out: '' });
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test('refuses from a nested directory of a Solo repo', async () => {
    expect(decision((await guard('gh pr merge 1 --admin', join(solo, 'nested'))).out)).toBe('deny');
  });

  test('stays silent in a repo without solo-workflow.toml', async () => {
    expect(await guard('gh pr merge 1 --admin', other)).toEqual({ code: 0, out: '' });
  });

  test('stays silent outside any Git repo', async () => {
    expect(await guard('gh pr merge 1 --admin', dir)).toEqual({ code: 0, out: '' });
  });

  test('falls back to its own directory when the input has no usable cwd', async () => {
    const raw = '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 1 --admin"}}';
    expect(decision((await guard('', '', solo, raw)).out)).toBe('deny');
    expect(await guard('', '', other, raw)).toEqual({ code: 0, out: '' });
  });

  test('stays silent on malformed input', async () => {
    expect(await guard('', '', solo, 'not json')).toEqual({ code: 0, out: '' });
  });

  test('both hosts register the same bypass guard and their own skill logging hook', async () => {
    const claude = JSON.parse(await readFile(join(PLUGIN, '.claude-plugin/plugin.json'), 'utf8'));
    const codex = JSON.parse(await readFile(join(PLUGIN, '.codex-plugin/plugin.json'), 'utf8'));
    expect(claude.hooks).toBeUndefined();
    expect(codex.hooks).toBe('./hooks/codex-hooks.json');
    expect(existsSync(join(PLUGIN, 'plugin.json'))).toBe(false);
    const hooks = JSON.parse(await readFile(join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'));
    expect(Object.keys(hooks.hooks).sort()).toEqual(['PostToolUse', 'PreToolUse']);
    const codexHooks = JSON.parse(await readFile(join(PLUGIN, 'hooks/codex-hooks.json'), 'utf8'));
    expect(codexHooks.hooks.PreToolUse).toEqual(hooks.hooks.PreToolUse);
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
  });
});
