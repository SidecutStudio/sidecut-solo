import { expect, test } from 'vitest';
import {
  lastRecorded,
  logOnlyRuns,
  readRefusals,
  refusalReason,
  soloReport,
} from '../plugins/sidecut-solo/server/src/helper/lib/usage';
import { report, skillMinutes, toRecords } from '../scripts/usage';

type Attr = { key: string; value: { stringValue?: string; intValue?: string } };
const text = (key: string, value: string): Attr => ({ key, value: { stringValue: value } });
const int = (key: string, value: string): Attr => ({ key, value: { intValue: value } });
const resource = { attributes: [text('session.id', 's1'), text('user.email', 'me@example.com')] };
const at = '1793000000000000000';

const logs = {
  resourceLogs: [
    {
      resource,
      scopeLogs: [
        {
          logRecords: [
            {
              timeUnixNano: at,
              attributes: [
                text('event.name', 'skill_activated'),
                text('skill.name', 'solo-workflow:solo-build'),
                text('invocation_trigger', 'claude-proactive'),
                text('plugin.name', 'solo-workflow'),
              ],
            },
            {
              timeUnixNano: at,
              attributes: [
                text('event.name', 'tool_result'),
                text('tool_name', 'mcp__builder__list_projects'),
                text('success', 'false'),
                { key: 'duration_ms', value: { intValue: '120' } },
                text(
                  'tool_parameters',
                  '{"mcp_server_name":"builder","mcp_tool_name":"list_projects"}',
                ),
                text('tool_input', '{"query":"secret project"}'),
              ],
            },
            {
              timeUnixNano: at,
              attributes: [
                text('event.name', 'tool_result'),
                text('tool_name', 'Bash'),
                text('tool_parameters', '{"full_command":"curl -H \\"Authorization: x\\""}'),
              ],
            },
            {
              timeUnixNano: at,
              attributes: [text('event.name', 'user_prompt'), text('prompt', 'private words')],
            },
          ],
        },
      ],
    },
  ],
};

const metrics = {
  resourceMetrics: [
    {
      resource,
      scopeMetrics: [
        {
          metrics: [
            {
              name: 'claude_code.cost.usage',
              sum: {
                dataPoints: [
                  {
                    timeUnixNano: at,
                    asDouble: 0.25,
                    attributes: [text('skill.name', 'solo-workflow:solo-build')],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
};

test('usage keeps only allowlisted names and drops prompts, commands, inputs and identity', () => {
  const records = toRecords(logs);
  const stored = JSON.stringify(records);
  for (const leaked of ['me@example.com', 'secret project', 'Authorization', 'private words'])
    expect(stored).not.toContain(leaked);
  expect(records[1]?.attrs).toEqual({
    'session.id': 's1',
    tool_name: 'mcp__builder__list_projects',
    success: 'false',
    duration_ms: '120',
    mcp_server_name: 'builder',
    mcp_tool_name: 'list_projects',
  });
  expect(records[3]?.name).toBe('user_prompt');
  expect(records[3]?.attrs).toEqual({ 'session.id': 's1' });
});

test('usage report sums skills, MCP calls and cost in the window', () => {
  const records = [...toRecords(logs), ...toRecords(metrics)];
  const text = report(records, new Date(0));
  expect(text).toContain('1 sessions, $0.25 estimated cost');
  expect(text).toContain('solo-workflow:solo-build  claude-proactive 1');
  expect(text).toContain('builder list_projects  1 calls, 1 failed, 120 ms');
  expect(text).toContain('solo-workflow:solo-build  $0.25');
  expect(report(records, new Date())).toContain('0 sessions, $0.00');
});

test('skill run time runs from one skill to the next, or to the session end', () => {
  const rec = (time: string, name: string, skill?: string, session = 's1') => ({
    time,
    name,
    attrs: { 'session.id': session, ...(skill ? { 'skill.name': skill } : {}) },
  });
  const records = [
    rec('2026-10-30T10:00:00Z', 'skill_activated', 'solo-workflow:explore'),
    rec('2026-10-30T10:03:00Z', 'skill_activated', 'solo-workflow:solo-build'),
    rec('2026-10-30T10:09:00Z', 'tool_result'),
    rec('2026-10-30T11:00:00Z', 'skill_activated', 'solo-workflow:solo-build', 's2'),
    rec('2026-10-30T11:05:00Z', 'tool_result', undefined, 's2'),
  ];
  const mins = skillMinutes(records);
  expect(mins.get('solo-workflow:explore')).toEqual([3]);
  expect(mins.get('solo-workflow:solo-build')).toEqual([6, 5]);
  expect(report(records, new Date(0))).toContain(
    'solo-workflow:solo-build  median 5.5 min, longest 6.0 min, 2 runs',
  );
});

test('an idle gap ends a skill run, and the Solo section names unused skills and router-only sessions', () => {
  const rec = (time: string, name: string, skill?: string, session = 's1') => ({
    time,
    name,
    attrs: { 'session.id': session, ...(skill ? { 'skill.name': skill } : {}) },
  });
  const records = [
    rec('2026-10-30T10:00:00Z', 'skill_activated', 'solo-workflow:solo-build'),
    rec('2026-10-30T10:10:00Z', 'tool_result'),
    rec('2026-10-31T09:00:00Z', 'tool_result'),
    rec('2026-10-30T12:00:00Z', 'skill_activated', 'solo-workflow:solo-workflow', 's2'),
  ];
  expect(skillMinutes(records).get('solo-workflow:solo-build')).toEqual([10]);
  const text = soloReport(records, [], new Date(0));
  expect(text).toContain('sessions using Solo: 2');
  expect(text).toContain(
    'skills that never started: solo-choose-approach, solo-research-topic, solo-plan-change, solo-diagnose-problem, solo-check-status, solo-review-change, solo-review-design, solo-verify-change, solo-finish-change, solo-configure-project, solo-improve-workflow, solo-compare-plugin, solo-show-usage, solo-write-copy',
  );
  expect(text).toContain('only the router started (it may have done the work itself): 1');
  expect(text).toContain('desktop app reports typed');
  for (const [message, logged] of [
    [
      "No task record for 'x' at /a/b; run 3 times on abc1234",
      'No task record for … at … run … on …',
    ],
    [
      'Deleted nothing. acme-client-rebrand: no such local branch',
      'Deleted nothing. … no such local branch',
    ],
    ['git rev-parse --verify acme-secret-ref^{commit}: fatal', 'git … failed'],
    ['Deleted nothing. rebrand: no such local branch', 'Deleted nothing. … no such local branch'],
    [
      'remote state unverified: git ls-remote origin rebrand: fatal: Could not read',
      'remote state unverified: git … failed',
    ],
    ['gh: GraphQL: Could not resolve to a Repository with the name acme', 'gh … failed'],
    [`at /Users/Jane Doe/acme-app ghp_ABC123 ${'a'.repeat(64)} DEADBEEF1`, 'at …'],
  ] as const)
    expect(refusalReason(message)).toBe(logged);
});

test('the report says when usage was last recorded and warns once recording looks stopped', () => {
  const records = [
    { time: '2026-11-12T08:00:00Z', name: 'tool_result', attrs: {} },
    { time: '2026-11-14T22:26:00Z', name: 'tool_result', attrs: {} },
  ];
  expect(lastRecorded(records, new Date('2026-11-15T06:00:00Z'))).toBe(
    'Last recorded 2026-11-14 22:26 UTC',
  );
  expect(lastRecorded(records, new Date('2026-11-16T23:00:00Z'))).toBe(
    'Last recorded 2026-11-14 22:26 UTC, 2 days ago: recording may have stopped, so check that the usage receiver is running',
  );
  expect(soloReport(records, [], new Date(0), new Date('2026-11-16T23:00:00Z'))).toContain(
    'recording may have stopped',
  );
});

test('last recorded survives a huge log, bad times and a skewed clock', () => {
  const now = new Date('2026-11-16T23:00:00Z');
  const many = Array.from({ length: 1_000_000 }, (_, i) => ({
    time: new Date(Date.UTC(2026, 10, 14, 22, 0, 0) - i).toISOString(),
    name: 'tool_result',
    attrs: {},
  }));
  expect(lastRecorded(many, now)).toContain('Last recorded 2026-11-14 22:00 UTC, 2 days ago');
  const odd = [
    { time: 'not a time', name: 'tool_result', attrs: {} },
    { time: '2027-11-15T10:00:00Z', name: 'tool_result', attrs: {} },
    { time: '2026-11-14T22:26:00Z', name: 'tool_result', attrs: {} },
  ];
  expect(lastRecorded(odd, now)).toContain('2026-11-14 22:26 UTC, 2 days ago');
  expect(lastRecorded([odd[0] as (typeof odd)[number]], now)).toBe(
    'Last recorded: no event with a valid past time',
  );
});

test('with SOLO_HELPER_LOG=off, usage reads no refusal log and says the log is off', () => {
  const previous = process.env.SOLO_HELPER_LOG;
  process.env.SOLO_HELPER_LOG = 'off';
  try {
    expect(readRefusals()).toEqual([]);
    const text = soloReport([], [], new Date(0));
    expect(text).toContain('Helper refusals: not recorded, the log is off (SOLO_HELPER_LOG=off)');
    expect(text).not.toContain('from off');
  } finally {
    if (previous === undefined) delete process.env.SOLO_HELPER_LOG;
    else process.env.SOLO_HELPER_LOG = previous;
  }
});

test('Solo coverage normalizes historical skills across all install namespaces without rewriting evidence', () => {
  const aliases = [
    ['solo-workflow', 'solo'],
    ['solo-decide', 'solo-choose-approach'],
    ['solo-research', 'solo-research-topic'],
    ['solo-plan', 'solo-plan-change'],
    ['solo-build', 'solo-build-change'],
    ['solo-troubleshoot', 'solo-diagnose-problem'],
    ['solo-status', 'solo-check-status'],
    ['solo-review', 'solo-review-change'],
    ['solo-design-review', 'solo-review-design'],
    ['solo-verify', 'solo-verify-change'],
    ['solo-finish', 'solo-finish-change'],
    ['solo-setup', 'solo-configure-project'],
    ['solo-improve-workflow', 'solo-improve-workflow'],
    ['solo-dogfood', 'solo-compare-plugin'],
  ];
  for (const namespace of ['solo-workflow', 'sidecut-solo-workflow', 'sidecut-solo']) {
    for (const nameIndex of [0, 1, 2]) {
      const generations = aliases.map(([oldName, current]) => [
        oldName,
        current,
        current === 'solo' ? 'solo-workflow' : current?.replace(/^solo-/, 'solo-workflow-'),
      ]);
      const records = generations.map((names) => ({
        time: '2026-10-30T10:00:00Z',
        name: 'skill_activated',
        attrs: { 'session.id': 'history', 'skill.name': `${namespace}:${names[nameIndex]}` },
      }));
      const before = JSON.stringify(records);
      const text = soloReport(records, [], new Date(0));
      expect(text).toContain('sessions using Solo: 1');
      // solo-show-usage and solo-write-copy are new, so no historical name maps to them.
      expect(text).toContain('skills that never started: solo-show-usage, solo-write-copy');
      expect(text).toContain('only the router started (it may have done the work itself): 0');
      expect(text).toContain(`${namespace}:${generations[4]?.[nameIndex]}`);
      expect(JSON.stringify(records)).toBe(before);
    }
  }
  const foreign = soloReport(
    [
      {
        time: '2026-10-30T10:00:00Z',
        name: 'skill_activated',
        attrs: {
          'session.id': 'other',
          'skill.name': 'another-plugin:solo-build',
        },
      },
    ],
    [],
    new Date(0),
  );
  expect(foreign).toContain('sessions using Solo: 0');
  expect(foreign).toContain('solo-build-change');
});

const codexLogs = {
  resourceLogs: [
    {
      resource: { attributes: [text('service.name', 'codex_cli_rs')] },
      scopeLogs: [
        {
          logRecords: [
            ['codex.skill_invocation', 'explicit', 'solo-build-change'],
            ['codex.skill_invocation', 'implicit', 'solo-review-change'],
          ]
            .map(([event, type, skill]) => ({
              timeUnixNano: at,
              attributes: [
                text('event.name', event as string),
                text('conversation.id', 'c1'),
                text('app.version', '0.165.0'),
                text('model', 'gpt-6.1-sol'),
                text('user.email', 'me@example.com'),
                text('user.account_id', 'acct-123'),
                text('skill.name', skill as string),
                text('skill.invocation_type', type as string),
                text('skill.plugin_id', 'sidecut-solo@sidecut'),
                text('turn.id', 't1'),
              ],
            }))
            .concat([
              {
                timeUnixNano: at,
                attributes: [
                  text('event.name', 'codex.tool_result'),
                  text('conversation.id', 'c1'),
                  text('user.email', 'me@example.com'),
                  text('tool_name', 'get_settings'),
                  text('mcp_server', 'solo'),
                  text('success', 'true'),
                  int('duration_ms', '40'),
                  text('arguments', '{"repo":"/Users/me/secret-repo"}'),
                  text('output', 'private tool output'),
                ],
              },
              {
                timeUnixNano: at,
                attributes: [
                  text('event.name', 'codex.tool_result'),
                  text('conversation.id', 'c1'),
                  text('tool_name', 'shell'),
                  text('arguments', '{"command":"curl -H \\"Authorization: x\\""}'),
                ],
              },
              {
                timeUnixNano: at,
                attributes: [
                  text('event.name', 'codex.sse_event'),
                  text('conversation.id', 'c1'),
                  text('event.kind', 'response.output_text.delta'),
                ],
              },
              {
                timeUnixNano: at,
                attributes: [
                  text('event.name', 'codex.sse_event'),
                  text('conversation.id', 'c1'),
                  text('model', 'gpt-6.1-sol'),
                  text('event.kind', 'response.completed'),
                  int('input_token_count', '1000'),
                  int('output_token_count', '200'),
                  int('cached_token_count', '600'),
                  int('reasoning_token_count', '50'),
                  text('model_reasoning_effort', 'medium'),
                ],
              },
            ]),
        },
      ],
    },
  ],
};

test('Codex events keep their host and only allowlisted fields, never email, arguments or output', () => {
  const records = toRecords(codexLogs);
  const stored = JSON.stringify(records);
  for (const leaked of [
    'me@example.com',
    'acct-123',
    'secret-repo',
    'private tool output',
    'Authorization',
    'codex_cli_rs',
    't1',
  ])
    expect(stored).not.toContain(leaked);
  // The streamed delta is dropped; only the completed response carries tokens.
  expect(records.map((r) => r.name)).toEqual([
    'skill_invocation',
    'skill_invocation',
    'tool_result',
    'tool_result',
    'sse_event',
  ]);
  expect(records.every((r) => r.host === 'codex')).toBe(true);
  expect(records[0]?.attrs).toEqual({
    'session.id': 'c1',
    model: 'gpt-6.1-sol',
    'skill.name': 'solo-build-change',
    'skill.invocation_type': 'explicit',
    'skill.plugin_id': 'sidecut-solo@sidecut',
  });
  expect(records[3]?.attrs).toEqual({ 'session.id': 'c1', tool_name: 'shell' });
  expect(toRecords(logs).every((r) => r.host === 'claude-code')).toBe(true);
});

test('the report covers both hosts, tokens by model and says cost is Claude Code only', () => {
  const records = [...toRecords(logs), ...toRecords(metrics), ...toRecords(codexLogs)];
  const text = report(records, new Date(0));
  expect(text).toContain(
    '2 sessions, $0.25 estimated cost (Claude Code only: Codex sends no cost)',
  );
  expect(text).toContain(
    'Codex  1 sessions, 2 skill runs, 2 tool calls, 1,200 tokens, no cost sent',
  );
  expect(text).toContain('Claude Code  1 sessions, 1 skill runs, 2 tool calls, 0 tokens, $0.25');
  expect(text).toContain('sidecut-solo:solo-build-change  explicit 1');
  expect(text).toContain('sidecut-solo:solo-review-change  implicit 1');
  expect(text).toContain('solo get_settings  1 calls, 0 failed, 40 ms');
  expect(text).toContain('gpt-6.1-sol  1,000 input, 200 output, 600 cached');
  const solo = soloReport(records, [], new Date(0));
  expect(solo).toContain('sessions using Solo: 2');
  expect(solo).toContain('implicit means picked up by the agent');
});

test('Codex events the report does not read are dropped on arrival', () => {
  const event = (name: string) => ({
    timeUnixNano: '1795000000000000000',
    attributes: [
      { key: 'event.name', value: { stringValue: name } },
      { key: 'conversation.id', value: { stringValue: 'c1' } },
    ],
  });
  const records = toRecords({
    resourceLogs: [
      {
        scopeLogs: [
          {
            logRecords: [
              event('codex.user_prompt'),
              event('codex.api_request'),
              event('codex.tool_result'),
            ],
          },
        ],
      },
    ],
  });
  expect(records.map((r) => r.name)).toEqual(['tool_result']);
});

test('a host with token or tool events but no skill runs keeps its hook-log runs', () => {
  const since = new Date('2026-11-01T00:00:00Z');
  const time = '2026-11-10T00:00:00Z';
  const records = [{ time, name: 'tool_result', attrs: {}, host: 'codex' }];
  const runs = [{ time, plugin: 'sidecut-solo', skill: 'solo', host: 'codex' }];
  expect(logOnlyRuns(records, runs, since)).toEqual(runs);
  const withSkill = [...records, { time, name: 'skill_invocation', attrs: {}, host: 'codex' }];
  expect(logOnlyRuns(withSkill, runs, since)).toEqual([]);
});
