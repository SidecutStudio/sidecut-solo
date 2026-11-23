import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { runCommand } from '../process.ts';
import { cli, scratch } from './fixture.ts';

const LAUNCHER = join(
  import.meta.dirname,
  '..',
  '..',
  'plugins',
  'sidecut-solo',
  'server',
  'data',
  'helper',
  'solo',
);
const launch = (env: Record<string, string>, args: string[]) =>
  runCommand(['/bin/sh', LAUNCHER, ...args], { env });

test('the launcher runs without Bun or installed dependencies', () => {
  const home = scratch();
  mkdirSync(join(home, 'bin'));
  symlinkSync(process.execPath, join(home, 'bin', 'node'));
  const result = launch({ PATH: join(home, 'bin') + ':/usr/bin:/bin', HOME: home }, ['--help']);
  expect(result.status).toBe(0);
  expect(result.stdout.toString()).toContain('usage: sh server/data/helper/solo');
});

test('the launcher reports missing Node on PATH', () => {
  const result = launch({ PATH: scratch(), HOME: scratch() }, ['--help']);
  expect(result.status).toBe(127);
  expect(result.stderr.toString()).toContain('needs Node.js 24');
});

const EXAMPLES = join(LAUNCHER, '..', '..', 'examples');
test('the packaged helper runs QA with only Node.js installed', () => {
  const node = process.execPath;
  const home = scratch();
  mkdirSync(join(home, 'bin'));
  symlinkSync(node, join(home, 'bin', 'node'));
  const env = { PATH: `${join(home, 'bin')}:/usr/bin:/bin`, HOME: home };
  const scenario = join(EXAMPLES, 'fixture.scenario.json');
  const record = join(EXAMPLES, 'fixture.run.json');
  const checked = launch(env, ['qa-check', scenario, record]);
  expect(checked.stderr.toString()).toBe('');
  expect(checked.status).toBe(0);
  expect(checked.stdout.toString()).toContain('not a behavioral pass');
  const direct = runCommand([node, join(LAUNCHER, '..', 'solo.mjs'), 'qa-check', scenario, record]);
  expect(direct.status).toBe(0);
  expect(direct.stdout.toString()).toBe(cli(['qa-check', scenario, record]).stdout);

  // A finding written with `type` instead of `kind`, as an agent's first session record was.
  const broken = JSON.parse(readFileSync(record, 'utf8'));
  broken.findings[0].type = broken.findings[0].kind;
  delete broken.findings[0].kind;
  writeFileSync(join(home, 'broken.json'), JSON.stringify(broken));
  const rejected = launch(env, ['qa-check', scenario, join(home, 'broken.json')]);
  expect(rejected.status).toBe(1);
  expect(rejected.stderr.toString()).toContain('run $.findings[0].kind: required');

  const compared = launch(env, ['--repo', home, 'qa-compare', scenario, record, record]);
  expect(compared.status).toBe(1);
  expect(compared.stderr.toString()).toContain('comparison block');
});
