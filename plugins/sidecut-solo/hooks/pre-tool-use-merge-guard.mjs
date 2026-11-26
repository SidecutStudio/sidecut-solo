#!/usr/bin/env node
// In a configured project, refuse the admin bypass, and refuse a merge run outside the Solo helper
// unless it names the reviewed head and `solo review` saved a review of it. The helper's own merge
// calls gh directly, not through the shell, so it never meets this hook.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  const data = JSON.parse(input);
  const command = data.tool_input?.command ?? data.tool_input?.cmd ?? '';
  if (typeof command !== 'string' || !command.replace(/\\/g, '').includes('merge')) process.exit(0);
  const normalized = command
    .replace(/\\\r?\n/g, ' ')
    .replace(/\r?\n/g, ';')
    .replace(/\\/g, '')
    .replace(/[\t ]+/g, ' ');
  const lead =
    '(?:[A-Za-z_][A-Za-z_0-9]*=[^ ]+|then|do|else|if|while|until|time|command|exec|nohup|sudo|env|xargs|timeout(?: +-[^ ]+)* +[0-9.]+[smhd]?)';
  const start = '(?:^|[;&|(`{!]|-[A-Za-z]*c +[\'"])(?: *' + lead + ')* *(?:[^ ;&|]*/)?';
  const repo = '(?: +(?:-R|--repo)[= ]*[^ ]+)?';
  const prMerge = new RegExp(`${start}gh${repo} +pr${repo} +merge(?=[ ;&|)\`'"]|$)([^;]*)`, 'i');
  const apiMerge = new RegExp(
    `${start}gh +api(?= )([^;&|]*\\bpulls/[0-9]+/merge\\b[^;&|]*)|${start}gh +api +graphql([^;&|]*mergePullRequest)`,
    'i',
  );
  const found = prMerge.exec(normalized);
  const api = found ? null : apiMerge.exec(normalized);
  if (!found && !api) process.exit(0);
  // A REST read of /merge (is it merged?) is not a merge; only PUT is.
  if (api?.[1] !== undefined && !/(?:^| )(?:-X|--method)[= ]?['"]?PUT\b/i.test(api[1]))
    process.exit(0);
  const args = found?.[1] ?? '';
  const admin = /(?:^| )['"]?--admin(?: |=|[&|<>)`'"]|$)/i.test(args);

  // The repo the merge runs in: a `cd` earlier in the same command, else the session's folder.
  let cwd = process.cwd();
  try {
    if (typeof data.cwd === 'string' && statSync(data.cwd).isDirectory()) cwd = data.cwd;
  } catch {}
  const before = normalized.slice(0, (found ?? api).index);
  const cds = [...before.matchAll(/(?:^|[;&|(]) *cd +(['"]?)([^ ;&|'"]+)\1/g)];
  const cd = cds.at(-1)?.[2];
  if (cd) {
    const target = resolve(cwd, cd.replace(/^~(?=\/|$)/, homedir()));
    try {
      if (statSync(target).isDirectory()) cwd = target;
    } catch {}
  }
  const gitOut = (gitArgs) =>
    execFileSync('git', ['-C', cwd, ...gitArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim();
  const root = gitOut(['rev-parse', '--show-toplevel']);
  if (!existsSync(join(root, 'solo-workflow.toml'))) process.exit(0);

  const helper =
    'Merge with the Solo helper instead: `solo review --reviewed-head <sha> ...` for the head you reviewed, then `solo merge <pr>` (Deliver Change lists every step; `solo brief` prints them for a sub-agent).';
  let reason = '';
  if (admin) {
    reason = `Sidecut Solo refuses gh pr merge --admin: it asks GitHub to skip this repo's required checks and reviews. ${helper} If the user wants an admin merge, they run it themselves.`;
  } else if (api) {
    reason = `Sidecut Solo refuses a merge through \`gh api\` here: it skips the reviewed-head, check and permission gates. ${helper}`;
  } else {
    const sha = /(?:^| )--match-head-commit[= ]['"]?([0-9a-f]{7,64})\b/i.exec(args)?.[1];
    if (!sha) {
      reason = `Sidecut Solo refuses gh pr merge without --match-head-commit <reviewed sha> here: the PR could merge a head nobody reviewed. ${helper}`;
    } else {
      const dir = join(
        gitOut(['rev-parse', '--path-format=absolute', '--git-common-dir']),
        'solo-reviews',
      );
      const name = existsSync(dir)
        ? readdirSync(dir).find(
            (file) => file.startsWith(sha.toLowerCase()) && file.endsWith('.json'),
          )
        : undefined;
      let record = null;
      try {
        if (name) record = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      } catch {}
      if (!record)
        reason = `Sidecut Solo refuses this merge: no saved review covers ${sha}. If ${sha} is the head you reviewed, run \`solo review --reviewed-head <full sha> ...\` first; if commits came after your review, review them. ${helper}`;
      else if (record.blocking_findings !== 0)
        reason = `Sidecut Solo refuses this merge: the saved review of ${sha} has ${record.blocking_findings} unresolved blocking findings. Fix them and review the new head.`;
    }
  }
  if (!reason) process.exit(0);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n',
  );
} catch {}
