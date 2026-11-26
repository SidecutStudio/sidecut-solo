import { describe, expect, test } from 'vitest';
import { gate } from '../../plugins/sidecut-solo/server/src/helper/lib/delivery.ts';
import { cleanReview, cli, evidence, makeRepo } from './fixture.ts';

describe('gate', () => {
  for (const state of [
    'QUEUED',
    'PENDING',
    'SKIPPED',
    'CANCELLED',
    'FAILURE',
    'NEUTRAL',
    'TIMED_OUT',
    'ACTION_REQUIRED',
    '',
  ]) {
    test(`a ${state || 'blank'} check blocks`, () => {
      const data = evidence('abc');
      (data.required_checks[0] as { state: string }).state = state;
      expect(gate('abc', data, true, cleanReview('abc')).allowed).toBe(false);
    });
  }

  test('stale, missing and unauthorized checks block', () => {
    const review = cleanReview('abc');
    expect(gate('abc', evidence('abc'), true, review).allowed).toBe(true);
    for (const mutation of [
      { head: 'old' },
      { source: 'fixture' },
      { required_checks: [] },
      { observed_at: '2000-01-01T00:00:00+00:00' },
    ]) {
      expect(gate('abc', { ...evidence('abc'), ...mutation }, true, review).allowed).toBe(false);
    }
    expect(gate('abc', evidence('abc'), false, review).allowed).toBe(false);
    expect(gate('abc', evidence('abc'), true, { ...review, head: 'old' }).allowed).toBe(false);
    const duplicate = evidence('abc');
    duplicate.required_checks = [...duplicate.required_checks, ...duplicate.required_checks];
    expect(gate('abc', duplicate, true, review).allowed).toBe(false);
  });

  test('a review records findings and never approves', () => {
    const data = evidence('abc');
    const clean = cleanReview('abc');
    expect(gate('abc', data, true, clean).allowed).toBe(true);
    // A self-written approval doesn't count: reviewer and findings must be stated.
    const reasons = gate('abc', data, true, {
      head: 'abc',
      notes: 'review',
      verdict: 'approved',
    } as never).reasons;
    expect(reasons.some((reason) => reason.includes('reviewer'))).toBe(true);
    expect(reasons.some((reason) => reason.includes('blocking findings'))).toBe(true);
    for (const change of [
      { blocking_findings: 1 },
      { reviewer: 'self' },
      { blocking_findings: '0' },
      { blocking_findings: false },
    ]) {
      expect(gate('abc', data, true, { ...clean, ...change }).allowed).toBe(false);
    }
    expect(gate('abc', data, false, clean).reasons).toContain('merge authorization missing');
  });
});

describe('review fixes', () => {
  test('a timestamp without a timezone is invalid', () => {
    const data = { ...evidence('abc'), observed_at: new Date().toISOString().replace('Z', '') };
    expect(gate('abc', data, true, cleanReview('abc')).reasons).toContain(
      'CI observation time missing or invalid',
    );
  });

  for (const flag of ['--authorized=false', '--publication-authorized=0']) {
    test(`a flag with a value is refused: ${flag}`, () => {
      const { repo } = makeRepo();
      const result = cli([
        '--repo',
        repo,
        'authorization',
        flag,
        '--host-scope',
        'allowed',
        '--publication-effect',
        'none',
      ]);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('takes no value');
    });
  }

  test('a timed-out run returns promptly even if a descendant escapes the process group', () => {
    const { repo } = makeRepo();
    cli(['--repo', repo, '--task', 't', 'start', 'escape']);
    const started = Date.now();
    const result = cli([
      '--repo',
      repo,
      '--task',
      't',
      'run',
      '--key',
      'k',
      '--timeout',
      '1',
      '--',
      'sh',
      '-c',
      'perl -e "use POSIX; setsid(); sleep 8" &',
    ]);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).status).toBe('uncertain');
  });
});
