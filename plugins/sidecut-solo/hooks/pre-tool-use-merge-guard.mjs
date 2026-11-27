#!/usr/bin/env node
// In a repo with Solo settings, the Solo helper is the only way to merge a PR or hand one to
// automerge: `solo merge` and `solo automerge` check the saved review, the required checks and the
// user's permission first, and call gh directly rather than through the shell, so they never meet
// this hook. A shell command that names a gh merge is refused and sent to them.
//
// This is a word check, not a shell reader: any command whose text has `gh` and a merge (`pr merge`,
// a GraphQL merge or auto-merge mutation, a REST merge path) is refused, wherever it sits. A commit
// message or PR body that mentions one is refused too; put that text in a file. A label that a merge
// workflow acts on is left to the turn guard, which reads it from GitHub. Claude Code and Codex send
// the command as tool_input; Antigravity as toolCall.args.
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MERGE =
  /\bpr\s+(?:-R\s+\S+\s+|--repo[= ]\S+\s+)?merge\b|mergePullRequest|enablePullRequestAutoMerge|\/pulls\/\d+\/merge\b/;
const GH = /(?:^|[\s;&|(`'"/])gh\b/;

/** Why `command` is refused here, or ''. Exported for tests. */
export function refusal(command) {
  if (!GH.test(command)) return '';
  // Turning auto-merge off hands nothing over; it is how a session stops a merge.
  const parts = command.split(/[\n;&|]+/).filter((part) => MERGE.test(part));
  if (!parts.length || parts.every((part) => /--disable-auto\b/.test(part))) return '';
  return 'Sidecut Solo refuses a gh merge in this repo: merge with `solo merge <pr>`, or hand the PR to automerge with `solo automerge <pr>` (`--label <name>` where a label does the merge). Both check the saved review of the PR head, its required checks and your permission first; Deliver Change lists every step. If the command only mentions a merge in text, such as a commit message or PR body, put that text in a file and pass the file instead.';
}

function soloRepo(dir) {
  try {
    const top = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim();
    return existsSync(join(top, 'solo-workflow.toml'));
  } catch {
    return false;
  }
}

const isDir = (path) => {
  try {
    return typeof path === 'string' && statSync(path).isDirectory();
  } catch {
    return false;
  }
};

if (import.meta.main ?? process.argv[1]?.endsWith('pre-tool-use-merge-guard.mjs')) {
  let data;
  try {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }
  const antigravity = Boolean(data?.toolCall);
  const raw = antigravity
    ? data.toolCall.args?.CommandLine
    : (data?.tool_input?.command ?? data?.tool_input?.cmd);
  const command = [raw ?? ''].flat().join(' ');
  const reason = typeof command === 'string' ? refusal(command) : '';
  const cwd = [antigravity ? data.toolCall.args?.Cwd : data?.cwd, ...(data?.workspacePaths ?? [])]
    .concat(process.cwd())
    .find(isDir);
  if (reason && soloRepo(cwd))
    process.stdout.write(
      `${JSON.stringify(
        antigravity
          ? { decision: 'deny', reason }
          : {
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: reason,
              },
            },
      )}\n`,
    );
  process.exit(0);
}
