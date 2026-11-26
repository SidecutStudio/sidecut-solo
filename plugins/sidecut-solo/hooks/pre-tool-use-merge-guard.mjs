#!/usr/bin/env node
// In a configured project, refuse the admin bypass, and refuse a merge run outside the Solo helper
// unless it names the reviewed head and `solo review` saved a clean review of it. The helper's own
// merge calls gh directly, not through the shell, so it never meets this hook.
//
// The command is split into simple commands the way a shell would, and every one of them is judged,
// including what `$(...)`, backticks, `bash -c`, `eval` and a heredoc fed to a shell would run.
// Single-quoted text, comments and other heredoc bodies, such as a commit message, are data.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const MAX_DEPTH = 40;

/** Where the `"` opened at `j` closes, skipping escapes and `$(...)` inside it. */
function closeQuote(text, j, depth) {
  for (let k = j + 1; k < text.length; k++) {
    if (text[k] === '\\') k++;
    else if (text[k] === '"') return k;
    else if (text[k] === '$' && text[k + 1] === '(') k = closeParen(text, k, depth + 1);
  }
  return text.length;
}

/** Where the `$(` opened at `i` closes, skipping quotes and escapes inside it. */
function closeParen(text, i, depth = 0) {
  if (depth > MAX_DEPTH) return text.length;
  let level = 0;
  for (let j = i + 1; j < text.length; j++) {
    const c = text[j];
    if (c === '\\') j++;
    else if (c === "'") {
      const k = text.indexOf("'", j + 1);
      j = k < 0 ? text.length : k;
    } else if (c === '"') j = closeQuote(text, j, depth);
    else if (c === '(') level++;
    else if (c === ')' && --level === 0) return j;
  }
  return text.length;
}

/** Where the backtick opened at `i` closes. */
function closeTick(text, i) {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === '`') return j;
  }
  return text.length;
}

/**
 * Simple commands in `text`, each a list of words, in order, the way a shell would split them.
 * What a shell would run is included: `$(...)` and backticks (quoted or not), `bash -c`, `eval`
 * and heredocs fed to a shell. Single-quoted text, comments and other heredoc bodies are data.
 */
function commands(text, depth = 0) {
  if (depth > MAX_DEPTH) return [];
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
  const substitute = (inner) => {
    out.push(...commands(inner, depth + 1));
    word += '$()';
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
      const close = closeQuote(text, i, depth);
      for (let k = i + 1; k < close; k++) {
        if (text[k] === '\\' && k + 1 < close) word += text[++k];
        else if (text[k] === '$' && text[k + 1] === '(') {
          const end = closeParen(text, k, depth);
          substitute(text.slice(k + 2, end));
          k = end;
        } else if (text[k] === '`') {
          const end = Math.min(closeTick(text, k), close);
          substitute(text.slice(k + 1, end));
          k = end;
        } else word += text[k];
      }
      i = close;
      continue;
    }
    if (c === '$' && text[i + 1] === '(') {
      const end = closeParen(text, i, depth);
      substitute(text.slice(i + 2, end));
      i = end;
      continue;
    }
    if (c === '`') {
      const end = closeTick(text, i);
      substitute(text.slice(i + 1, end));
      i = end;
      continue;
    }
    if (c === '#' && !word && !quoted) {
      const nl = text.indexOf('\n', i);
      i = (nl < 0 ? text.length : nl) - 1;
      continue;
    }
    if (c === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      // Heredoc: its body starts after this line and is data unless a shell reads it.
      const m = /^<<-?[ \t]*(['"]?)([A-Za-z_][\w-]*)\1/.exec(text.slice(i, i + 200));
      if (m) {
        endWord();
        heredocs.push({ tag: m[2], owner: words });
        i += m[0].length - 1;
        continue;
      }
    }
    if (c === '\n') {
      endCommand();
      for (const { tag, owner } of heredocs) {
        const rest = text.slice(i + 1);
        const found = new RegExp(`^[ \\t]*${tag}[ \\t]*$`, 'm').exec(rest);
        const body = found ? rest.slice(0, found.index) : rest;
        const run = program(owner);
        if (
          SHELLS.has(run[0]?.split('/').pop()) &&
          !run.some((w) => /^-[A-Za-z]*c[A-Za-z]*$/.test(w))
        )
          out.push(...commands(body, depth + 1));
        i = found ? i + 1 + found.index + found[0].length - 1 : text.length;
      }
      heredocs = [];
      continue;
    }
    if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')') {
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
  // What `bash -c '...'` and `eval ...` run, behind any wrapper such as sudo or timeout.
  const nested = [];
  for (const cmd of out) {
    const run = program(cmd);
    const name = run[0]?.split('/').pop();
    if (name === 'eval') nested.push(...commands(run.slice(1).join(' '), depth + 1));
    if (!SHELLS.has(name)) continue;
    const flag = run.findIndex((w, k) => k > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(w));
    if (flag > 0 && run[flag + 1] !== undefined) nested.push(...commands(run[flag + 1], depth + 1));
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
  '{',
  '}',
  '!',
]);
// Wrappers that run the rest of the line, and their options that take a value.
const WRAPPERS = {
  sudo: ['-u', '-g', '-C', '-D', '-h', '-p', '-U', '-r', '-t'],
  xargs: ['-I', '-L', '-n', '-P', '-d', '-E', '-s', '-a'],
  nohup: [],
  nice: ['-n'],
  caffeinate: ['-t', '-w'],
  stdbuf: [],
  doas: ['-u', '-C'],
  env: ['-u', '-C', '-S'],
  timeout: ['-s', '-k', '--signal', '--kill-after'],
};

/** The words after any assignments and wrappers such as `sudo -u x`, `timeout 60` or `env`. */
function program(words) {
  let k = 0;
  while (k < words.length) {
    const w = words[k];
    if (/^[A-Za-z_]\w*=/.test(w) || LEADS.has(w)) k++;
    else if (WRAPPERS[w]) {
      const takes = WRAPPERS[w];
      for (
        k++;
        k < words.length && (words[k].startsWith('-') || /^[A-Za-z_]\w*=/.test(words[k]));
        k++
      )
        if (takes.includes(words[k])) k++;
      if (w === 'timeout') k++; // its duration
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

// gh pr merge options that take a value, so the value is never read as an option.
const PR_MERGE_VALUES = new Set([
  '-t',
  '--subject',
  '-b',
  '--body',
  '-F',
  '--body-file',
  '-A',
  '--author-email',
  '--match-head-commit',
  '-R',
  '--repo',
]);

/** What kind of merge a command is, if any: { kind: 'pr', admin, heads } or { kind: 'api' }. */
function mergeOf(words) {
  const w = program(words);
  if (w[0]?.split('/').pop() !== 'gh') return null;
  let k = skipRepo(w, 1);
  if (w[k] === 'pr') {
    k = skipRepo(w, k + 1);
    if (w[k] !== 'merge') return null;
    let admin = false;
    const heads = [];
    for (let j = k + 1; j < w.length; j++) {
      const [flag, inline] = w[j].startsWith('--') ? w[j].split(/=(.*)/s, 2) : [w[j], undefined];
      if (flag === '--admin') admin = true;
      if (flag === '--match-head-commit') heads.push((inline ?? w[j + 1] ?? '').toLowerCase());
      if (PR_MERGE_VALUES.has(flag) && inline === undefined) j++;
    }
    return { kind: 'pr', admin, heads };
  }
  if (w[k] !== 'api') return null;
  const rest = w.slice(k + 1);
  if (rest.some((a) => /mergePullRequest/.test(a)) && rest.includes('graphql'))
    return { kind: 'api' };
  const put = rest.some(
    (a, j) =>
      /^(-X|--method)=?PUT$/i.test(a) ||
      ((a === '-X' || a === '--method') && /^PUT$/i.test(rest[j + 1] ?? '')),
  );
  if (put && rest.some((a) => /(^|\/)pulls\/[0-9]+\/merge\/?(\?.*)?$/.test(a)))
    return { kind: 'api' };
  return null;
}

let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  const data = JSON.parse(input);
  const command = data.tool_input?.command ?? data.tool_input?.cmd ?? '';
  if (typeof command !== 'string' || !command.replace(/[\\'"]/g, '').includes('merge'))
    process.exit(0);

  let cwd = process.cwd();
  try {
    if (typeof data.cwd === 'string' && statSync(data.cwd).isDirectory()) cwd = data.cwd;
  } catch {}
  const start = cwd;
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
    if (merge.admin)
      return `Sidecut Solo refuses gh pr merge --admin: it asks GitHub to skip this repo's required checks and reviews. ${helper} If the user wants an admin merge, they run it themselves.`;
    if (new Set(merge.heads).size > 1)
      return `Sidecut Solo refuses this merge: it names more than one --match-head-commit. Give only the head you reviewed. ${helper}`;
    const sha = merge.heads[0] ?? '';
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
    if (w[0] === 'cd') {
      // A `cd` earlier in the same command decides which repo a later merge runs in. One this
      // can't follow (`cd -`, a variable) falls back to the session's folder.
      const to = w[1] ?? '~';
      if (to.startsWith('-') || to.includes('$')) cwd = start;
      else {
        const target = resolve(cwd, to.replace(/^~(?=\/|$)/, homedir()));
        try {
          if (statSync(target).isDirectory()) cwd = target;
        } catch {}
      }
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
