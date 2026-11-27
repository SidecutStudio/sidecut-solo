// The turn guard keeps a session from going quiet with Solo work still owed. The four
// <event>-*.mjs scripts beside this folder call into it, one per hook event:
//
// - PreToolUse (shell): a command that hands a PR to automerge (a label a merge workflow acts on, or
//   GitHub's auto-merge) is recorded under the Git common directory at solo-handoffs/<key>.json.
// - Stop: while this session owns a handoff and no `solo wait-merge` is waiting on it, ending the
//   turn is refused. CI watchers only speak up when something fails, so a clean merge would
//   otherwise wake nobody and the steps after it would sit undone. wait-merge removes the record
//   once the PR merges, closes or is no longer handed off.
// - UserPromptSubmit: the Solo skills a prompt names are noted for the session.
// - PostToolUse: the Solo skills the session loads are noted, and at Stop each named skill that never
//   loaded is raised once.
//
// Session notes live in ~/.sidecut/solo/sessions/. Nothing here reads the network. Any error lets
// the session carry on.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLUGIN = 'sidecut-solo';
const SKILLS = join(PLUGIN_DIR, 'skills');
/** Labels a merge workflow merges on, such as `automerge` or `auto-merge`. */
const MERGE_LABEL = /auto[-_ ]?merge/i;
/** How many times in a row Stop refuses for one handoff before the user's stop stands. */
const MAX_BLOCKS = 2;

const safe = (value) => String(value ?? '').replace(/[^\w.-]/g, '_');

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1500,
  }).trim();
}

/** Where `dir`'s repo keeps handoff records, when it carries Solo settings. */
function handoffDir(dir) {
  try {
    const root = git(dir, ['rev-parse', '--show-toplevel']);
    if (!existsSync(join(root, 'solo-workflow.toml'))) return undefined;
    return join(
      git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
      'solo-handoffs',
    );
  } catch {
    return undefined;
  }
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

const sessionFile = (id) => join(homedir(), '.sidecut', 'solo', 'sessions', `${safe(id)}.json`);

function cwdOf(input) {
  try {
    if (typeof input.cwd === 'string' && statSync(input.cwd).isDirectory()) return input.cwd;
  } catch {}
  return process.cwd();
}

/** Reads the hook input, runs `handle` and prints what it returns. Never fails the session. */
export async function runHook(handle) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    const out = handle(JSON.parse(raw));
    if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
  } catch {}
  process.exit(0);
}

// ---- Handoffs -----------------------------------------------------------------------------------

const VALUE_FLAGS =
  /^(--add-label|--remove-label|--label|-l|-R|--repo|--match-head-commit|--subject|--body|-t|-b|--body-file|-F|--author-email|--title|--base|-B)$/;

/**
 * The PR a shell command hands to automerge, if it does: `{ ref, repoFlag }`, with ref '' for the
 * current branch's PR. wait-merge checks each record against GitHub, so this only needs to be
 * generous.
 */
export function handoffOf(command) {
  const text = command.replace(/\\\r?\n/g, ' ');
  // Each simple command must itself start with gh, so a commit message or PR body that mentions
  // `gh pr merge --auto` is not read as one.
  // Wrappers that run gh as their command: assignments, `time`, `timeout 60`, `env`, `sudo`,
  // `then`/`do`, a subshell or group, and `bash -lc '...'` (how Codex hands over a command array).
  // Word wrappers need a space after them, so a run like `a=a=a` can only be read one way.
  const word = String.raw`(?:[A-Za-z_]\w*=[^\s=]*|time|command|exec|nohup|sudo|then|do|else|env(?:\s+-\S+)*|timeout(?:\s+-[ks]\s+\S+|\s+-\S+)*\s+\S+|(?:\S*\/)?(?:ba|z|da|k)?sh\s+-\w*c)\s+['"]?`;
  const lead = String.raw`^\s*(?:${word}|[({!]\s*)*(?:\S*\/)?gh\s+`;
  const repo = String.raw`(?:(?:-R|--repo)[= ]\s*\S+\s+)?`;
  const prCommand = new RegExp(`${lead}${repo}(pr|issue)\\s+${repo}(merge|edit|create)\\b(.*)`);
  for (const line of text.split(/[;&|\n]+/)) {
    const repoFlag = /(?:^|\s)(?:-R|--repo)[= ]\s*([^\s'"]+)/.exec(line)?.[1];
    const pr = prCommand.exec(line);
    if (pr) {
      const [, kind, verb, rest = ''] = pr;
      const added = [...rest.matchAll(/(?:--add-label|--label|-l)[= ]\s*("[^"]*"|'[^']*'|\S+)/g)]
        .map((m) => m[1])
        .join(',');
      const handsOff =
        kind === 'pr' && verb === 'merge'
          ? /(?:^|\s)--auto(?:[\s=)'"]|$)/.test(rest)
          : verb !== 'merge' && MERGE_LABEL.test(added);
      if (!handsOff) continue;
      // `gh pr create` makes the PR from this branch, so its record is the branch's.
      if (verb === 'create') return { ref: '', repoFlag };
      // The first word that isn't a flag or a flag's value is the PR; none means this branch's PR.
      const words = rest.trim().split(/\s+/).filter(Boolean);
      let ref = '';
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word.startsWith('-')) {
          if (!word.includes('=') && VALUE_FLAGS.test(word)) i++;
          continue;
        }
        ref = word.replace(/^['"]|['"]$/g, '');
        break;
      }
      // A variable or substitution can't be read here; the branch's own PR is the best guess.
      if (/[$`(){}]/.test(ref)) ref = '';
      return { ref, repoFlag };
    }
    if (new RegExp(`${lead}${repo}api\\b`).test(line)) {
      // The mutation names the PR by node id, so the record falls back to this branch's PR.
      if (/enablePullRequestAutoMerge/.test(line)) return { ref: '', repoFlag };
      const labels = /\/(?:issues|pulls)\/([1-9][0-9]*)\/labels\b/.exec(line);
      if (labels && MERGE_LABEL.test(line)) return { ref: labels[1], repoFlag };
    }
  }
  return undefined;
}

/** PreToolUse: record a handoff to automerge. */
export function recordHandoff(input) {
  const command = [input.tool_input?.command ?? input.tool_input?.cmd ?? ''].flat().join(' ');
  const handoff = typeof command === 'string' ? handoffOf(command) : undefined;
  if (!handoff) return;
  const dir = cwdOf(input);
  const handoffs = handoffDir(dir);
  if (!handoffs) return;
  let ref = handoff.ref;
  if (!ref) {
    try {
      ref = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    } catch {}
  }
  if (!ref || ref === 'HEAD') return;
  const number = /^[1-9][0-9]*$/.test(ref) ? ref : /\/pull\/([1-9][0-9]*)$/.exec(ref)?.[1];
  const key = number ? `pr-${number}` : `branch-${safe(ref)}`;
  const path = join(handoffs, `${key}.json`);
  writeJson(path, {
    ...readJson(path, {}),
    ref: number ?? ref,
    ...(handoff.repoFlag ? { repo_flag: handoff.repoFlag } : {}),
    session: String(input.session_id ?? ''),
    at: new Date().toISOString(),
    blocks: 0,
  });
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** This session's handoff records in `dir`'s repo, as [path, record]. */
function ownHandoffs(input, dir) {
  const handoffs = handoffDir(dir);
  if (!handoffs || !existsSync(handoffs)) return [];
  const session = String(input.session_id ?? '');
  return readdirSync(handoffs)
    .filter((name) => name.endsWith('.json'))
    .map((name) => [join(handoffs, name), readJson(join(handoffs, name), undefined)])
    .filter(([, record]) => record?.session && record.session === session);
}

/** Why this session may not stop yet because of an unwatched handoff, or ''. */
function handoffReason(input, dir) {
  const reasons = [];
  const records = ownHandoffs(input, dir);
  // A record is watched by its own waiter. wait-merge claims the PR-number record, and a branch
  // record counts as watched by any live waiter, since its number isn't known here.
  const anyWaiter = records.some(([, record]) => alive(record.waiter?.pid));
  for (const [path, record] of records) {
    const watched = alive(record.waiter?.pid) || (path.includes('/branch-') && anyWaiter);
    if (watched || (record.blocks ?? 0) >= MAX_BLOCKS) continue;
    writeJson(path, { ...record, blocks: (record.blocks ?? 0) + 1 });
    const pr = /^[1-9][0-9]*$/.test(String(record.ref))
      ? `PR #${record.ref}`
      : `the PR for ${record.ref}`;
    const arg = /^[1-9][0-9]*$/.test(String(record.ref)) ? record.ref : 'PR';
    reasons.push(
      `${pr} is handed to automerge, and nothing will wake this session when it merges: CI watchers report failures, not merges. Run \`solo wait-merge ${arg}\` now and carry on with the steps after the merge when it returns. Where the host wakes you when a background command exits (Claude Code's run_in_background), run it in the background; otherwise in the foreground with a \`--timeout\` (seconds) under the host's command time limit, and again after a timeout. If the user told you to stop here, say so and stop.`,
    );
  }
  return reasons.join('\n\n');
}

// ---- Named skills -------------------------------------------------------------------------------

/** Solo skills a prompt names, such as `solo-build-change` or `/sidecut-solo:solo-deliver-change`. */
export function namedSkills(prompt) {
  const found = new Set();
  const pattern = /(?<![\w-])(?:sidecut-solo:)?(solo-[a-z]+(?:-[a-z]+)*)(?![\w-])/g;
  for (const match of String(prompt).matchAll(pattern)) {
    if (existsSync(join(SKILLS, match[1], 'SKILL.md'))) found.add(match[1]);
  }
  return [...found];
}

/**
 * The Solo skill a tool call loaded, if any: Claude Code's Skill tool, or a shell command that reads
 * one of this plugin's SKILL.md files, as Codex does.
 */
export function loadedSkill(input) {
  if (input.tool_name === 'Skill') {
    const [namespace, skill] = String(input.tool_input?.skill ?? '').split(':');
    return namespace === PLUGIN ? skill : undefined;
  }
  const command = [input.tool_input?.command ?? ''].flat().join(' ');
  for (const part of command.split(/[;&|\n]+/)) {
    if (!/^\s*(?:\S*\/)?(cat|sed|head|tail|less|more|bat|nl)\b/.test(part)) continue;
    const skill = /\/sidecut-solo\/(?:[^/\s'"]+\/)?skills\/([a-z0-9-]+)\/SKILL\.md/.exec(part)?.[1];
    if (skill) return skill;
  }
  return undefined;
}

function noteSession(id, change) {
  if (!id) return;
  const path = sessionFile(id);
  const notes = readJson(path, { named: [], loaded: [], raised: [] });
  change(notes);
  notes.at = new Date().toISOString();
  writeJson(path, notes);
}

/** UserPromptSubmit: note named skills, and give a new prompt fresh refusals for open handoffs. */
export function notePrompt(input) {
  const named = namedSkills(input.prompt ?? '');
  if (named.length)
    noteSession(input.session_id, (notes) => {
      notes.named = [...new Set([...(notes.named ?? []), ...named])];
    });
  for (const [path, record] of ownHandoffs(input, cwdOf(input)))
    if (record.blocks) writeJson(path, { ...record, blocks: 0 });
}

/** PostToolUse: note a loaded Solo skill. */
export function noteSkill(input) {
  const skill = loadedSkill(input);
  if (skill && existsSync(join(SKILLS, skill, 'SKILL.md')))
    noteSession(input.session_id, (notes) => {
      notes.loaded = [...new Set([...(notes.loaded ?? []), skill])];
    });
}

function namedReason(input) {
  if (!input.session_id) return '';
  const path = sessionFile(input.session_id);
  const notes = readJson(path, undefined);
  if (!notes) return '';
  const missing = (notes.named ?? []).filter(
    (name) => !(notes.loaded ?? []).includes(name) && !(notes.raised ?? []).includes(name),
  );
  if (!missing.length) return '';
  writeJson(path, { ...notes, raised: [...(notes.raised ?? []), ...missing] });
  const list = missing.map((name) => `${PLUGIN}:${name}`).join(', ');
  return `The task named ${list}, and this session hasn't loaded ${missing.length > 1 ? 'them' : 'it'}. Hand over to each named skill at its step: load it (the Skill tool, or read its SKILL.md where the host has none) and follow its steps instead of doing that part from memory. If a named skill's step has come, load it now. If its step is still ahead, or the user dropped it, say so in one line and carry on.`;
}

/** Drops session notes older than a week so the folder doesn't grow forever. */
function prune() {
  const dir = dirname(sessionFile('x'));
  if (!existsSync(dir)) return;
  const old = Date.now() - 7 * 24 * 3600 * 1000;
  for (const name of readdirSync(dir)) {
    try {
      if (statSync(join(dir, name)).mtimeMs < old) rmSync(join(dir, name), { force: true });
    } catch {}
  }
}

/** Stop: refuse to end the turn on an unwatched handoff or a named skill that never loaded. */
export function judgeStop(input) {
  prune();
  const reason = [
    handoffReason(input, cwdOf(input)),
    input.stop_hook_active ? '' : namedReason(input),
  ]
    .filter(Boolean)
    .join('\n\n');
  return reason ? { decision: 'block', reason } : undefined;
}
