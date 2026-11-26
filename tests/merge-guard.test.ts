import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { cli } from './helpers/fixture.ts';
import { PLUGIN } from './package-rules.ts';

const HOOK = join(PLUGIN, 'hooks', 'pre-tool-use-merge-guard.mjs');

let dir = '';
let solo = '';
let other = '';
let reviewed = '';
let blocked = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'solo-guard-'));
  solo = join(dir, 'solo');
  other = join(dir, 'other');
  for (const repo of [solo, other]) {
    await mkdir(join(repo, 'nested'), { recursive: true });
    execFileSync('git', ['-C', repo, 'init', '-q']);
  }
  await writeFile(join(solo, 'solo-workflow.toml'), 'merge = "when-green"\n');
  const commit = (message: string) => {
    const identity = ['-c', 'user.name=F', '-c', 'user.email=f@example.invalid'];
    execFileSync('git', ['-C', solo, ...identity, 'commit', '-q', '--allow-empty', '-m', message]);
    return execFileSync('git', ['-C', solo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  };
  reviewed = commit('reviewed');
  blocked = commit('reviewed with a blocker');
  const review = (head: string, count: string) =>
    cli([
      ...['--repo', solo, 'review', '--reviewed-head', head, '--reviewer', 'independent'],
      ...['--review-notes', 'Read the diff', '--blocking-findings', count],
    ]);
  expect(review(reviewed, '0').code).toBe(0);
  expect(review(blocked, '2').code).toBe(0);
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

  // A merge outside the helper must name a head with a saved review: agents that merged with raw
  // gh left no review behind.
  const outside = [
    'gh pr merge 42 --squash',
    'gh pr merge --auto --squash',
    'git add -A && git commit -qm "Name it" && git push -u origin b 2>&1 | tail -2\ngh pr create --title t --body b\ngh pr merge --auto --squash',
    'gh -R o/r pr merge 42',
    'cd nested && gh pr merge 42 --squash',
    'gh pr merge 42 --squash --admin-notes',
    'gh pr merge 42 --squash --match-head-commit abc1234',
    'gh api -X PUT repos/o/r/pulls/42/merge -f merge_method=squash',
    'gh api --method=PUT repos/{owner}/{repo}/pulls/42/merge',
    "gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'",
  ];
  for (const command of outside) {
    test(`refuses a merge without a saved review: ${command}`, async () => {
      const { out } = await guard(command, solo);
      expect(decision(out)).toBe('deny');
      expect(JSON.parse(out).hookSpecificOutput.permissionDecisionReason).toContain('solo merge');
    });
  }

  test('allows gh pr merge at a head with a clean saved review, given in full', async () => {
    const short = await guard(`gh pr merge 42 --match-head-commit ${reviewed.slice(0, 12)}`, solo);
    expect(short.out).toContain('full SHA');
    for (const sha of [reviewed]) {
      for (const command of [
        `gh pr merge 42 --squash --match-head-commit ${sha}`,
        `gh pr merge 42 --auto --match-head-commit=${sha}`,
      ])
        expect(await guard(command, solo)).toEqual({ code: 0, out: '' });
    }
  });

  test('refuses a saved review that still has blocking findings', async () => {
    const { out } = await guard(`gh pr merge 42 --match-head-commit ${blocked}`, solo);
    expect(decision(out)).toBe('deny');
    expect(out).toContain('2 unresolved blocking findings');
  });

  test('an admin merge stays refused at a reviewed head', async () => {
    const { out } = await guard(`gh pr merge 42 --admin --match-head-commit ${reviewed}`, solo);
    expect(decision(out)).toBe('deny');
    expect(out).toContain('--admin');
  });

  test('a cd earlier in the command decides which repo is judged', async () => {
    const silent = { code: 0, out: '' };
    expect(await guard(`cd ${other} && gh pr merge 42 --squash`, solo)).toEqual(silent);
    expect(decision((await guard(`cd ${solo} && gh pr merge 42`, other)).out)).toBe('deny');
  });

  test('every merge in a chained command is judged, not only the first', async () => {
    const first = `gh pr merge 1 --match-head-commit ${reviewed}`;
    for (const then of [
      '; gh pr merge 2',
      ' && gh pr merge 2',
      '; gh pr merge 2 --admin',
      ' || gh api -X PUT repos/o/r/pulls/2/merge',
      `\ngh pr merge 2 --match-head-commit ${blocked}`,
    ])
      expect(decision((await guard(first + then, solo)).out)).toBe('deny');
    const both = `${first} && gh pr merge 2 --match-head-commit=${reviewed}`;
    expect(await guard(both, solo)).toEqual({ code: 0, out: '' });
  });

  test('mentions inside quotes, messages and heredocs are not commands', async () => {
    const silent = { code: 0, out: '' };
    for (const command of [
      "git commit -m 'Refuse `gh pr merge` without a review'",
      "gh pr create --body 'Deny `gh pr merge` unless reviewed'",
      'gh pr view 5 # then gh pr merge 5',
      'git commit -m "docs; gh pr merge is guarded"',
      "git commit -F - <<'EOF'\nTitle\n\ngh pr merge 42 --admin is refused\nEOF\ngit push",
      `gh pr create --body "$(cat <<'EOF'\ngh pr merge without a saved review\nEOF\n)"`,
      `gh pr merge 3 -t "title; with semicolon" --match-head-commit ${reviewed}`,
      'git commit -am "Title\n\ngh pr merge is now guarded"',
      "git log -S 'gh pr merge' --oneline",
      "sed -i '' 's/gh pr merge --admin/x/' README.md",
      `python3 -c 'print("x; gh pr merge 5")'`,
      `node -e "console.log('gh pr merge 5')"`,
      `jq '.[] | select(.body | test("gh pr merge"))' prs.json`,
      "gh api repos/o/r/issues/5/comments -f body='OK\ngh pr merge 5 after review'",
      'gh search prs "gh pr merge"',
      "git commit -F - <<'EOF'\nTitle\n\ngh pr merge is guarded\nEOF\n./scripts/after.sh",
      'npm test -- -t "gh pr merge"',
      "npx vitest run tests/merge-guard.test.ts -t 'gh pr merge 5; gh pr merge 6'",
      "patch -p1 <<'EOF'\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n gh pr merge 5\nEOF",
      `node <<'EOF'\n${'f(a); g(b);\n'.repeat(2000)}// merge\nEOF`,
    ])
      expect(await guard(command, solo)).toEqual(silent);
    // In double quotes a backtick runs its command, so the mention is a real merge.
    const runs = 'git commit -m "Refuse `gh pr merge 5` without a review"';
    expect(decision((await guard(runs, solo)).out)).toBe('deny');
    // A heredoc body is data, but the command after it still counts.
    const after = "cat <<'EOF' > notes.md\ngh pr merge 1\nEOF\ngh pr merge 2 --squash";
    expect(decision((await guard(after, solo)).out)).toBe('deny');
  });

  // Each of these ran a merge that an earlier draft of the splitter missed.
  const hidden = [
    'out="$(gh pr merge 5 --admin)"',
    "sudo bash -c 'gh pr merge 5 --admin'",
    'timeout 60 bash -c "gh pr merge 5 --admin"',
    "bash <<'EOF'\ngh pr merge 5 --admin\nEOF",
    'out="$(gh pr merge 5 --squash)"',
    'echo "`gh pr merge 5`"',
    "nohup sh -c 'gh pr merge 5' &",
    "xargs -I {} sh -c 'gh pr merge {}' < prs",
    "env FOO=1 bash -c 'gh pr merge 5'",
    'sh -s <<EOF\ngh pr merge 5\nEOF',
    'x=$(printf ")"); gh pr merge 5',
    "eval 'gh pr merge 5'",
    'nice -n 5 gh pr merge 5',
    'caffeinate -i gh pr merge 5',
    'gh api -X PUT repos/o/r/pulls/5/merge?merge_method=squash',
    'gh api -X PUT repos/o/r/pulls/5/merge/',
    'gh pr merge 5 # --match-head-commit REVIEWED',
    'gh pr merge 5 --body "--match-head-commit=REVIEWED"',
    'gh pr merge 5 --match-head-commit REVIEWED --match-head-commit ' + 'b'.repeat(40),
    'cd /tmp && cd - && gh pr merge 5',
    "gh pr mer''ge 5",
    "docker exec c bash -c 'gh pr merge 5 --admin'",
    "su -c 'gh pr merge 5 --admin' me",
    "script -qc 'gh pr merge 5 --admin' /dev/null",
    "flock /tmp/l -c 'gh pr merge 5 --admin'",
    "fish -c 'gh pr merge 5 --admin'",
    "ssh h 'cd r && gh pr merge 5 --admin'",
    "watch -n1 'x; gh pr merge 5 --admin'",
    "git rebase -x 'x; gh pr merge 5 --admin' main",
    'echo "x; gh pr merge 5 --admin" | sh',
    'cat <<EOF | bash\ngh pr merge 5 --admin\nEOF',
    'cat <<EOF | tee log | bash\ngh pr merge 5\nEOF',
    '(cd /tmp && ls) && gh pr merge 5 --admin',
    'dir=$(cd /tmp && pwd); gh pr merge 5 --admin',
    `${'"$('.repeat(41)}x${')"'.repeat(41)}; gh pr merge 5 --admin`,
    `${'$('.repeat(10)}${'eval '.repeat(10)}x${')'.repeat(10)}; gh pr merge 5 --admin`,
    `echo "$(${Array.from({ length: 30000 }, () => 'true').join('; ')})"; gh pr merge 5`,
    "cat > /tmp/m.sh <<'EOF'\ngh pr merge 5 --admin\nEOF\nbash /tmp/m.sh",
    'echo "x; gh pr merge 5 --admin" > /tmp/m.sh && sh /tmp/m.sh',
    'cat <<EOF | ssh h\ngh pr merge 5 --admin\nEOF',
    'echo "x; gh pr merge 5 --admin" | docker exec -i c sh',
    'bash <(echo "x; gh pr merge 5 --admin")',
    'source <(echo "x; gh pr merge 5")',
    "git -c alias.x='!gh pr merge 5 --admin' x",
    'cd /tmp | true; gh pr merge 5 --admin',
    'cd /tmp & gh pr merge 5 --admin',
    `${'a | '.repeat(15000)}gh pr merge 5 --admin`,
    Array.from({ length: 30000 }, () => '"a(b);c"').join(' ') + ' merge',
    `perl -e 'system("x; gh pr merge 5 --admin")'`,
    `awk 'BEGIN{system("x; gh pr merge 5 --admin")}'`,
    `python3 -c 'import os; os.system("gh pr merge 5 --admin")'`,
    `node -e "require('child_process').execSync('gh pr merge 5 --admin')"`,
    "sed -n '1e gh pr merge 5 --admin' f",
    `python3 - <<'EOF'\nimport os\nos.system("gh pr merge 5 --admin")\nEOF`,
    '$HOME/bin/gh pr merge 5 --admin',
    "cat > m.sh <<'EOF'\ngh pr merge 5 --admin\nEOF\nbash -euo pipefail m.sh",
    "cat > /tmp/m.sh <<'EOF'\ngh pr merge 5\nEOF\ncd /tmp && ./m.sh",
    "cat > /tmp/m <<'EOF'\ngh pr merge 5\nEOF\nsh < /tmp/m",
    'gh pr merge 5 --match-head-commit REVIEWED --admin>/dev/null',
    '>/dev/null gh pr merge 5 --admin',
    'echo "x; gh pr merge 5 --admin" 2>&1 | sh',
    "printf 'gh pr merge 5\\n' > m.sh; sh ./m.sh",
    'bin/gh pr merge 5 --admin',
  ];
  for (const command of hidden) {
    test(`sees the merge in: ${command.replace(/\n/g, ' / ')}`, async () => {
      const { out } = await guard(command.replaceAll('REVIEWED', reviewed), solo);
      expect(decision(out)).toBe('deny');
    });
  }

  test('stays fast on commands built to make a regex backtrack', async () => {
    const started = performance.now();
    const params = Array.from({ length: 30 }, (_, i) => `p${i}=v${i}`).join('&');
    for (const command of [
      `URL='https://x.com/a?${params}' && git merge-base a b`,
      `X=${'abc='.repeat(40)} git merge main`,
      `a=${'a=a'.repeat(5000)} merge`,
    ])
      expect(await guard(command, solo)).toEqual({ code: 0, out: '' });
    expect(performance.now() - started).toBeLessThan(3000);
  });

  // Never a prompt, even in Bypass permissions mode.
  const allows = [
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
    'gh api repos/o/r/pulls/42/merge',
    'node plugins/sidecut-solo/server/data/helper/solo.mjs --task t merge',
    'gh pr view 42',
    'git merge main',
    "grep -rn 'gh pr merge --admin' .",
    "git commit -m 'never gh pr merge --admin'",
    'gh pr create --body "Never gh pr merge --admin"',
    "bash -c 'echo gh pr merge 1 --admin'",
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

  test('both hosts register the same bypass guard, turn guard and their own skill logging hook', async () => {
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
      {
        type: 'command',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the host fills this in, not JavaScript.
        command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool-use-automerge-handoff.mjs"',
        timeout: 5,
      },
    ]);
  });
});
