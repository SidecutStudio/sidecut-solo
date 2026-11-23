import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  readSkillRuns,
  shareLine,
  soloReport,
  type UsageRecord,
} from '../plugins/sidecut-solo/server/src/helper/lib/usage';

// The plugin's own skill hook: what it may store, and when it stores nothing at all.
const HOOK = join(
  import.meta.dirname,
  '..',
  'plugins',
  'sidecut-solo',
  'hooks',
  'post-tool-use-skill-log.mjs',
);
const SECRET = 'private-words-7f3a';

function run(input: object, extra: Record<string, string> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'skill-log-'));
  // A clean environment, so a CI runner's own variables don't switch the hook off.
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: home, ...extra };
  const done = spawnSync('node', [HOOK], { input: JSON.stringify(input), env, encoding: 'utf8' });
  const file = join(home, '.sidecut', 'skill-log.jsonl');
  return { status: done.status, file, text: existsSync(file) ? readFileSync(file, 'utf8') : '' };
}

const claudeSkill = {
  tool_name: 'Skill',
  tool_input: { skill: 'sidecut-solo:solo-build-change', args: `ship it ${SECRET}` },
  tool_response: { output: SECRET },
  cwd: `/home/me/${SECRET}`,
};
const codexRead = {
  tool_name: 'Bash',
  turn_id: 't1',
  tool_input: {
    command: `cat /opt/plugins/sidecut-solo/skills/solo-plan-change/SKILL.md && echo ${SECRET}`,
  },
};

test('the hook stores only time, plugin, skill and host, never arguments, output or paths', () => {
  for (const [input, host, skill] of [
    [claudeSkill, 'claude-code', 'solo-build-change'],
    [codexRead, 'codex', 'solo-plan-change'],
  ] as const) {
    const { status, text } = run(input);
    expect(status).toBe(0);
    expect(text).not.toContain(SECRET);
    const rows = text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(['host', 'plugin', 'skill', 'time']);
    expect(rows[0]).toMatchObject({ plugin: 'sidecut-solo', skill, host });
  }
});

test('the hook is on by default, and SIDECUT_SKILL_LOG=0, DO_NOT_TRACK and CI turn it off', () => {
  expect(run(claudeSkill).text).not.toBe('');
  const offs: Record<string, string>[] = [
    { SIDECUT_SKILL_LOG: '0' },
    { SIDECUT_SKILL_LOG: 'off' },
    { DO_NOT_TRACK: '1' },
    { CI: 'true' },
  ];
  for (const extra of offs) {
    const { status, text } = run(claudeSkill, extra);
    expect(status).toBe(0);
    expect(text).toBe('');
  }
});

test("the hook ignores another plugin's skills and skills this plugin doesn't ship", () => {
  for (const skill of ['other-plugin:solo-build-change', 'sidecut-solo:not-a-skill']) {
    expect(run({ ...claudeSkill, tool_input: { skill } }).text).toBe('');
  }
});

test('the hook never fails the session, even on input it cannot read', () => {
  const home = mkdtempSync(join(tmpdir(), 'skill-log-'));
  const done = spawnSync('node', [HOOK], {
    input: 'not json',
    env: { PATH: process.env.PATH ?? '', HOME: home },
    encoding: 'utf8',
  });
  expect(done.status).toBe(0);
});

const log = (rows: object[]) => {
  const file = join(mkdtempSync(join(tmpdir(), 'skill-log-')), 'skill-log.jsonl');
  writeFileSync(file, `${rows.map((r) => JSON.stringify(r)).join('\n')}\nnot json\n`);
  return file;
};

test('the usage report reads the hook log when there is no receiver export', () => {
  const runs = readSkillRuns(
    log([
      {
        time: '2026-11-16T10:00:00Z',
        plugin: 'sidecut-solo',
        skill: 'solo-build-change',
        host: 'claude-code',
      },
      {
        time: '2026-11-16T11:00:00Z',
        plugin: 'sidecut-solo',
        skill: 'solo-build-change',
        host: 'codex',
      },
      {
        time: '2026-11-16T12:00:00Z',
        plugin: 'solo-workflow',
        skill: 'solo-plan',
        host: 'claude-code',
      },
      { time: '2026-11-16T12:00:00Z', plugin: 'other-plugin', skill: 'build', host: 'claude-code' },
    ]),
  );
  expect(runs.map((r) => r.skill)).toEqual([
    'solo-build-change',
    'solo-build-change',
    'solo-plan-change',
  ]);
  const text = soloReport(
    [],
    [],
    new Date('2026-11-10T00:00:00Z'),
    new Date('2026-11-17T00:00:00Z'),
    runs,
  );
  expect(text).toContain('Skill log (3 runs');
  expect(text).toContain('solo-build-change  claude-code 1, codex 1');
  expect(text).toContain('skills that never started: solo, solo-choose-approach');
  expect(soloReport([], [], new Date('2026-11-10T00:00:00Z'), new Date(), [])).toContain(
    'unless SIDECUT_SKILL_LOG=0',
  );
});

test('the share line holds the version, the period and run counts only', () => {
  const since = new Date('2026-11-10T00:00:00Z');
  const runs = [
    {
      time: '2026-11-16T10:00:00Z',
      plugin: 'sidecut-solo',
      skill: 'solo-plan-change',
      host: 'codex',
    },
    {
      time: '2026-11-16T11:00:00Z',
      plugin: 'sidecut-solo',
      skill: 'solo-build-change',
      host: 'claude-code',
    },
    {
      time: '2026-11-16T12:00:00Z',
      plugin: 'sidecut-solo',
      skill: 'solo-build-change',
      host: 'claude-code',
    },
    {
      time: '2026-11-01T12:00:00Z',
      plugin: 'sidecut-solo',
      skill: 'solo-review-change',
      host: 'claude-code',
    },
  ];
  expect(shareLine([], runs, since, 7, '0.29.0')).toBe(
    'Sidecut Solo 0.29.0, last 7 days: solo-build-change 2, solo-plan-change 1',
  );
  const records: UsageRecord[] = [
    {
      time: '2026-11-16T10:00:00Z',
      name: 'skill_activated',
      attrs: { 'skill.name': 'sidecut-solo:solo-finish-change', 'repository.name': 'secret-repo' },
    },
    { time: '2026-11-16T10:00:00Z', name: 'claude_code.cost.usage', attrs: {}, value: 3.5 },
  ];
  const line = shareLine(records, runs, since, 1, '0.29.0');
  // The export covers Claude Code, so only the Codex hook-log run is added to it.
  expect(line).toBe('Sidecut Solo 0.29.0, last 1 day: solo-finish-change 1, solo-plan-change 1');
  expect(line).not.toContain('secret-repo');
  expect(shareLine([], [], since, 7, '0.29.0')).toBe(
    'Sidecut Solo 0.29.0, last 7 days: no skill runs recorded',
  );
});
