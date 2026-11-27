// The turn guard keeps a session from going quiet with Solo work still owed. The hook scripts beside
// this folder call into it, one per hook event:
//
// - Stop: a PR handed to automerge with nothing watching it holds the turn. CI watchers only speak
//   up when something fails, so a clean merge would otherwise wake nobody and the steps after it
//   would sit undone. Two things say a PR is handed off: the record `solo automerge` writes under
//   the Git common directory at solo-handoffs/pr-<n>.json, and GitHub itself, where this branch's
//   open PR has a merge label or auto-merge set. A handoff GitHub shows with no record was made
//   outside Solo, so it gets a record here and the session is sent to `solo automerge`, whose gates
//   it skipped. A record is watched while the wait-merge that claimed it is alive and inside the
//   wait it announced. Nothing here reads shell commands.
// - UserPromptSubmit: the Solo skills the user's own words ask this session to run are noted. Relayed
//   blocks (another session's message, a task notification, pasted text), quotes, code and sentences
//   about a later step or another session don't count.
// - PostToolUse: the Solo skills the session loads are noted, and at Stop each named skill that never
//   loaded is raised once.
//
// Claude Code, Codex and Antigravity send different input shapes; `normal` reads all three. Session
// notes live in ~/.sidecut/solo/sessions/. Any error lets the session carry on.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
/** Labels a merge workflow merges on, such as `automerge` or `auto-merge`; the helper uses the same. */
const MERGE_LABEL = /auto[-_ ]?merge/i;
/** How many times in a row Stop refuses for one handoff before the user's stop stands. */
const MAX_BLOCKS = 2;

const safe = (value) => String(value ?? '').replace(/[^\w.-]/g, '_');

function run(command, args, cwd, timeout) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout,
  }).trim();
}

const git = (dir, args) => run('git', ['-C', dir, ...args], undefined, 1500);

/** `dir`'s worktree and where its repo keeps handoff records, when it carries Solo settings. */
function place(dir) {
  try {
    const top = git(dir, ['rev-parse', '--show-toplevel']);
    if (!existsSync(join(top, 'solo-workflow.toml'))) return undefined;
    const common = git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    return { top, dir: join(common, 'solo-handoffs') };
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

function isDir(path) {
  try {
    return typeof path === 'string' && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The hook input in one shape: { host, session, cwd, prompt, stopActive }. Antigravity sends
 * camelCase fields and runs hooks from the plugin's folder, so its workspace stands in for cwd.
 */
export function normal(input) {
  if (input.conversationId !== undefined || input.toolCall || input.workspacePaths) {
    const cwd = [input.toolCall?.args?.Cwd, ...(input.workspacePaths ?? [])].find(isDir);
    return {
      host: 'antigravity',
      session: String(input.conversationId ?? ''),
      cwd: cwd ?? process.cwd(),
      prompt: input.lastUserInput,
      stopActive: false,
    };
  }
  return {
    host: input.turn_id === undefined ? 'claude-code' : 'codex',
    session: String(input.session_id ?? ''),
    cwd: isDir(input.cwd) ? input.cwd : process.cwd(),
    prompt: input.prompt,
    stopActive: Boolean(input.stop_hook_active),
  };
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

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** Whether a wait-merge is watching the record: alive, and not past the wait it announced. */
export function watched(record, at = Date.now()) {
  const waiter = record?.waiter;
  if (!alive(waiter?.pid)) return false;
  const until = Date.parse(waiter.until ?? '');
  return Number.isNaN(until) || at <= until;
}

/**
 * GitHub's view of this branch's PR: { number, open, handedOff, label }, or undefined when the
 * branch was never pushed, has no PR or gh can't say. Only a pushed branch can have one, so local
 * work costs no network call.
 */
function branchPr(dir) {
  try {
    git(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  } catch {
    return undefined;
  }
  try {
    const view = JSON.parse(
      run('gh', ['pr', 'view', '--json', 'number,state,labels,autoMergeRequest'], dir, 2500),
    );
    if (!Number.isInteger(view.number)) return undefined;
    const label = (view.labels ?? []).map((l) => l.name ?? '').find((n) => MERGE_LABEL.test(n));
    return {
      number: view.number,
      open: view.state === 'OPEN',
      handedOff: Boolean(view.autoMergeRequest) || Boolean(label),
      label,
    };
  } catch {
    return undefined;
  }
}

/** This worktree's handoff records, as [path, record]; older records name their session. */
function ownHandoffs(input, where) {
  if (!where || !existsSync(where.dir)) return [];
  return readdirSync(where.dir)
    .filter((name) => /^pr-[1-9][0-9]*\.json$/.test(name))
    .map((name) => [join(where.dir, name), readJson(join(where.dir, name), undefined)])
    .filter(
      ([, record]) =>
        record &&
        (record.worktree === where.top ||
          (!record.worktree && record.session && record.session === input.session)),
    );
}

/** Why this session may not stop yet because of an unwatched handoff, or ''. */
function handoffReason(input) {
  const where = place(input.cwd);
  if (!where) return '';
  const records = ownHandoffs(input, where);
  const github = branchPr(input.cwd);
  if (github) {
    const path = join(where.dir, `pr-${github.number}.json`);
    const record = readJson(path, undefined);
    if (!github.open || !github.handedOff) {
      // GitHub says nothing will merge it here: merged, closed or taken off automerge.
      if (record && !watched(record)) rmSync(path, { force: true });
    } else if (!record) {
      const made = {
        ref: String(github.number),
        worktree: where.top,
        via: github.label ? `label ${github.label}` : 'auto-merge',
        outside_solo: true,
        at: new Date().toISOString(),
        blocks: 0,
      };
      writeJson(path, made);
      records.push([path, made]);
    }
  }
  const reasons = [];
  // Antigravity has no prompt hook, so a new user message shows as a changed lastUserInput.
  const asked =
    input.host === 'antigravity'
      ? createHash('sha256')
          .update(String(input.prompt ?? ''))
          .digest('hex')
          .slice(0, 16)
      : undefined;
  for (const [path, record] of records) {
    const blocks = asked && record.asked !== asked ? 0 : (record.blocks ?? 0);
    if (!existsSync(path) || watched(record) || blocks >= MAX_BLOCKS) continue;
    // Read again just before writing, so a waiter claimed meanwhile isn't wiped.
    const latest = readJson(path, undefined);
    if (!latest || watched(latest)) continue;
    writeJson(path, { ...latest, blocks: blocks + 1, ...(asked ? { asked } : {}) });
    const pr = record.ref;
    const host =
      input.host === 'claude-code'
        ? "Run it in the background (run_in_background) with `--timeout 3600`; you're woken when it exits."
        : "Run it in the foreground with a `--timeout` (seconds) under the host's command time limit, and again after a timeout.";
    reasons.push(
      record.outside_solo
        ? `PR #${pr} is handed to automerge (${record.via}), but not through Solo, so its reviewed-head gate never ran and nothing will wake this session when it merges. Run \`solo automerge ${pr}${String(record.via).startsWith('label') ? ` --label ${record.via.slice(6)}` : ''}\` now: it checks the saved review covers the PR head, then waits for the merge. ${host} If the user told you to stop here, say so and stop.`
        : `PR #${pr} is handed to automerge, and nothing will wake this session when it merges: CI watchers report failures, not merges. Run \`solo wait-merge ${pr}\` now and carry on with the steps after the merge when it returns. ${host} If the user told you to stop here, say so and stop.`,
    );
  }
  return reasons.join('\n\n');
}

// ---- Named skills -------------------------------------------------------------------------------

// Text the host or another session relays into a prompt. Skills named there are someone else's.
const RELAYED = [
  'cross-session-message',
  'agent-message',
  'side-sessions-event',
  'pasted_content',
  'task-notification',
  'ci-monitor-event',
];
const SKILL_NAME = /(?<![\w/-])(\/)?(?:sidecut-solo:)?(solo-[a-z]+(?:-[a-z]+)*)(?![\w/-])/g;
// A sentence that puts a skill on a later step or on another session doesn't ask for it now.
const DEFERRED =
  /\b(?:later|afterwards|after that|follow-?up|next step|(?:another|other|separate|side|new|next|parent) session|the session that started you)\b/i;

/** The prompt's own words: relayed blocks, quotes and code left out. */
function ownWords(prompt) {
  let text = String(prompt);
  for (const tag of RELAYED) {
    const open = `<\\\\?~?${tag}\\b[^>]*>`;
    const close = `<\\/\\\\?~?${tag}\\s*>`;
    text = text.replace(new RegExp(`${open}[\\s\\S]*?(?:${close}|$)`, 'gi'), '\n');
  }
  return text
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/gm, '\n')
    .replace(/^[ \t]*>.*$/gm, '')
    .replace(/`([^`\n]*)`/g, (span, inner) =>
      /^\/?(?:sidecut-solo:)?solo-[a-z-]+$/.test(inner.trim()) ? inner : ' ',
    );
}

/**
 * Solo skills the user's own message asks this session to run, such as `solo-build-change` or
 * `/sidecut-solo:solo-deliver-change`. A slash command always counts; a name in a sentence about a
 * later step or another session doesn't.
 */
export function namedSkills(prompt) {
  const found = new Set();
  for (const sentence of ownWords(prompt).split(/(?<=[.!?;])\s+|\n+/)) {
    const deferred = DEFERRED.test(sentence);
    for (const [, slash, name] of sentence.matchAll(SKILL_NAME)) {
      if (deferred && !slash) continue;
      if (existsSync(join(SKILLS, name, 'SKILL.md'))) found.add(name);
    }
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
export function notePrompt(raw) {
  const input = normal(raw);
  const named = namedSkills(input.prompt ?? '');
  if (named.length)
    noteSession(input.session, (notes) => {
      notes.named = [...new Set([...(notes.named ?? []), ...named])];
    });
  for (const [path, record] of ownHandoffs(input, place(input.cwd)))
    if (record.blocks) {
      const latest = readJson(path, undefined);
      if (latest) writeJson(path, { ...latest, blocks: 0 });
    }
}

/** PostToolUse: note a loaded Solo skill. */
export function noteSkill(input) {
  const skill = loadedSkill(input);
  if (skill && existsSync(join(SKILLS, skill, 'SKILL.md')))
    noteSession(normal(input).session, (notes) => {
      notes.loaded = [...new Set([...(notes.loaded ?? []), skill])];
    });
}

function namedReason(input) {
  if (!input.session) return '';
  const path = sessionFile(input.session);
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
export function judgeStop(raw) {
  prune();
  const input = normal(raw);
  const reason = [handoffReason(input), input.stopActive ? '' : namedReason(input)]
    .filter(Boolean)
    .join('\n\n');
  if (!reason) return undefined;
  // Antigravity keeps the loop going on "continue"; Claude Code and Codex on "block".
  return { decision: input.host === 'antigravity' ? 'continue' : 'block', reason };
}
