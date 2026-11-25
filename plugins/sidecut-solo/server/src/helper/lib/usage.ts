// Usage summaries for `solo.ts usage`: Claude Code's and Codex's usage export (written only by the usage
// receiver in the Sidecut Solo source repository, scripts/usage.ts, which the plugin doesn't
// install), the plugin's own skill hook log (hooks/post-tool-use-skill-log.mjs, on unless
// SIDECUT_SKILL_LOG=0, DO_NOT_TRACK=1 or CI, no receiver needed) and the helper's local refusal log. All three stay on
// this machine and hold names, outcomes, timings and cost only, never prompts, commands, paths or
// tool inputs.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pluginRoot } from './paths.ts';

export type UsageRecord = {
  time: string;
  name: string;
  attrs: Record<string, string>;
  value?: number;
  /** Which agent sent it; records written before Codex support have none and came from Claude Code. */
  host?: string;
};

export const hostOf = (r: UsageRecord) => r.host ?? 'claude-code';

/** A skill starting: Claude Code's skill_activated or Codex's skill_invocation. */
export const isSkillRun = (r: UsageRecord) =>
  r.name === 'skill_activated' || r.name === 'skill_invocation';

/** The skill's name as `plugin:skill`. Codex sends the plugin apart, as an id such as `name@market`. */
export function skillOf(r: UsageRecord): string {
  const name = r.attrs['skill.name'] ?? '?';
  const plugin = r.attrs['skill.plugin_id']?.split(/[@:]/)[0];
  return plugin && !name.includes(':') ? `${plugin}:${name}` : name;
}

/** How a skill started. Codex's explicit means asked for, implicit means picked up by the agent. */
export const triggerOf = (r: UsageRecord) =>
  r.attrs.invocation_trigger ?? r.attrs['skill.invocation_type'] ?? 'unknown';

/** [server, tool] for an MCP tool call from either host, or nothing for other tools. */
export function mcpToolOf(r: UsageRecord): [string, string] | undefined {
  if (r.name !== 'tool_result') return undefined;
  if (r.attrs.mcp_server_name) return [r.attrs.mcp_server_name, r.attrs.mcp_tool_name ?? '?'];
  const server = r.attrs.mcp_server;
  if (!server) return undefined;
  const tool = r.attrs.tool_name ?? '?';
  return [server, tool.startsWith(`mcp__${server}__`) ? tool.slice(server.length + 7) : tool];
}

export type Tokens = { model: string; input: number; output: number; cached: number };

/** Tokens one record reports: Claude Code's token metric or Codex's completed response. */
export function tokensOf(r: UsageRecord): Tokens | undefined {
  const model = r.attrs.model ?? '?';
  if (r.name === 'claude_code.token.usage') {
    const n = r.value ?? 0;
    const type = r.attrs.type;
    if (type === 'input' || type === 'cacheCreation')
      return { model, input: n, output: 0, cached: 0 };
    if (type === 'output') return { model, input: 0, output: n, cached: 0 };
    if (type === 'cacheRead') return { model, input: n, output: 0, cached: n };
    return undefined;
  }
  if (r.name === 'sse_event' && r.attrs['event.kind'] === 'response.completed') {
    // Codex's input count already includes the cached part, and output includes reasoning.
    const n = (key: string) => Number(r.attrs[key] ?? 0) || 0;
    return {
      model,
      input: n('input_token_count'),
      output: n('output_token_count'),
      cached: n('cached_token_count'),
    };
  }
  return undefined;
}

/** Hook-log runs from hosts the export has nothing from in the window, so no run counts twice. */
export function logOnlyRuns(records: UsageRecord[], runs: SkillRun[], since: Date): SkillRun[] {
  // A host's export counts only once it holds skill runs; token or tool events alone don't replace
  // the hook log.
  const exported = new Set(
    records.filter((r) => isSkillRun(r) && new Date(r.time) >= since).map(hostOf),
  );
  return runs.filter((r) => new Date(r.time) >= since && !exported.has(r.host));
}

const HOST_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  antigravity: 'Antigravity',
};
export const hostName = (host: string) => HOST_NAMES[host] ?? host;

/** Formats host cost, reporting `no cost sent` for non-Claude hosts without cost events. */
export const hostCost = (host: string, cost: number) =>
  host === 'claude-code' || cost > 0 ? `$${cost.toFixed(2)}` : 'no cost sent';

export const usageFile = () =>
  process.env.CLAUDE_USAGE_FILE ?? join(homedir(), '.local/state/claude-usage/usage.jsonl');
/** The plugin's own skill hook log: one {time, plugin, skill, host} line per Solo skill run. */
const skillLogFile = () =>
  process.env.SIDECUT_SKILL_LOG_FILE ?? join(homedir(), '.sidecut', 'skill-log.jsonl');

export type SkillRun = { time: string; plugin: string; skill: string; host: string };

/** Solo's own rows from the skill hook log, with historical names mapped to current ones. */
export function readSkillRuns(path = skillLogFile()): SkillRun[] {
  return readJsonl<SkillRun>(path).flatMap((row) => {
    if (typeof row?.skill !== 'string' || typeof row.time !== 'string') return [];
    const skill = canonicalSoloSkill(`${row.plugin}:${row.skill}`);
    return skill ? [{ ...row, skill }] : [];
  });
}

const helperLog = () =>
  process.env.SOLO_HELPER_LOG ?? join(homedir(), '.local/state/solo-workflow/helper.jsonl');
const helperLogOff = () => helperLog() === 'off';

export function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}

/** The helper's logged refusals; none when SOLO_HELPER_LOG=off. */
export function readRefusals(): Refusal[] {
  return helperLogOff() ? [] : readJsonl<Refusal>(helperLog());
}

function count<T>(map: Map<string, T>, key: string, make: () => T) {
  const found = map.get(key);
  if (found) return found;
  const made = make();
  map.set(key, made);
  return made;
}

// A gap with no events this long ends a skill's run: sessions left open for days must not count
// as days of agent work.
const IDLE_MS = 30 * 60_000;

// Minutes per skill run: from a skill's activation to the next skill activation in the same session,
// or to that session's last event, stopping early at the last event before an idle gap. A rough
// measure of agent time, never of the user's own time.
export function skillMinutes(records: UsageRecord[]): Map<string, number[]> {
  const bySession = new Map<string, UsageRecord[]>();
  for (const r of records) {
    const id = r.attrs['session.id'];
    if (id) count(bySession, id, (): UsageRecord[] => []).push(r);
  }
  const out = new Map<string, number[]>();
  for (const rows of bySession.values()) {
    rows.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    rows.forEach((r, i) => {
      if (!isSkillRun(r)) return;
      const start = Date.parse(r.time);
      let end = start;
      for (const next of rows.slice(i + 1)) {
        const at = Date.parse(next.time);
        if (isSkillRun(next) || at - end > IDLE_MS) {
          if (isSkillRun(next) && at - end <= IDLE_MS) end = at;
          break;
        }
        end = at;
      }
      const minutes = (end - start) / 60_000;
      if (Number.isFinite(minutes) && minutes >= 0)
        count(out, skillOf(r), (): number[] => []).push(minutes);
    });
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

// Plain-text summary of records newer than `since`.
export function report(records: UsageRecord[], since: Date) {
  const recent = records.filter((record) => new Date(record.time) >= since);
  const sessions = new Set(recent.map((r) => r.attrs['session.id']).filter(Boolean));
  const skills = new Map<string, Record<string, number>>();
  const tools = new Map<string, { calls: number; failed: number; ms: number }>();
  const agents = new Map<string, { runs: number; ms: number }>();
  const cost = new Map<string, number>();
  const tokens = new Map<string, Tokens>();
  const hosts = new Map<
    string,
    { sessions: Set<string>; skills: number; tools: number; tokens: number; cost: number }
  >();
  let total = 0;
  for (const record of recent) {
    const { name, attrs, value } = record;
    const host = count(hosts, hostOf(record), () => ({
      sessions: new Set<string>(),
      skills: 0,
      tools: 0,
      tokens: 0,
      cost: 0,
    }));
    if (attrs['session.id']) host.sessions.add(attrs['session.id']);
    const used = tokensOf(record);
    if (used) {
      const row = count(tokens, used.model, () => ({ ...used, input: 0, output: 0, cached: 0 }));
      row.input += used.input;
      row.output += used.output;
      row.cached += used.cached;
      host.tokens += used.input + used.output;
    }
    if (name === 'tool_result') host.tools++;
    const mcp = mcpToolOf(record);
    if (isSkillRun(record)) {
      host.skills++;
      const row = count(skills, skillOf(record), (): Record<string, number> => ({}));
      const trigger = triggerOf(record);
      row[trigger] = (row[trigger] ?? 0) + 1;
    } else if (mcp) {
      const row = count(tools, `${mcp[0]} ${mcp[1]}`, () => ({
        calls: 0,
        failed: 0,
        ms: 0,
      }));
      row.calls++;
      if (attrs.success === 'false') row.failed++;
      row.ms += Number(attrs.duration_ms ?? 0);
    } else if (name === 'subagent_completed') {
      const row = count(agents, attrs.agent_type ?? '?', () => ({ runs: 0, ms: 0 }));
      row.runs++;
      row.ms += Number(attrs.duration_ms ?? 0);
    } else if (name === 'claude_code.cost.usage' && value) {
      total += value;
      host.cost += value;
      const key = attrs['skill.name'] ?? '(no skill)';
      cost.set(key, (cost.get(key) ?? 0) + value);
    }
  }
  const sorted = <T>(map: Map<string, T>, by: (row: T) => number) =>
    [...map].sort((a, b) => by(b[1]) - by(a[1]));
  const usd = (n: number) => `$${n.toFixed(2)}`;
  const big = (n: number) => Math.round(n).toLocaleString('en-US');
  const costNote = hosts.has('codex') ? ' (Claude Code only: Codex sends no cost)' : '';
  const lines = [
    `Since ${since.toISOString().slice(0, 10)}: ${sessions.size} sessions, ${usd(total)} estimated cost${costNote}`,
    '',
    'Hosts (sessions, skill runs, tool calls, tokens, cost)',
    ...sorted(hosts, (row) => row.sessions.size).map(
      ([host, row]) =>
        `  ${hostName(host)}  ${row.sessions.size} sessions, ${row.skills} skill runs, ${row.tools} tool calls, ${big(row.tokens)} tokens, ${hostCost(host, row.cost)}`,
    ),
    '',
    'Skills (runs by how they started)',
    ...sorted(skills, (row) => Object.values(row).reduce((a, b) => a + b, 0)).map(
      ([skill, row]) =>
        `  ${skill}  ${Object.entries(row)
          .map(([trigger, n]) => `${trigger} ${n}`)
          .join(', ')}`,
    ),
    '',
    'Skill run time (median and longest minutes, runs)',
    ...[...skillMinutes(recent)]
      .sort((a, b) => b[1].length - a[1].length)
      .map(
        ([skill, mins]) =>
          `  ${skill}  median ${median(mins).toFixed(1)} min, longest ${Math.max(...mins).toFixed(1)} min, ${mins.length} runs`,
      ),
    '',
    'MCP tools (calls, failures, average time)',
    ...sorted(tools, (row) => row.calls).map(
      ([tool, row]) =>
        `  ${tool}  ${row.calls} calls, ${row.failed} failed, ${Math.round(row.ms / row.calls)} ms`,
    ),
    '',
    'Subagents (runs, average time)',
    ...sorted(agents, (row) => row.runs).map(
      ([agent, row]) => `  ${agent}  ${row.runs} runs, ${Math.round(row.ms / row.runs / 1000)} s`,
    ),
    '',
    'Tokens by model (input, output, of which cached input)',
    ...sorted(tokens, (row) => row.input + row.output).map(
      ([model, row]) =>
        `  ${model}  ${big(row.input)} input, ${big(row.output)} output, ${big(row.cached)} cached`,
    ),
    '',
    'Cost by active skill',
    ...sorted(cost, (n) => n).map(([skill, n]) => `  ${skill}  ${usd(n)}`),
  ];
  return lines.join('\n');
}

export type Refusal = { time: string; version: string; command: string; reason: string };

// Every word the helper's own source uses. A refusal keeps only these, so a branch, remote,
// path or value the user supplied can't reach the log even when it is a plain word.
let vocabulary: Set<string> | undefined;
function helperWords(): Set<string> {
  if (vocabulary) return vocabulary;
  const words = new Set<string>();
  const files = [join(pluginRoot, 'server', 'src', 'helper', 'solo.ts')];
  try {
    for (const name of readdirSync(join(pluginRoot, 'server', 'src', 'helper', 'lib')))
      if (name.endsWith('.ts'))
        files.push(join(pluginRoot, 'server', 'src', 'helper', 'lib', name));
  } catch {}
  for (const file of files) {
    try {
      for (const word of readFileSync(file, 'utf8')
        .toLowerCase()
        .match(/[a-z]+/g) ?? [])
        words.add(word);
    } catch {}
  }
  vocabulary = words;
  return words;
}

/**
 * A refusal message reduced to the helper's own wording, so refusals group and the log holds no
 * names or values: anything from a git or gh failure onwards becomes "git … failed" (or gh), and
 * any other word that isn't one the helper's source uses, or an option name, becomes "…".
 */
export function refusalReason(message: string): string {
  const known = helperWords();
  const first = (message.split('\n')[0] ?? '').replace(/\b(git|gh)\b[ :].*$/, '$1 … failed');
  return first
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '…')
    .split(/\s+/)
    .map((word) => {
      const bare = /^([A-Za-z]{1,20})[.,;:!?)]*$/.exec(word)?.[1];
      if (bare && known.has(bare.toLowerCase())) return word;
      if (/^--[a-z][a-z-]*[.,;:]*$|^[(:;,.—-]$|^…$/.test(word)) return word;
      return '…';
    })
    .join(' ')
    .replace(/…(?: …)+/g, '…')
    .slice(0, 160);
}

/** Appends one refusal to the helper's local log. SOLO_HELPER_LOG=off turns it off; failures are ignored. */
export function logRefusal(command: string, message: string, version: string): void {
  if (helperLogOff()) return;
  const path = helperLog();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const row: Refusal = {
      time: new Date().toISOString(),
      version,
      command,
      reason: refusalReason(message),
    };
    appendFileSync(path, `${JSON.stringify(row)}\n`);
  } catch {}
}

export const SOLO_SKILLS = [
  'solo',
  'solo-choose-approach',
  'solo-research-topic',
  'solo-plan-change',
  'solo-build-change',
  'solo-diagnose-problem',
  'solo-list-work',
  'solo-review-change',
  'solo-review-design',
  'solo-verify-change',
  'solo-finish-change',
  'solo-configure-project',
  'solo-maintain-context',
  'solo-prevent-mistake',
  'solo-compare-plugin',
  'solo-show-usage',
  'solo-write-copy',
];

// A stopped receiver looks like a quiet week, so say when the newest event arrived. A loop, not
// Math.max(...), because the log is never trimmed and spreading it overflows the stack. Invalid
// dates and dates after now (a skewed clock) are skipped, so neither can hide a stopped receiver.
export function lastRecorded(records: UsageRecord[], now: Date): string {
  let newest = Number.NEGATIVE_INFINITY;
  for (const r of records) {
    const time = new Date(r.time).getTime();
    if (Number.isFinite(time) && time <= now.getTime() && time > newest) newest = time;
  }
  if (!Number.isFinite(newest)) return 'Last recorded: no event with a valid past time';
  const hours = (now.getTime() - newest) / 3_600_000;
  const when = new Date(newest).toISOString().slice(0, 16).replace('T', ' ');
  if (hours <= 24) return `Last recorded ${when} UTC`;
  const days = Math.round(hours / 24);
  return `Last recorded ${when} UTC, ${days} ${days === 1 ? 'day' : 'days'} ago: recording may have stopped, so check that the usage receiver is running`;
}

// Normalize only the Solo coverage view; raw records remain unchanged historical evidence.
export const SOLO_SKILL_ALIASES = new Map([
  ['solo-workflow', 'solo'],
  ...SOLO_SKILLS.filter((name) => name !== 'solo').map((name): [string, string] => [
    name.replace(/^solo-/, 'solo-workflow-'),
    name,
  ]),
  ['solo-decide', 'solo-choose-approach'],
  ['solo-research', 'solo-research-topic'],
  ['solo-plan', 'solo-plan-change'],
  ['solo-build', 'solo-build-change'],
  ['solo-troubleshoot', 'solo-diagnose-problem'],
  ['solo-status', 'solo-list-work'],
  ['solo-review', 'solo-review-change'],
  ['solo-design-review', 'solo-review-design'],
  ['solo-verify', 'solo-verify-change'],
  ['solo-finish', 'solo-finish-change'],
  ['solo-setup', 'solo-configure-project'],
  ['solo-improve-workflow', 'solo-prevent-mistake'],
  ['solo-workflow-improve-workflow', 'solo-prevent-mistake'],
  ['solo-check-status', 'solo-list-work'],
  ['solo-workflow-check-status', 'solo-list-work'],
  ['solo-dogfood', 'solo-compare-plugin'],
]);

/** Recognizes either install namespace and maps historical skill names to current names. */
export function canonicalSoloSkill(name: string): string | undefined {
  const prefix = ['solo-workflow:', 'sidecut-solo-workflow:', 'sidecut-solo:'].find((p) =>
    name.startsWith(p),
  );
  if (!prefix) return undefined;
  const skill = name.slice(prefix.length);
  return SOLO_SKILL_ALIASES.get(skill) ?? skill;
}

// The skill hook log's view: runs per Solo skill and host, and the skills that never started. It
// needs no receiver, so it is what a shared install can see.
function skillLogSection(runs: SkillRun[], since: Date, title = 'Skill log'): string[] {
  const window = runs.filter((r) => new Date(r.time) >= since);
  if (!window.length)
    return [
      `Skill log: no Solo skill runs in ${skillLogFile()}. The plugin's hook records one line per skill run (time, plugin, skill, host) unless SIDECUT_SKILL_LOG=0, DO_NOT_TRACK=1 or a CI variable is set; it needs no receiver and sends nothing.`,
    ];
  const bySkill = new Map<string, Map<string, number>>();
  for (const r of window) {
    const hosts = count(bySkill, r.skill, () => new Map<string, number>());
    hosts.set(r.host, (hosts.get(r.host) ?? 0) + 1);
  }
  const total = (hosts: Map<string, number>) => [...hosts.values()].reduce((a, b) => a + b, 0);
  const unused = SOLO_SKILLS.filter((s) => !bySkill.has(s));
  return [
    `${title} (${window.length} runs, from ${skillLogFile()})`,
    ...[...bySkill]
      .sort((a, b) => total(b[1]) - total(a[1]))
      .map(
        ([skill, hosts]) =>
          `  ${skill}  ${[...hosts].map(([host, n]) => `${host} ${n}`).join(', ')}`,
      ),
    `  skills that never started: ${unused.join(', ') || 'none'}`,
  ];
}

/**
 * One line a user can paste to share how they use Solo: the version, the period and runs per
 * skill. Names and counts only: no repositories, costs, timestamps or hosts. The helper prints it; it
 * never sends it.
 */
export function shareLine(
  records: UsageRecord[],
  runs: SkillRun[],
  since: Date,
  days: number,
  version: string,
): string {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (!isSkillRun(r) || new Date(r.time) < since) continue;
    const skill = canonicalSoloSkill(skillOf(r));
    if (skill) counts.set(skill, (counts.get(skill) ?? 0) + 1);
  }
  // The export already counts every run the hook log would for the hosts it covers.
  for (const r of logOnlyRuns(records, runs, since))
    counts.set(r.skill, (counts.get(r.skill) ?? 0) + 1);
  const ran = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const period = `last ${days} ${days === 1 ? 'day' : 'days'}`;
  if (!ran.length) return `Sidecut Solo ${version}, ${period}: no skill runs recorded`;
  return `Sidecut Solo ${version}, ${period}: ${ran.map(([skill, n]) => `${skill} ${n}`).join(', ')}`;
}

/**
 * What `solo.ts usage` prints: Solo's skills from Claude Code's usage export, what the export
 * can't tell apart, and the helper's own refusals.
 */
export function soloReport(
  records: UsageRecord[],
  refusals: Refusal[],
  since: Date,
  now = new Date(),
  runs: SkillRun[] = [],
): string {
  const recent = records.filter((r) => new Date(r.time) >= since);
  const lines: string[] = [];
  if (!records.length) {
    lines.push(
      `No Claude Code or Codex usage export at ${usageFile()}. The usage receiver in the Sidecut Solo source repository (its README, "See your own usage") writes it, with tools, tokens, Claude Code's costs and how each skill started; the plugin doesn't install it.`,
    );
    lines.push('', ...skillLogSection(runs, since));
  } else {
    lines.push(lastRecorded(records, now), report(recent, since), '');
    const bySession = new Map<string, string[]>();
    for (const r of recent) {
      const skill = canonicalSoloSkill(skillOf(r));
      if (!isSkillRun(r) || skill === undefined) continue;
      count(bySession, r.attrs['session.id'] ?? '?', (): string[] => []).push(skill);
    }
    const extra = logOnlyRuns(records, runs, since);
    const ran = new Set([...bySession.values()].flat().concat(extra.map((r) => r.skill)));
    const unused = SOLO_SKILLS.filter((s) => !ran.has(s));
    const routerOnly = [...bySession.values()].filter((s) => s.every((n) => n === 'solo'));
    lines.push(
      'Sidecut Solo',
      `  sessions using Solo: ${bySession.size}`,
      `  skills that never started: ${unused.join(', ') || 'none'}`,
      `  sessions where only the router started (it may have done the work itself): ${routerOnly.length}`,
      '  how a skill started: user-slash is a typed command in the terminal; the desktop app reports typed',
      '  commands as claude-proactive too, so there it does not separate typed from automatic.',
      '  In Codex, explicit means asked for and implicit means picked up by the agent.',
    );
    if (extra.length)
      lines.push(
        '',
        ...skillLogSection(extra, since, "Skill log for hosts the export doesn't cover"),
      );
  }
  if (helperLogOff()) {
    lines.push('', 'Helper refusals: not recorded, the log is off (SOLO_HELPER_LOG=off)');
    return lines.join('\n');
  }
  const window = refusals.filter((r) => new Date(r.time) >= since);
  const grouped = new Map<string, number>();
  for (const r of window)
    grouped.set(`${r.command}: ${r.reason}`, (grouped.get(`${r.command}: ${r.reason}`) ?? 0) + 1);
  lines.push(
    '',
    `Helper refusals (${window.length}, from ${helperLog()})`,
    ...[...grouped]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([reason, n]) => `  ${n}  ${reason}`),
  );
  if (!window.length) lines.push('  none recorded');
  return lines.join('\n');
}
