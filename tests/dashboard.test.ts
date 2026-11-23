import { expect, test } from 'vitest';
import { dashboardPage } from '../plugins/sidecut-solo/server/src/helper/dashboard/page';
import { summarize } from '../plugins/sidecut-solo/server/src/helper/dashboard/summary';
import type { Refusal, UsageRecord } from '../plugins/sidecut-solo/server/src/helper/lib/usage';

const rec = (time: string, name: string, attrs: Record<string, string> = {}, value?: number) =>
  ({ time, name, attrs: { 'session.id': 's1', ...attrs }, value }) as UsageRecord;

const records: UsageRecord[] = [
  rec('2026-11-02T10:00:00Z', 'skill_activated', {
    'skill.name': 'solo-workflow:solo-build',
    invocation_trigger: 'user-slash',
  }),
  rec(
    '2026-11-02T10:05:00Z',
    'claude_code.cost.usage',
    { 'skill.name': 'solo-workflow:solo-build', model: 'm1' },
    1.5,
  ),
  rec('2026-11-02T10:06:00Z', 'tool_result', {
    mcp_server_name: '82c831d5-72e9-4e3b-887f-4b390ac5393b',
    mcp_tool_name: 'search',
    success: 'false',
    duration_ms: '200',
  }),
  rec('2026-11-03T09:00:00Z', 'claude_code.cost.usage', { 'session.id': 's2', model: 'm1' }, 0.5),
  rec('2026-11-03T09:00:00Z', 'claude_code.pull_request.count', { 'session.id': 's2' }, 1),
  rec('2026-11-03T09:00:00Z', 'claude_code.active_time.total', { 'session.id': 's2' }, 7200),
];
const refusals: Refusal[] = [
  { time: '2026-11-03T09:00:00Z', version: '0.12.0', command: 'merge', reason: 'not green' },
];

test('summarize sums totals, lists and Solo coverage over the window', () => {
  const s = summarize(
    records,
    refusals,
    new Date('2026-10-01T00:00:00Z'),
    new Date('2026-11-04T00:00:00Z'),
  );
  expect(s.totals.sessions).toBe(2);
  expect(s.totals.cost).toBeCloseTo(2);
  expect(s.totals.skills).toBe(1);
  expect(s.totals.prs).toBe(1);
  expect(s.totals.hours).toBeCloseTo(2);
  expect(s.lists.skills[0]).toMatchObject({
    name: 'solo-workflow:solo-build',
    value: 1,
    detail: 'user-slash 1',
  });
  expect(s.lists.costByModel[0]).toMatchObject({ name: 'm1', value: 2 });
  expect(s.lists.tools[0]).toMatchObject({
    name: 'connector 82c831d5 · search',
    value: 1,
    failed: 1,
  });
  expect(s.lists.refusals[0]).toMatchObject({ name: 'merge: not green', value: 1 });
  expect(s.solo.sessions).toBe(1);
  expect(s.solo.neverStarted).toContain('solo-verify-change');
  expect(s.solo.neverStarted).not.toContain('solo-build-change');
});

test('the daily series starts at the first recorded day, not the start of the window', () => {
  const s = summarize(
    records,
    [],
    new Date('2026-10-01T00:00:00Z'),
    new Date('2026-11-04T12:00:00Z'),
  );
  expect(s.days.length).toBeLessThanOrEqual(4);
  expect(s.days.reduce((n, d) => n + d.cost, 0)).toBeCloseTo(2);
  expect(
    summarize([], [], new Date('2026-11-01T00:00:00Z'), new Date('2026-11-03T00:00:00Z')).days
      .length,
  ).toBeGreaterThan(0);
});

test('names from the log cannot close the embedded data script', () => {
  const hostile = [
    rec('2026-11-02T10:00:00Z', 'skill_activated', {
      'skill.name': '</script><script>alert(1)</script>',
    }),
  ];
  const page = dashboardPage(
    summarize(hostile, [], new Date('2026-11-01T00:00:00Z'), new Date('2026-11-03T00:00:00Z')),
  );
  expect(page).not.toContain('</script><script>alert');
  expect(page.match(/<\/script>/g)?.length).toBe(2);
});

test('the served page links ranges; a saved one shows its dates', () => {
  const s = summarize(
    records,
    [],
    new Date('2026-11-01T00:00:00Z'),
    new Date('2026-11-04T00:00:00Z'),
  );
  expect(dashboardPage(s, { days: 14, live: true })).toContain('href="?days=30"');
  expect(dashboardPage(s)).toContain('Saved snapshot');
});

test('the spring-forward day still gets its own point on the chart', () => {
  const tz = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const late = [rec('2026-03-07T04:30:00Z', 'skill_activated', { 'skill.name': 'x' })]; // 23:30 on Mar 6 local
    const s = summarize(
      late,
      [],
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-10T16:00:00Z'),
    );
    expect(s.days.map((d) => d.day)).toEqual([
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
  } finally {
    process.env.TZ = tz;
  }
});

test('historical and current namespaces share canonical coverage while raw rows retain their names', () => {
  const history = [
    rec('2026-11-02T10:00:00Z', 'skill_activated', {
      'session.id': 'mixed',
      'skill.name': 'solo-workflow:solo-build',
    }),
    rec('2026-11-02T10:01:00Z', 'skill_activated', {
      'session.id': 'mixed',
      'skill.name': 'sidecut-solo:solo-build-change',
    }),
    rec('2026-11-02T10:02:00Z', 'skill_activated', {
      'session.id': 'old-router',
      'skill.name': 'solo-workflow:solo-workflow',
    }),
    rec('2026-11-02T10:03:00Z', 'skill_activated', {
      'session.id': 'new-router',
      'skill.name': 'sidecut-solo:solo-workflow',
    }),
    rec('2026-11-02T10:04:00Z', 'skill_activated', {
      'session.id': 'foreign',
      'skill.name': 'another-plugin:solo-verify',
    }),
  ];
  const before = JSON.stringify(history);
  const s = summarize(
    history,
    [],
    new Date('2026-11-01T00:00:00Z'),
    new Date('2026-11-03T00:00:00Z'),
  );
  expect(s.solo.sessions).toBe(3);
  expect(s.solo.routerOnly).toBe(2);
  expect(s.solo.neverStarted).toHaveLength(14);
  expect(new Set(s.solo.neverStarted).size).toBe(14);
  expect(s.solo.neverStarted).not.toContain('solo-build-change');
  expect(s.solo.neverStarted).toContain('solo-verify-change');
  expect(s.solo.neverStarted.every((name) => name.startsWith('solo-'))).toBe(true);
  expect(s.lists.skills.map((row) => row.name)).toEqual(
    history.map((row) => row.attrs['skill.name'] as string),
  );
  expect(JSON.stringify(history)).toBe(before);
});

test('the dashboard adds Codex and hook-log runs per host without counting a run twice', () => {
  const codex: UsageRecord[] = [
    {
      time: '2026-11-02T11:00:00Z',
      name: 'skill_invocation',
      host: 'codex',
      attrs: {
        'session.id': 'c1',
        'skill.name': 'solo-plan-change',
        'skill.invocation_type': 'implicit',
        'skill.plugin_id': 'sidecut-solo',
      },
    },
    {
      time: '2026-11-02T11:01:00Z',
      name: 'sse_event',
      host: 'codex',
      attrs: {
        'session.id': 'c1',
        model: 'gpt-6.1-sol',
        'event.kind': 'response.completed',
        input_token_count: '500',
        output_token_count: '100',
        cached_token_count: '300',
      },
    },
  ];
  const run = (host: string, skill: string) => ({
    time: '2026-11-02T12:00:00Z',
    plugin: 'sidecut-solo',
    skill,
    host,
  });
  // Both hosts are in the export, so the hook log adds nothing.
  const both = summarize(
    [...records, ...codex],
    [],
    new Date('2026-10-01T00:00:00Z'),
    new Date('2026-11-04T00:00:00Z'),
    [run('codex', 'solo-plan-change'), run('claude-code', 'solo-build-change')],
  );
  expect(both.totals.skills).toBe(2);
  expect(both.lists.skills.map((r) => r.name)).toContain('sidecut-solo:solo-plan-change');
  expect(both.lists.tokensByModel[0]).toMatchObject({ name: 'gpt-6.1-sol', value: 600 });
  expect(both.lists.hosts.map((r) => r.name).sort()).toEqual(['Claude Code', 'Codex']);
  expect(both.lists.hosts.find((r) => r.name === 'Codex')?.detail).toContain('no cost sent');
  // Only Claude Code is exported, so the Codex hook-log run counts and the Claude one doesn't.
  const claudeOnly = summarize(
    records,
    [],
    new Date('2026-10-01T00:00:00Z'),
    new Date('2026-11-04T00:00:00Z'),
    [run('codex', 'solo-verify-change'), run('claude-code', 'solo-build-change')],
  );
  expect(claudeOnly.totals.skills).toBe(2);
  expect(
    claudeOnly.lists.skills.find((r) => r.name === 'sidecut-solo:solo-verify-change'),
  ).toMatchObject({ value: 1, detail: 'codex skill log 1' });
  expect(claudeOnly.solo.neverStarted).not.toContain('solo-verify-change');
  expect(dashboardPage(both)).toContain('Codex sends tokens but no cost');
});
