import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { runCommand } from '../process.ts';
import { cli, makeRepo, scratch } from './fixture.ts';

test('each command has --help listing its options, and unknown options point to it', () => {
  const { repo } = makeRepo();
  for (const args of [
    ['merge', '--help'],
    ['help', 'merge'],
    ['merge', '1', '-h'],
  ]) {
    const result = cli(['--repo', repo, ...args]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('usage: sh server/data/helper/solo');
    expect(result.stdout).toContain('merge <pr> [--repo <path>] [--task <id>] [options]');
    expect(result.stdout).toContain('--reviewed-head <value>');
    expect(result.stdout).toContain('--reviewer <same-agent|independent|user>');
    expect(result.stdout).toContain('--require-check <value>  may repeat');
  }
  expect(cli(['checkpoint', '--help']).stdout).toContain('--next <value>  required');
  expect(cli(['checks', '--help']).stdout).toContain(
    '--reviewed-head <value>  full SHA you reviewed; fails if the PR head has moved off it',
  );
  // After `--`, --help belongs to the command `run` starts.
  expect(cli(['--repo', repo, 'run', '--key', 'k', '--', 'echo', '--help']).stdout).not.toContain(
    'usage:',
  );
  // As an option's value, or argv for `run` without `--`, -h and --help are not a help request.
  expect(
    cli(['--repo', repo, 'checkpoint', 'build', '--next', '-h', '--acceptance', 'x']).stdout,
  ).not.toContain('usage:');
  expect(cli(['--repo', repo, 'run', '--key', 'k2', 'echo', '--help']).stdout).not.toContain(
    'usage:',
  );
  const bad = cli(['--repo', repo, 'merge', '1', '--head', 'x']);
  expect(bad.code).toBe(2);
  expect(bad.stderr).toContain('unknown option --head; `merge --help` lists its options');
});

test('refusals go to the local helper log without paths or values, and usage groups them', () => {
  const { repo } = makeRepo();
  const log = join(scratch(), 'helper.jsonl');
  const env = {
    ...process.env,
    SOLO_HELPER_LOG: log,
    CLAUDE_USAGE_FILE: join(scratch(), 'none.jsonl'),
  };
  const run = (args: string[]) =>
    runCommand(
      [
        process.execPath,
        join(import.meta.dirname, '../../plugins/sidecut-solo/server/data/helper/solo.mjs'),
        ...args,
      ],
      {
        env,
      },
    );
  run(['--repo', repo, '--task', 'secret-name', 'resume']);
  run(['--repo', repo, 'merge', '1', '--head', 'abc1234def']);
  run(['--repo', repo, 'merge', '2', '--head', 'abc1234def']);
  const rows = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(rows.map((r) => r.command)).toEqual(['resume', 'merge', 'merge']);
  const text = JSON.stringify(rows);
  for (const leaked of [repo, 'secret-name', 'abc1234def']) expect(text).not.toContain(leaked);
  const out = run(['usage']).stdout.toString();
  expect(out).toContain('No Claude Code or Codex usage export');
  expect(out).toContain('Helper refusals (3');
  expect(out).toContain('2  merge: merge: unknown option --head');
  writeFileSync(log, '');
  expect(run(['usage', '--days', '1']).stdout.toString()).toContain('none recorded');
});
