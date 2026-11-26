#!/usr/bin/env node
// In a configured project, refuse the admin bypass, and refuse a merge run outside the Solo helper
// unless it names the reviewed head and `solo review` saved a clean review of it. The helper's own
// merge calls gh directly, not through the shell, so it never meets this hook.
//
// The command is split into simple commands the way a shell would, and every one is judged. Quoted
// words and heredoc bodies are read as scripts too, since `docker exec c bash -c '...'`, `ssh h
// '...'` or `cat <<EOF | sh` run them; only the text arguments of message commands (a commit
// message, a PR body, a grep pattern, echo not piped into a shell) are data. A command too deep or
// too large to read, or one that breaks the reader, is refused in a Solo repo rather than let by.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish']);
const MAX_DEPTH = 40;
const MAX_COMMANDS = 20_000;
let unreadable = false;
let produced = 0;

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
  if (depth > MAX_DEPTH) {
    unreadable = true;
    return text.length;
  }
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
  doas: ['-u', '-C'],
  xargs: ['-I', '-L', '-n', '-P', '-d', '-E', '-s', '-a'],
  nohup: [],
  nice: ['-n'],
  caffeinate: ['-t', '-w'],
  stdbuf: [],
  env: ['-u', '-C', '-S'],
  timeout: ['-s', '-k', '--signal', '--kill-after'],
};

/** The words after any assignments and wrappers such as `sudo -u x`, `timeout 60` or `env`. */
function program(words) {
  let k = 0;
  while (k < words.length) {
    const w = words[k];
    if (/^[A-Za-z_]\w*=/.test(w) || LEADS.has(w)) k++;
    else if (/^\d*(<|>|&>)/.test(w)) k += /^\d*(<|>>?|&>)$/.test(w) ? 2 : 1;
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

/** A program's name: a path's last part (`/usr/bin/gh`, `./gh`), without a git alias's `!`. */
const base = (word) => {
  const w = (word ?? '').replace(/^!(?=.)/, '');
  return w.includes('/') ? w.split('/').pop() : w;
};
const SCRIPT_FLAG = /^-[A-Za-z]*c[A-Za-z]*$/;
// What reads a script from its input: shells, and commands that hand it to one elsewhere.
const CONSUMERS = new Set([...SHELLS, 'ssh', 'docker', 'podman', 'kubectl', 'source', '.']);
const feedsShell = (words) => {
  const run = program(words);
  const name = base(run[0]);
  return CONSUMERS.has(name) && !(SHELLS.has(name) && run.some((w) => SCRIPT_FLAG.test(w)));
};
// Commands that write text to a file or stream, which a later command could run.
const WRITERS = new Set(['cat', 'tee', 'echo', 'printf']);
const plainPath = (path) => (path ?? '').replace(/^(\.\/)+/, '');
/** The script file a command runs, such as `bash m.sh`, `. ./env` or `./m.sh`; '' when none. */
const fileRun = (words) => {
  const run = program(words);
  const name = base(run[0]);
  if ((run[0] ?? '').includes('/') && !/^(gh|git)$/.test(name)) return plainPath(run[0]);
  if (name === 'source' || name === '.') return plainPath(run[1]);
  if (!SHELLS.has(name) || run.some((w) => SCRIPT_FLAG.test(w))) return '';
  const input = run.findIndex((w) => /^</.test(w));
  if (input > 0) return plainPath(run[input].slice(1) || run[input + 1] || '<');
  return plainPath(run.slice(1).find((w) => !w.startsWith('-')));
};

// Options whose value is a message, not a script: git commit/tag/merge -m and gh's text options.
const GIT_TEXT = new Set(['-m', '--message', '-F', '--file', '-S', '-G', '--grep']);
const GH_TEXT = new Set([
  '-t',
  '--title',
  '--subject',
  '-b',
  '--body',
  '-F',
  '--body-file',
  '-n',
  '--notes',
  '-m',
  '--message',
  '-f',
  '--raw-field',
  '--field',
]);
// Programs whose arguments are patterns or code in another language, never a shell script.
const PATTERNS = new Set([
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'ag',
  'sed',
  'awk',
  'gawk',
  'perl',
  'python',
  'python3',
  'node',
  'ruby',
  'jq',
  'yq',
  'deno',
  'bun',
]);
// Code in those languages that starts a shell, so its text is read as a script after all.
const SHELL_OUT =
  /\bsystem\s*\(|\bexec(Sync|File|FileSync|vp?)?\s*\(|\bspawn(Sync)?\s*\(|subprocess|popen|`|\bqx\b|\bos\.exec|\bopen\s*\(\s*["']\|/;
// sed's `e` command, alone or as an s///e flag, runs a shell.
const SED_EXEC = /(^|[;{}\s\d$])e(\s|$)|\/e\b/;
const TEST_RUNNERS = new Set(['npm', 'npx', 'pnpm', 'yarn', 'vitest', 'jest', 'bun', 'mocha']);
const TEST_NAME = new Set(['-t', '--testNamePattern', '--grep', '-g']);
const runsShell = (name, text) => SHELL_OUT.test(text) || (name === 'sed' && SED_EXEC.test(text));

/** Whether word `q` of a command is message text rather than something a shell would run. */
function isText(cmd, q, piped) {
  const run = program(cmd.words);
  const k = q - (cmd.words.length - run.length);
  if (k < 1) return false;
  const name = base(run[0]);
  if (TEST_RUNNERS.has(name)) {
    const before = run[k - 1] ?? '';
    if (TEST_NAME.has(before) || /^--(testNamePattern|grep)=/.test(run[k])) return true;
  }
  if (PATTERNS.has(name)) return !runsShell(name, run[k]);
  if (name === 'echo' || name === 'printf') return !piped;
  const flags = name === 'git' ? GIT_TEXT : name === 'gh' ? GH_TEXT : null;
  if (!flags) return false;
  if ((name === 'git' && run[1] === 'grep') || (name === 'gh' && run[1] === 'search')) return true;
  const word = run[k];
  const before = run[k - 1] ?? '';
  // git's short flags combine: -am, -sm, -qF all end in the message flag.
  if (name === 'git' && /^-[A-Za-z]*[mF]$/.test(before)) return true;
  return (
    flags.has(before) || [...flags].some((f) => f.startsWith('--') && word.startsWith(`${f}=`))
  );
}

/**
 * A heredoc is a script when a shell, or something that hands it to one, reads it; when code that
 * shells out reads it; or when it is written to a file that a later command runs.
 */
function isTextHeredoc(cmd, body, piped, fileRun) {
  const name = base(program(cmd.words)[0]);
  if (piped || feedsShell(cmd.words)) return false;
  if (PATTERNS.has(name) && runsShell(name, body)) return false;
  return !fileRun;
}

/**
 * Simple commands in `text`, each { words, scoped }, in order. `scoped` marks commands inside a
 * subshell, a substitution or a nested script, whose `cd` never moves the outer shell.
 */
function commands(text, depth = 0, scoped = false, feeding = false) {
  const out = [];
  const add = (record) => {
    if (++produced > MAX_COMMANDS) unreadable = true;
    else out.push(record);
  };
  const addAll = (records) => {
    for (const record of records) add(record);
  };
  if (depth > MAX_DEPTH) {
    unreadable = true;
    return out;
  }
  const fresh = () => ({ words: [], quoted: new Set(), heredocs: [], sep: '', subshell: false });
  const local = [];
  let cur = fresh();
  let word = '';
  let quoted = false; // the current word had quotes, so an empty one still counts
  let parens = 0;
  let pending = [];
  const endWord = () => {
    if (quoted) cur.quoted.add(cur.words.length);
    if (word || quoted) cur.words.push(word);
    word = '';
    quoted = false;
  };
  const endCommand = (sep) => {
    endWord();
    if (cur.words.length) {
      cur.sep = sep;
      cur.subshell = parens > 0;
      local.push(cur);
    }
    cur = fresh();
  };
  const substitute = (inner) => {
    addAll(commands(inner, depth + 1, true));
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
    if ((c === '<' || c === '>') && text[i + 1] === '(') {
      // Process substitution: what it prints may be read as a script, so its text counts.
      const end = closeParen(text, i, depth);
      addAll(commands(text.slice(i + 2, end), depth + 1, true, true));
      word += '/dev/fd';
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
      const m = /^<<-?[ \t]*(['"]?)([A-Za-z_][\w-]*)\1/.exec(text.slice(i, i + 200));
      if (m) {
        endWord();
        pending.push({ tag: m[2], owner: cur });
        i += m[0].length - 1;
        continue;
      }
    }
    if (c === '\n') {
      endCommand(';');
      for (const { tag, owner } of pending) {
        const rest = text.slice(i + 1);
        const found = new RegExp(`^[ \\t]*${tag}[ \\t]*$`, 'm').exec(rest);
        owner.heredocs.push(found ? rest.slice(0, found.index) : rest);
        i = found ? i + 1 + found.index + found[0].length - 1 : text.length;
      }
      pending = [];
      continue;
    }
    if (c === '&' && (text[i - 1] === '>' || text[i + 1] === '>')) {
      word += c;
      continue;
    }
    if (c === '|' || c === '&') {
      const two = text[i + 1] === c;
      endCommand(two ? c + c : c);
      if (two) i++;
      continue;
    }
    if (c === ';') {
      endCommand(';');
      continue;
    }
    if (c === '(') {
      endCommand(';');
      parens++;
      continue;
    }
    if (c === ')') {
      endCommand(';');
      if (parens) parens--;
      continue;
    }
    if (c === ' ' || c === '\t') {
      endWord();
      continue;
    }
    word += c;
  }
  endCommand(';');
  // Text written here may be run here: piped into a shell later in its pipeline, or written to a
  // file that a later command runs. Worked out backwards, once.
  // Matching the written file to the run one by name misses `bash -o pipefail m.sh`, a `cd` or a
  // copy in between, so any file run at this level counts.
  const anyRun = local.some((cmd) => fileRun(cmd.words));
  const pipedAt = new Array(local.length).fill(false);
  for (let n = local.length - 2; n >= 0; n--)
    pipedAt[n] = local[n].sep === '|' && (feedsShell(local[n + 1].words) || pipedAt[n + 1]);
  for (let n = 0; n < local.length; n++) {
    const cmd = local[n];
    // Bash runs each part of a pipeline, and a background job, in a subshell of its own.
    const own = cmd.sep === '|' || cmd.sep === '&' || local[n - 1]?.sep === '|';
    add({ words: cmd.words, scoped: scoped || cmd.subshell || own });
    const piped = pipedAt[n];
    const writer = WRITERS.has(base(program(cmd.words)[0]));
    const intoRun = feeding || (anyRun && writer);
    const written = piped || intoRun;
    for (const q of cmd.quoted) {
      if (isText(cmd, q, written)) continue;
      addAll(commands(cmd.words[q], depth + 1, true));
      // sed's `e` command runs the rest of its line.
      if (base(program(cmd.words)[0]) === 'sed')
        for (const m of cmd.words[q].matchAll(/(?:^|[;{}\s\d$])e\s+([^\n;}]*)/g))
          addAll(commands(m[1], depth + 1, true));
      // A git alias that runs a shell command: `alias.x=!gh ...`.
      const alias = /^[^=\s]+=!([\s\S]*)$/.exec(cmd.words[q]);
      if (alias) addAll(commands(alias[1], depth + 1, true));
    }
    for (const body of cmd.heredocs)
      if (!isTextHeredoc(cmd, body, piped || feeding, intoRun))
        addAll(commands(body, depth + 1, true));
    const run = program(cmd.words);
    if (base(run[0]) === 'eval') addAll(commands(run.slice(1).join(' '), depth + 1, true));
  }
  return out;
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
  if (base(w[0]) !== 'gh') return null;
  let k = skipRepo(w, 1);
  if (w[k] === 'pr') {
    k = skipRepo(w, k + 1);
    if (w[k] !== 'merge') return null;
    let admin = false;
    const heads = [];
    for (let j = k + 1; j < w.length; j++) {
      w[j] = w[j].replace(/\d*(&?>|<).*$/s, '') || w[j];
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

let data;
try {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  data = JSON.parse(input);
} catch {
  process.exit(0);
}
const command = data?.tool_input?.command ?? data?.tool_input?.cmd ?? '';
if (typeof command !== 'string' || !command.replace(/[\\'"]/g, '').includes('merge'))
  process.exit(0);
// Past this size the reader could outlast the hook's timeout, which lets the call through.
const MAX_LENGTH = 64 * 1024;

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
/** Whether `dir` is inside a repo with Solo settings. */
const soloRepo = (dir) => {
  try {
    return existsSync(join(gitOut(dir, ['rev-parse', '--show-toplevel']), 'solo-workflow.toml'));
  } catch {
    return false;
  }
};
const helper =
  'Merge with the Solo helper instead: `solo review --reviewed-head <sha> ...` for the head you reviewed, then `solo merge <pr>` (Deliver Change lists every step; `solo brief` prints them for a sub-agent).';

/** Why this merge, run in `dir`, is refused; '' when it may run. */
const judge = (merge, dir) => {
  if (!soloRepo(dir)) return '';
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
    const reviews = join(
      gitOut(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
      'solo-reviews',
    );
    record = JSON.parse(readFileSync(join(reviews, `${sha}.json`), 'utf8'));
  } catch {}
  if (!record || record.head !== sha)
    return `Sidecut Solo refuses this merge: no saved review covers ${sha}. If it is the head you reviewed, run \`solo review --reviewed-head ${sha} ...\` first; if commits came after your review, review them. ${helper}`;
  if (record.blocking_findings !== 0)
    return `Sidecut Solo refuses this merge: the saved review of ${sha} has ${record.blocking_findings} unresolved blocking findings. Fix them and review the new head.`;
  return '';
};

let reason = '';
try {
  let found = [];
  if (command.length > MAX_LENGTH) unreadable = true;
  else found = commands(command);
  for (const { words, scoped } of found) {
    const w = program(words);
    if (w[0] === 'cd') {
      // A top-level `cd` decides which repo a later merge runs in. One this can't follow
      // (`cd -`, a variable) falls back to the session's folder.
      if (scoped) continue;
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
  if (!reason && unreadable && (soloRepo(start) || soloRepo(cwd)))
    reason = `Sidecut Solo refuses this command: it is nested too deeply or too long to check for a merge. Split it into simpler commands. ${helper}`;
} catch {
  if (soloRepo(start) || soloRepo(cwd))
    reason = `Sidecut Solo refuses this command: it mentions a merge and couldn't be read to check it. Split it into simpler commands. ${helper}`;
}
if (reason)
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
