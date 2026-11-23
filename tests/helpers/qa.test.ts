import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  comparePair,
  pairProblems,
  runNotes,
  runProblems,
  schemaErrors,
} from '../../plugins/sidecut-solo/server/src/helper/lib/qa.ts';
import { runCommand } from '../process.ts';
import { cli } from './fixture.ts';

const QA = join(import.meta.dirname, '..', '..', 'plugins/sidecut-solo/server/data/qa');
const DOGFOOD = join(import.meta.dirname, '..', '..', 'plugins/sidecut-solo/server/data/qa');
const RECORDS = join(import.meta.dirname, '..', '..', 'dogfood');
// biome-ignore lint/suspicious/noExplicitAny: test documents are mutated freely.
type Json = any;

function documents(): [Json, Json] {
  return ['scenario', 'run'].map((kind) =>
    JSON.parse(readFileSync(join(QA, `../examples/fixture.${kind}.json`), 'utf8')),
  ) as [Json, Json];
}

function pair(): [Json, Json] {
  const [, first] = documents();
  const second = structuredClone(first);
  for (const [arm, run] of [
    ['with-plugin', first],
    ['without-plugin', second],
  ]) {
    run.comparison = { arm, pair_id: 'fixture', runs: 1, score: 1.0 };
    Object.assign(run.environment, {
      requested_model: 'fixture-model',
      resolved_model: 'fixture-model',
    });
  }
  return [first, second];
}

describe('QA records', () => {
  test('the saved example keeps its known-bad behavior', () => {
    const [scenario, run] = documents();
    expect(runProblems(scenario, run)).toEqual([]);
    expect(run.kind).toBe('regression');
    expect(run.status).toBe('fail');
  });

  test('templates match their schemas', () => {
    for (const kind of ['scenario', 'run']) {
      const schema = JSON.parse(readFileSync(join(QA, `${kind}.schema.json`), 'utf8'));
      const template = JSON.parse(readFileSync(join(QA, `${kind}.template.json`), 'utf8'));
      expect(schemaErrors(schema, template)).toEqual([]);
    }
  });

  for (const kind of ['missing', 'unknown', 'duplicate', 'version', 'summary']) {
    test(`rejects a misleading cross-document result: ${kind}`, () => {
      const [scenario, run] = documents();
      if (kind === 'missing') run.checks.pop();
      else if (kind === 'unknown') run.checks[0].id = 'not-in-scenario';
      else if (kind === 'duplicate') run.checks.push(structuredClone(run.checks[0]));
      else if (kind === 'version') run.scenario_version += 1;
      else run.status = 'pass';
      expect(runProblems(scenario, run).length).toBeGreaterThan(0);
    });
  }

  for (const [field, empty] of [
    ['observed', ''],
    ['evidence', []],
  ] as const) {
    test(`a pass or fail needs ${field}`, () => {
      const [scenario, run] = documents();
      for (const status of ['pass', 'fail']) {
        run.checks[0].status = status;
        run.checks[0][field] = empty;
        expect(runProblems(scenario, run).length).toBeGreaterThan(0);
      }
    });
  }

  for (const status of ['pass', 'fail', 'blocked', 'not_run']) {
    test(`summary status follows the checks: ${status}`, () => {
      const [scenario, run] = documents();
      run.findings = [];
      for (const check of run.checks) check.status = status;
      run.status = status;
      expect(runProblems(scenario, run)).toEqual([]);
      run.status = status === 'pass' ? 'blocked' : 'pass';
      expect(runProblems(scenario, run).length).toBeGreaterThan(0);
    });
  }

  test('the bundled fixture capture matches its subject and reproduces the defect', () => {
    const fixture = join(QA, '../examples/fixture.ts');
    const capture = JSON.parse(readFileSync(join(QA, '../examples/fixture.capture.json'), 'utf8'));
    const [, run] = documents();
    const digest = createHash('sha256').update(readFileSync(fixture)).digest('hex');
    expect(digest).toBe(capture.fixture_sha256);
    expect(run.subject.fingerprint).toBe(`sha256:${digest}`);
    const fresh = runCommand([process.execPath, fixture, '2', '3']);
    expect([fresh.status, fresh.stdout.toString(), fresh.stderr.toString()]).toEqual([
      capture.exit_code,
      capture.stdout,
      capture.stderr,
    ]);
    expect(fresh.stdout.toString()).not.toBe('5\n'); // A successful exit is still failing behavior.
  });

  for (const field of ['host', 'host_version', 'requested_model', 'resolved_model']) {
    test(`a comparison rejects a different ${field}`, () => {
      const [scenario] = documents();
      const [left, right] = pair();
      right.environment[field] = 'different';
      expect(pairProblems(scenario, left, right).some((error) => error.includes(field))).toBe(true);
      expect(comparePair(left, right)[0]).toContain('inconclusive');
    });
  }

  test('unknown identity is observable but inconclusive', () => {
    const [scenario] = documents();
    const [left, right] = pair();
    expect(comparePair(left, right)[0]).toContain('-> neither');
    for (const run of [left, right]) run.environment.resolved_model = null;
    expect(pairProblems(scenario, left, right)).toEqual([]);
    expect(comparePair(left, right)[0]).toContain('inconclusive');
  });

  test('qa-check and qa-compare work from the CLI', () => {
    const scenario = join(QA, '../examples/fixture.scenario.json');
    const run = join(QA, '../examples/fixture.run.json');
    const checked = cli(['qa-check', scenario, run]);
    expect(checked.code).toBe(0);
    expect(checked.stdout).toContain('not a behavioral pass');
    expect(cli(['qa-compare', scenario, run, run]).stderr).toContain('comparison block');
  });
});

test('subject field order does not decide whether a pair matches', () => {
  const [scenario] = documents();
  const [left, right] = pair();
  right.subject = Object.fromEntries(Object.entries(right.subject).reverse());
  expect(pairProblems(scenario, left, right)).toEqual([]);
  expect(comparePair(left, right)[0]).toContain('-> neither');
});

function session(): [Json, Json] {
  return ['scenario', 'run'].map((kind) =>
    JSON.parse(readFileSync(join(DOGFOOD, `session.${kind}.template.json`), 'utf8')),
  ) as [Json, Json];
}

describe('session records', () => {
  test('the session templates agree and are marked single-arm', () => {
    const [scenario, run] = session();
    expect(runProblems(scenario, run)).toEqual([]);
    expect(runNotes(run).join()).toContain('inconclusive');
  });

  test('the session run template shows the shape of a finding', () => {
    const [, run] = session();
    // One example finding with every field the schema requires, so the shape shows up front.
    expect(run.findings).toHaveLength(1);
    expect(Object.keys(run.findings[0]).sort()).toEqual([
      'check_id',
      'evidence',
      'id',
      'kind',
      'reproduce',
      'severity',
      'summary',
    ]);
  });

  test('a session must list its skills', () => {
    const [scenario, run] = session();
    run.skills = [];
    expect(runProblems(scenario, run).length).toBeGreaterThan(0);
    delete run.skills;
    expect(runProblems(scenario, run).length).toBeGreaterThan(0);
  });

  test('a session cannot be one arm of a pair', () => {
    const [scenario, run] = session();
    run.comparison = { arm: 'with-plugin', pair_id: 'x', runs: 1, score: null };
    expect(runProblems(scenario, run)).toContain(
      'A session record is single-arm; a with/without pair needs dogfood runs',
    );
  });

  test('the run invocation sums up its skills', () => {
    const [scenario, run] = session();
    run.skills.push({ ...run.skills[0], name: 'other', invocation: 'automatic' });
    expect(runProblems(scenario, run)).toContain(
      'Run invocation must be mixed to match its skills',
    );
    run.invocation = 'mixed';
    expect(runProblems(scenario, run)).toEqual([]);
    delete run.skills;
    run.kind = 'dogfood';
    expect(runProblems(scenario, run)).toContain('A mixed invocation needs a skills list');
  });

  test('regression and paired runs carry no single-arm note', () => {
    const [, run] = documents();
    expect(runNotes(run)).toEqual([]);
    expect(runNotes(pair()[0])).toEqual([]);
  });
});

describe('saved dogfood records', () => {
  const folders = existsSync(RECORDS)
    ? readdirSync(RECORDS, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    : [];
  for (const folder of folders) {
    test(`${folder.name} passes qa-check`, () => {
      const dir = join(RECORDS, folder.name);
      // A with/without pair saves one run per arm instead of run.json.
      const paired = existsSync(join(dir, 'with.run.json'));
      const runs = paired ? ['with.run.json', 'without.run.json'] : ['run.json'];
      for (const run of runs) {
        const checked = cli(['qa-check', join(dir, 'scenario.json'), join(dir, run)]);
        expect(checked.stderr).toBe('');
        expect(checked.code).toBe(0);
      }
      if (paired) {
        const compared = cli([
          'qa-compare',
          join(dir, 'scenario.json'),
          join(dir, 'with.run.json'),
          join(dir, 'without.run.json'),
        ]);
        expect(compared.stderr).toBe('');
        expect(compared.code).toBe(0);
      }
    });
  }
});
