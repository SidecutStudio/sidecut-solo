#!/usr/bin/env node
// Refuse the admin bypass in a configured project; ordinary merge gates remain in the helper.
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  const data = JSON.parse(input);
  const command = data.tool_input?.command ?? data.tool_input?.cmd ?? '';
  if (typeof command !== 'string' || !command.replace(/\\/g, '').includes('--admin'))
    process.exit(0);
  const normalized = command
    .replace(/\\\r?\n/g, ' ')
    .replace(/\r?\n/g, ';')
    .replace(/\\/g, '')
    .replace(/[\t ]+/g, ' ');
  const lead =
    '(?:[A-Za-z_][A-Za-z_0-9]*=[^ ]+|then|do|else|if|while|until|time|command|exec|nohup|sudo|env|xargs|timeout(?: +-[^ ]+)* +[0-9.]+[smhd]?)';
  const start = '(?:^|[;&|(`{!]|-[A-Za-z]*c +[\'"])(?: *' + lead + ')* *(?:[^ ;&|]*/)?';
  const repo = '(?: +(?:-R|--repo)[= ]*[^ ]+)?';
  const pattern = new RegExp(
    start + 'gh' + repo + ' +pr' + repo + ' +merge(?: [^;]*)? [\'"]?--admin(?: |=|[;&|<>)`\'"]|$)',
    'i',
  );
  if (!pattern.test(normalized)) process.exit(0);
  let cwd = process.cwd();
  try {
    if (typeof data.cwd === 'string' && statSync(data.cwd).isDirectory()) cwd = data.cwd;
  } catch {}
  const root = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1000,
  }).trim();
  if (!existsSync(join(root, 'solo-workflow.toml'))) process.exit(0);
  const reason =
    "Sidecut Solo refuses gh pr merge --admin: it asks GitHub to skip this repo's required checks and reviews. Merge without --admin once the required checks pass on the reviewed head, with the Solo helper's merge command (or gh pr merge --match-head-commit <sha> where GitHub enforces the checks). If the user wants an admin merge, they run it themselves.";
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
