import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { collectChecks, gate } from '../../plugins/sidecut-solo/server/src/helper/lib/delivery.ts';
import { cleanReview, cli, evidence, fakeGh, makeRepo, type Rule } from './fixture.ts';
import { NO_STATUSES, PR, PROTECTION, provider, restPr, runs } from './gh-replies.ts';

describe('checks', () => {
  test('a head change during collection blocks', () => {
    const { repo } = makeRepo();
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: restPr('old') }, { stdout: restPr('new') }] },
      { args: ['api', '--paginate', '--slurp'], replies: [{ stdout: runs(['tests', 'success']) }] },
      NO_STATUSES,
    ]);
    expect(() => collectChecks(repo, '1', ['tests'])).toThrow('head changed');
  });

  const REVIEWED = 'a'.repeat(40);
  const MOVED = 'b'.repeat(40);
  const atHead = (head: string): Rule[] => [
    { args: ['api', PR], replies: [{ stdout: restPr(head) }] },
    { args: ['api', '--paginate', '--slurp'], replies: [{ stdout: runs(['tests', 'success']) }] },
    NO_STATUSES,
  ];

  test('--reviewed-head passes when the PR head is the reviewed commit', () => {
    const { repo } = makeRepo();
    fakeGh(atHead(REVIEWED));
    const result = collectChecks(repo, '1', ['tests'], REVIEWED);
    expect(result.head).toBe(REVIEWED);
    expect(result.reviewed_head).toBe(REVIEWED);
    const shown = cli(['--repo', repo, 'checks', '1', '--reviewed-head', REVIEWED]);
    expect(shown.code).toBe(0);
    expect(JSON.parse(shown.stdout).reviewed_head).toBe(REVIEWED);
  });

  test('--reviewed-head refuses a PR whose head moved, before reading checks', () => {
    const { repo } = makeRepo();
    const calls = fakeGh(atHead(MOVED));
    expect(() => collectChecks(repo, '1', ['tests'], REVIEWED)).toThrow(
      `PR head moved: it is ${MOVED}, not the reviewed head ${REVIEWED}`,
    );
    expect(calls().some((args) => args.includes('--paginate'))).toBe(false);
    const shown = cli(['--repo', repo, 'checks', '1', '--reviewed-head', REVIEWED]);
    expect(shown.code).toBe(2);
    expect(shown.stderr).toContain('PR head moved');
  });

  for (const head of ['abc', 'A'.repeat(40), `${'a'.repeat(40)} `]) {
    test(`--reviewed-head refuses ${JSON.stringify(head)}, which isn't a full SHA`, () => {
      const { repo } = makeRepo();
      const calls = fakeGh(atHead(REVIEWED));
      expect(() => collectChecks(repo, '1', ['tests'], head)).toThrow('full commit SHA');
      expect(calls()).toEqual([]);
    });
  }

  for (const pr of ['--admin', '-1', '0', 'https://example.com/x/y/pull/1?token=bad']) {
    test(`refuses PR selector ${pr}`, () => {
      const { repo } = makeRepo();
      expect(() => collectChecks(repo, pr)).toThrow('positive number');
    });
  }

  test('local required checks cover unprotected repos and missing ones fail', () => {
    const { repo } = makeRepo();
    const calls = fakeGh(provider('abc'));
    const result = collectChecks(repo, '1', ['tests', 'lint']);
    expect(calls().some((args) => args.join(' ').includes('protection'))).toBe(false);
    expect(result.policy).toBe('local-require');
    expect(
      result.required_checks.filter((check: { name: string }) => check.name === 'lint'),
    ).toEqual([{ name: 'lint', state: 'MISSING', bucket: 'missing', link: '' }]);
    expect(
      gate(
        'abc',
        { ...evidence('abc'), required_checks: result.required_checks },
        true,
        cleanReview('abc'),
      ).allowed,
    ).toBe(false);
  });

  const matrix: [Record<string, string>, string[], string[]][] = [
    [{ 'solo-workflow.toml': '["tests"]' }, ['smoke'], ['tests', 'smoke']],
    [
      { 'solo-workflow.toml': '["obsolete"]', 'solo-workflow.local.toml': '["tests"]' },
      ['smoke'],
      ['tests', 'smoke'],
    ],
    [{ 'solo-workflow.toml': '["tests"]' }, [], ['tests']],
    [{}, ['tests', 'smoke'], ['tests', 'smoke']],
    [
      { 'solo-workflow.toml': '["tests", "tests"]' },
      ['tests', 'smoke', 'smoke'],
      ['tests', 'smoke'],
    ],
  ];
  for (const testsState of ['SUCCESS', 'FAILURE', 'MISSING']) {
    for (const [files, flags, expected] of matrix) {
      test(`extra checks add to repo requirements (${testsState}, ${JSON.stringify(files)} + ${flags})`, () => {
        const { repo } = makeRepo();
        for (const [name, list] of Object.entries(files))
          writeFileSync(join(repo, name), `required_checks = ${list}\n`);
        const saved = Object.fromEntries(
          Object.keys(files).map((name) => [name, readFileSync(join(repo, name), 'utf8')]),
        );
        const reported: [string, string][] = [['smoke', 'success']];
        if (testsState !== 'MISSING') reported.push(['tests', testsState.toLowerCase()]);
        fakeGh([
          { args: ['api', PR], replies: [{ stdout: restPr('abc') }] },
          { args: ['api', '--paginate', '--slurp'], replies: [{ stdout: runs(...reported) }] },
          NO_STATUSES,
        ]);
        const result = cli([
          '--repo',
          repo,
          'checks',
          '1',
          ...flags.flatMap((name) => ['--require-check', name]),
        ]);
        expect(result.code).toBe(0);
        const shown = JSON.parse(result.stdout);
        expect(new Set(shown.required_checks.map((check: { name: string }) => check.name))).toEqual(
          new Set(expected),
        );
        expect(shown.required_checks).toHaveLength(expected.length);
        expect(gate('abc', shown, true, cleanReview('abc')).allowed).toBe(testsState === 'SUCCESS');
        for (const [name, content] of Object.entries(saved))
          expect(readFileSync(join(repo, name), 'utf8')).toBe(content);
      });
    }
  }
});

describe('REST check data', () => {
  test('branch protection names the required checks', () => {
    const { repo } = makeRepo();
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: restPr('abc') }] },
      { args: ['api', PROTECTION], replies: [{ stdout: { contexts: ['tests'], checks: [] } }] },
      {
        args: ['api', '--paginate', '--slurp'],
        replies: [{ stdout: runs(['tests', 'success'], ['lint', 'failure']) }],
      },
      NO_STATUSES,
    ]);
    const result = collectChecks(repo, '1');
    expect(result.policy).toBe('branch-protection');
    expect(result.required_checks).toEqual([
      { name: 'tests', state: 'SUCCESS', bucket: 'pass', link: 'https://ci/tests' },
    ]);
    expect(gate('abc', result, true, cleanReview('abc')).allowed).toBe(true);
  });

  test('an unprotected branch with no local list blocks the gate', () => {
    const { repo } = makeRepo();
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: restPr('abc') }] },
      {
        args: ['api', PROTECTION],
        replies: [{ code: 1, stderr: 'gh: Branch not protected (HTTP 404)' }],
      },
      { args: ['api', '--paginate', '--slurp'], replies: [{ stdout: runs(['tests', 'success']) }] },
      NO_STATUSES,
    ]);
    const result = collectChecks(repo, '1');
    expect(result.required_checks).toEqual([]);
    expect(gate('abc', result, true, cleanReview('abc')).reasons).toContain(
      'required check set empty or unknown',
    );
  });

  test('running checks are pending and commit statuses count', () => {
    const { repo } = makeRepo();
    fakeGh([
      { args: ['api', PR], replies: [{ stdout: restPr('abc') }] },
      {
        args: ['api', '--paginate', '--slurp'],
        replies: [{ stdout: [{ check_runs: [{ name: 'tests', status: 'in_progress' }] }] }],
      },
      {
        args: ['api'],
        replies: [
          { stdout: { statuses: [{ context: 'deploy', state: 'success', target_url: 'u' }] } },
        ],
      },
    ]);
    const result = collectChecks(repo, '1', ['tests', 'deploy']);
    expect(result.required_checks).toEqual([
      { name: 'tests', state: 'IN_PROGRESS', bucket: 'pending', link: '' },
      { name: 'deploy', state: 'SUCCESS', bucket: 'pass', link: 'u' },
    ]);
    expect(gate('abc', result, true, cleanReview('abc')).allowed).toBe(false);
  });

  test('a conflicting or still-computing PR is not clean', () => {
    const { repo } = makeRepo();
    for (const mergeable of [false, null]) {
      fakeGh([
        { args: ['api', PR], replies: [{ stdout: restPr('abc', false, mergeable) }] },
        {
          args: ['api', '--paginate', '--slurp'],
          replies: [{ stdout: runs(['tests', 'success']) }],
        },
        NO_STATUSES,
      ]);
      const result = collectChecks(repo, '1', ['tests']);
      expect(gate('abc', result, true, cleanReview('abc')).reasons).toContain(
        'PR mergeability is not confirmed clean',
      );
    }
  });

  test('a PR URL on another host names that host and repo', () => {
    const { repo } = makeRepo();
    const calls = fakeGh([
      {
        args: ['api', '--hostname', 'git.example.com', 'repos/o/r/pulls/5'],
        replies: [{ stdout: restPr('abc') }],
      },
      {
        args: ['api', '--hostname', 'git.example.com', '--paginate'],
        replies: [{ stdout: runs(['tests', 'success']) }],
      },
      { args: ['api', '--hostname', 'git.example.com'], replies: [{ stdout: { statuses: [] } }] },
    ]);
    collectChecks(repo, 'https://git.example.com/o/r/pull/5', ['tests']);
    expect(calls()[1]?.at(-1)).toBe('repos/o/r/commits/abc/check-runs?per_page=100');
  });
});
