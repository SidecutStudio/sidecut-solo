// The usage dashboard (kept outside lib/ so its words don't widen the refusal log's vocabulary): the same records `solo.ts usage` reads, summed per day and per name, and a
// self-contained HTML page that draws them. No network, no scripts from elsewhere, nothing written.
import {
  canonicalSoloSkill,
  hostName,
  hostOf,
  isSkillRun,
  logOnlyRuns,
  mcpToolOf,
  type Refusal,
  type SkillRun,
  SOLO_SKILLS,
  skillMinutes,
  skillOf,
  tokensOf,
  triggerOf,
  type UsageRecord,
} from '../lib/usage.ts';

type Row = { name: string; value: number; detail?: string; failed?: number };
export type Summary = {
  since: string;
  until: string;
  totals: Record<Metric, number>;
  days: ({ day: string } & Record<Metric, number>)[];
  lists: Record<ListKey, Row[]>;
  solo: { sessions: number; neverStarted: string[]; routerOnly: number };
};

const METRICS = ['sessions', 'cost', 'skills', 'hours', 'prs', 'commits'] as const;
type Metric = (typeof METRICS)[number];
const LISTS = [
  'skills',
  'runtime',
  'costBySkill',
  'costByModel',
  'tokensByModel',
  'hosts',
  'tools',
  'agents',
  'refusals',
] as const;
type ListKey = (typeof LISTS)[number];

const zero = () => Object.fromEntries(METRICS.map((m) => [m, 0])) as Record<Metric, number>;

/** Local calendar day, so a late-night session lands on the day the user remembers. */
const dayOf = (time: string) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

function bump(map: Map<string, Row>, name: string, value: number, failed = 0) {
  const row = map.get(name) ?? { name, value: 0, failed: 0 };
  row.value += value;
  row.failed = (row.failed ?? 0) + failed;
  map.set(name, row);
  return row;
}

// claude.ai connectors arrive named by their UUID; a short prefix is enough to tell them apart.
const serverName = (name: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(name) ? `connector ${name.slice(0, 8)}` : name;

type HostTotals = {
  sessions: Set<string>;
  skills: number;
  tools: number;
  tokens: number;
  cost: number;
};

const whole = (n: number) => Math.round(n).toLocaleString('en-US');

const ranked = (map: Map<string, Row>) => [...map.values()].sort((a, b) => b.value - a.value);

/**
 * Sums records newer than `since` into the dashboard's totals, daily series and ranked lists.
 * `runs` from the skill hook log count only for hosts the export has nothing from.
 */
export function summarize(
  records: UsageRecord[],
  refusals: Refusal[],
  since: Date,
  until = new Date(),
  runs: SkillRun[] = [],
): Summary {
  const recent = records.filter((r) => {
    const t = new Date(r.time);
    return t >= since && t <= until;
  });
  // The chart starts at the first recorded day, so days before the export began don't read as zero use.
  let first = until.getTime();
  for (const r of recent) first = Math.min(first, Date.parse(r.time));
  const start = new Date(Math.max(since.getTime(), first));
  const days = new Map<string, Record<Metric, number>>();
  // Step by local calendar date, so a 23-hour clock-change day isn't jumped over.
  const last = dayOf(until.toISOString());
  for (const d = new Date(start); dayOf(d.toISOString()) <= last; d.setDate(d.getDate() + 1))
    days.set(dayOf(d.toISOString()), zero());
  const sessionsByDay = new Map<string, Set<string>>();
  const allSessions = new Set<string>();

  const skills = new Map<string, Row & { triggers: Record<string, number> }>();
  const costBySkill = new Map<string, Row>();
  const costByModel = new Map<string, Row>();
  const tools = new Map<string, Row & { ms: number }>();
  const agents = new Map<string, Row & { ms: number }>();
  const tokens = new Map<string, Row & { input: number; output: number; cached: number }>();
  const hosts = new Map<string, HostTotals>();
  const hostRow = (host: string) => {
    const found = hosts.get(host);
    if (found) return found;
    const made = { sessions: new Set<string>(), skills: 0, tools: 0, tokens: 0, cost: 0 };
    hosts.set(host, made);
    return made;
  };
  const soloSessions = new Map<string, string[]>();

  for (const r of recent) {
    const day = dayOf(r.time);
    const today = days.get(day) ?? zero();
    days.set(day, today);
    const session = r.attrs['session.id'];
    if (session) {
      allSessions.add(session);
      const set = sessionsByDay.get(day) ?? new Set<string>();
      set.add(session);
      sessionsByDay.set(day, set);
    }
    const value = r.value ?? 0;
    const host = hostRow(hostOf(r));
    if (session) host.sessions.add(session);
    const used = tokensOf(r);
    if (used) {
      const row = tokens.get(used.model) ?? {
        name: used.model,
        value: 0,
        input: 0,
        output: 0,
        cached: 0,
      };
      row.value += used.input + used.output;
      row.input += used.input;
      row.output += used.output;
      row.cached += used.cached;
      tokens.set(used.model, row);
      host.tokens += used.input + used.output;
    }
    if (isSkillRun(r)) {
      today.skills++;
      host.skills++;
      const name = skillOf(r);
      const row = skills.get(name) ?? { name, value: 0, triggers: {} };
      row.value++;
      const trigger = triggerOf(r);
      row.triggers[trigger] = (row.triggers[trigger] ?? 0) + 1;
      skills.set(name, row);
      const skill = canonicalSoloSkill(name);
      if (skill !== undefined) {
        const list = soloSessions.get(session ?? '?') ?? [];
        list.push(skill);
        soloSessions.set(session ?? '?', list);
      }
    }
    switch (r.name) {
      case 'tool_result': {
        host.tools++;
        const mcp = mcpToolOf(r);
        if (!mcp) break;
        const name = `${serverName(mcp[0])} · ${mcp[1]}`;
        const row = tools.get(name) ?? { name, value: 0, failed: 0, ms: 0 };
        row.value++;
        if (r.attrs.success === 'false') row.failed = (row.failed ?? 0) + 1;
        row.ms += Number(r.attrs.duration_ms ?? 0);
        tools.set(name, row);
        break;
      }
      case 'subagent_completed': {
        const name = r.attrs.agent_type ?? '?';
        const row = agents.get(name) ?? { name, value: 0, ms: 0 };
        row.value++;
        row.ms += Number(r.attrs.duration_ms ?? 0);
        agents.set(name, row);
        break;
      }
      case 'claude_code.cost.usage':
        today.cost += value;
        host.cost += value;
        bump(costBySkill, r.attrs['skill.name'] ?? '(no skill)', value);
        bump(costByModel, r.attrs.model ?? '?', value);
        break;
      case 'claude_code.active_time.total':
        today.hours += value / 3600;
        break;
      case 'claude_code.pull_request.count':
        today.prs += value;
        break;
      case 'claude_code.commit.count':
        today.commits += value;
        break;
    }
  }
  // Skill runs only the hook log saw, from a host the export has nothing from.
  const extra = logOnlyRuns(
    records,
    runs.filter((r) => new Date(r.time) <= until),
    since,
  );
  for (const run of extra) {
    const today = days.get(dayOf(run.time)) ?? zero();
    days.set(dayOf(run.time), today);
    today.skills++;
    hostRow(run.host).skills++;
    const name = `sidecut-solo:${run.skill}`;
    const row = skills.get(name) ?? { name, value: 0, triggers: {} };
    row.value++;
    const trigger = `${run.host} skill log`;
    row.triggers[trigger] = (row.triggers[trigger] ?? 0) + 1;
    skills.set(name, row);
  }
  for (const [day, set] of sessionsByDay) {
    const row = days.get(day);
    if (row) row.sessions = set.size;
  }

  const series = [...days]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, row]) => ({ day, ...row }));
  const totals = zero();
  for (const row of series) for (const m of METRICS) totals[m] += row[m];
  totals.sessions = allSessions.size;

  const minutes = skillMinutes(recent);
  const window = refusals.filter((r) => {
    const t = new Date(r.time);
    return t >= since && t <= until;
  });
  const refusalRows = new Map<string, Row>();
  for (const r of window) bump(refusalRows, `${r.command}: ${r.reason}`, 1);
  const ran = new Set([...soloSessions.values()].flat().concat(extra.map((r) => r.skill)));

  return {
    since: start.toISOString(),
    until: until.toISOString(),
    totals,
    days: series,
    lists: {
      skills: [...skills.values()]
        .sort((a, b) => b.value - a.value)
        .map(({ name, value, triggers }) => ({
          name,
          value,
          detail: Object.entries(triggers)
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => `${t} ${n}`)
            .join(' · '),
        })),
      runtime: [...minutes]
        .map(([name, mins]) => ({
          name,
          value: median(mins),
          detail: `longest ${Math.max(...mins).toFixed(0)} min · ${mins.length} runs`,
        }))
        .sort((a, b) => b.value - a.value),
      costBySkill: ranked(costBySkill).map(({ name, value }) => ({ name, value })),
      costByModel: ranked(costByModel).map(({ name, value }) => ({ name, value })),
      tokensByModel: [...tokens.values()]
        .sort((a, b) => b.value - a.value)
        .map(({ name, value, input, output, cached }) => ({
          name,
          value,
          detail: `${whole(input)} in · ${whole(output)} out · ${whole(cached)} cached`,
        })),
      hosts: [...hosts]
        .sort((a, b) => b[1].sessions.size - a[1].sessions.size)
        .map(([host, row]) => ({
          name: hostName(host),
          value: row.sessions.size,
          detail: `${row.skills} skill runs · ${row.tools} tool calls · ${whole(row.tokens)} tokens · ${host === 'codex' ? 'no cost sent' : `$${row.cost.toFixed(2)}`}`,
        })),
      tools: [...tools.values()]
        .sort((a, b) => b.value - a.value)
        .map(({ name, value, failed, ms }) => ({
          name,
          value,
          failed,
          detail: `${Math.round(ms / value)} ms avg`,
        })),
      agents: [...agents.values()]
        .sort((a, b) => b.value - a.value)
        .map(({ name, value, ms }) => ({
          name,
          value,
          detail: `${Math.round(ms / value / 1000)} s avg`,
        })),
      refusals: ranked(refusalRows).map(({ name, value }) => ({ name, value })),
    },
    solo: {
      sessions: soloSessions.size,
      neverStarted: SOLO_SKILLS.filter((s) => !ran.has(s)),
      routerOnly: [...soloSessions.values()].filter((s) => s.every((n) => n === 'solo')).length,
    },
  };
}
