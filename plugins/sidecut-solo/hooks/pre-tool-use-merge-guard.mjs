#!/usr/bin/env node
// In a configured project, refuse the admin bypass, and refuse a merge run outside the Solo helper
// unless it names the reviewed head and `solo review` saved a clean review of it. The helper's own
// merge calls gh directly, not through the shell, so it never meets this hook.
//
// The command is split into simple commands the way a shell would (quotes, escapes, heredocs,
// `bash -c` and `$(...)`), in one linear pass, and every one of them is judged. Text inside quotes,
// heredoc bodies and commit messages is never read as a command.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Simple commands in `text`, each a list of words, in order. `$(...)` and `bash -c` nest. */
function commands(text, depth = 0) {
  const out = [];
  let words = [];
  let word = '';
  let quoted = false; // the current word had quotes, so an empty one still counts
  let heredocs = [];
  const endWord = () => {
    if (word || quoted) words.push(word);
    word = '';
    quoted = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) out.push(words);
    words = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      if (text[i + 1] === '\n') i++;
      else if (i + 1 < text.length) word += text[++i];
      continue;
    }
    if (c === "'") {
      const close = text.indexOf("'", i + 1);
      word += text.slice(i + 1, close < 0 ? text.length : close);
      quoted = true;
      i = close < 0 ? text.length : close;
      continue;
    }
    if (c === '"') {
      quoted = true;
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\' && i + 1 < text.length) word += text[++i];
        else word += text[i];
      }
      continue;
    }
    if (c === '$' && text[i + 1] === '(' && depth < 4) {
      // Unquoted command substitution: judge what runs inside it.
      let level = 0;
      let j = i + 1;
      for (; j < text.length; j++) {
        if (text[j] === '(') level++;
        else if (text[j] === ')' && --level === 0) break;
      }
      out.push(...commands(text.slice(i + 2, j), depth + 1));
      word += '$()';
      i = j;
      continue;
    }
    if (c === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      // Heredoc: remember its delimiter; the body after the line end is data.
      const m = /^<<-?[ \t]*(['"]?)([A-Za-z_][\w-]*)\1/.exec(text.slice(i));
      if (m) {
        heredocs.push(m[2]);
        i += m[0].length - 1;
        continue;
      }
    }
    if (c === '\n') {
      endCommand();
      for (const tag of heredocs) {
        const end = new RegExp(`^[ \\t]*${tag}[ \\t]*$`, 'm');
        const rest = text.slice(i + 1);
        const found = end.exec(rest);
        i = found ? i + 1 + found.index + found[0].length - 1 : text.length;
      }
      heredocs = [];
      continue;
    }
    if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')' || c === '`') {
      endCommand();
      continue;
    }
    if (c === ' ' || c === '\t') {
      endWord();
      continue;
    }
    word += c;
  }
  endCommand();
  // `bash -c '...'`: judge the script it runs.
  const nested = [];
  for (const cmd of out) {
    const name = cmd[0]?.split('/').pop();
    const flag = cmd.findIndex((w, k) => k > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(w));
    if (
      ['bash', 'sh', 'zsh', 'dash'].includes(name) &&
      flag > 0 &&
      cmd[flag + 1] !== undefined &&
      depth < 4
    )
      nested.push(...commands(cmd[flag + 1], depth + 1));
  }
  return [...out, ...nested];
}

const LEADS = new Set([
  'then',
  'do',
  'else',
  'if',
  'while',
  'until',
  'time',
  'command',
  'exec',
  'nohup',
  'sudo',
  'xargs',
  '{',
  '}',
  '!',
]);

/** The words after any assignments and wrappers such as `timeout 60` or `env`. */
function program(words) {
  let k = 0;
  while (k < words.length) {
    const w = words[k];
    if (/^[A-Za-z_]\w*=/.test(w) || LEADS.has(w)) k++;
    else if (w === 'env') for (k++; k < words.length && words[k].startsWith('-'); k++);
    else if (w === 'timeout') {
      for (k++; k < words.length && words[k].startsWith('-'); k++);
      k++;
    } else break;
  }
  return words.slice(k);
}

/** gh's repo flag, which may stand before or after the subcommand. */
function skipRepo(words, k) {
  while (words[k] === '-R' || words[k] === '--repo' || /^(-R|--repo=)./.test(words[k] ?? ''))
    k += words[k] === '-R' || words[k] === '--repo' ? 2 : 1;
  return k;
}

/** What kind of merge a command is, if any: { kind: 'pr', args } or { kind: 'api' }. */
function mergeOf(words) {
  const w = program(words);
  if (w[0]?.split('/').pop() !== 'gh') return null;
  let k = skipRepo(w, 1);
  if (w[k] === 'pr') {
    k = skipRepo(w, k + 1);
    if (w[k] === 'merge') return { kind: 'pr', args: w.slice(k + 1) };
    return null;
  }
  if (w[k] !== 'api') return null;
  const rest = w.slice(k + 1);
  if (rest.some((a) => /mergePullRequest/.test(a)) && rest.includes('graphql'))
    return { kind: 'api' };
  const put = rest.some(
    (a, j) =>
      /^(-X|--method)=?PUT$/i.test(a) ||
      /^-XPUT$/i.test(a) ||
      ((a === '-X' || a === '--method') && /^PUT$/i.test(rest[j + 1] ?? '')),
  );
  if (put && rest.some((a) => /(^|\/)pulls\/[0-9]+\/merge$/.test(a))) return { kind: 'api' };
  return null;
}

let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  const data = JSON.parse(input);
  const command = data.tool_input?.command ?? data.tool_input?.cmd ?? '';
  if (typeof command !== 'string' || !command.replace(/\\/g, '').includes('merge')) process.exit(0);

  let cwd = process.cwd();
  try {
    if (typeof data.cwd === 'string' && statSync(data.cwd).isDirectory()) cwd = data.cwd;
  } catch {}
  const gitOut = (dir, gitArgs) =>
    execFileSync('git', ['-C', dir, ...gitArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim();
  const helper =
    'Merge with the Solo helper instead: `solo review --reviewed-head <sha> ...` for the head you reviewed, then `solo merge <pr>` (Deliver Change lists every step; `solo brief` prints them for a sub-agent).';

  /** Why this merge, run in `dir`, is refused; '' when it may run. */
  const judge = (merge, dir) => {
    let root;
    try {
      root = gitOut(dir, ['rev-parse', '--show-toplevel']);
    } catch {
      return '';
    }
    if (!existsSync(join(root, 'solo-workflow.toml'))) return '';
    if (merge.kind === 'api')
      return `Sidecut Solo refuses a merge through \`gh api\` here: it skips the reviewed-head, check and permission gates. ${helper}`;
    const args = merge.args;
    if (args.some((a) => a === '--admin' || a.startsWith('--admin=')))
      return `Sidecut Solo refuses gh pr merge --admin: it asks GitHub to skip this repo's required checks and reviews. ${helper} If the user wants an admin merge, they run it themselves.`;
    const at = args.findIndex(
      (a) => a === '--match-head-commit' || a.startsWith('--match-head-commit='),
    );
    const sha = (
      at < 0 ? '' : args[at].includes('=') ? args[at].split('=')[1] : (args[at + 1] ?? '')
    ).toLowerCase();
    if (!sha)
      return `Sidecut Solo refuses gh pr merge without --match-head-commit <reviewed sha> here: the PR could merge a head nobody reviewed. ${helper}`;
    if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(sha))
      return `Sidecut Solo refuses this merge: give --match-head-commit the full SHA of the head you reviewed, not ${sha}. ${helper}`;
    let record = null;
    try {
      const dir2 = join(
        gitOut(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
        'solo-reviews',
      );
      record = JSON.parse(readFileSync(join(dir2, `${sha}.json`), 'utf8'));
    } catch {}
    if (!record || record.head !== sha)
      return `Sidecut Solo refuses this merge: no saved review covers ${sha}. If it is the head you reviewed, run \`solo review --reviewed-head ${sha} ...\` first; if commits came after your review, review them. ${helper}`;
    if (record.blocking_findings !== 0)
      return `Sidecut Solo refuses this merge: the saved review of ${sha} has ${record.blocking_findings} unresolved blocking findings. Fix them and review the new head.`;
    return '';
  };

  let reason = '';
  for (const words of commands(command)) {
    const w = program(words);
    if (w[0] === 'cd' && w[1]) {
      // A `cd` earlier in the same command decides which repo a later merge runs in.
      const target = resolve(cwd, w[1].replace(/^~(?=\/|$)/, homedir()));
      try {
        if (statSync(target).isDirectory()) cwd = target;
      } catch {}
      continue;
    }
    const merge = mergeOf(words);
    if (!merge) continue;
    reason = judge(merge, cwd);
    if (reason) break;
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
