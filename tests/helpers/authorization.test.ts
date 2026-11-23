import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveAuthorization } from '../../plugins/sidecut-solo/server/src/helper/lib/authorization.ts';
import scenarios from '../fixtures/delivery-scenarios.json';
import { cli, fakeGh, makeRepo } from './fixture.ts';

describe('authorization', () => {
  for (const scenario of scenarios.cases) {
    test(`scenario ${scenario.id}`, () => {
      const input = scenario.input;
      const result = resolveAuthorization(input.merge_policy, {
        userMerge: input.user_merge,
        userPublication: input.user_publication,
        publicationEffect: input.publication_effect,
        hostScope: input.host_scope,
      });
      const picked: Record<string, unknown> = Object.fromEntries(
        Object.keys(scenario.expected).map((key) => [key, result[key as keyof typeof result]]),
      );
      expect(picked).toEqual({ ...scenario.expected });
    });
  }

  test('unknown context does not erase existing task authorization', () => {
    const result = resolveAuthorization('ask', {
      userMerge: true,
      userPublication: false,
      publicationEffect: 'unknown',
      hostScope: 'unknown',
    });
    expect(result.missing_user_authorizations).toEqual([]);
    expect(result.unresolved).toHaveLength(2);
    expect(result.ready).toBe(false);
  });

  test('invalid inputs are refused', () => {
    expect(() =>
      resolveAuthorization('sometimes', {
        userMerge: true,
        userPublication: false,
        publicationEffect: 'none',
        hostScope: 'allowed',
      }),
    ).toThrow('Invalid authorization input');
  });

  for (const policy of ['ask', 'when-green']) {
    test(`merge with ${policy} enforces publication before touching the provider`, () => {
      const { repo, tmp } = makeRepo();
      writeFileSync(join(repo, 'solo-workflow.toml'), `merge = "${policy}"\n`);
      writeFileSync(join(tmp, 'review.json'), '{}');
      const calls = fakeGh([]);
      const result = cli([
        '--repo',
        repo,
        'merge',
        '1',
        '--authorized',
        '--review',
        join(tmp, 'review.json'),
        '--publication-effect',
        'automatic',
        '--host-scope',
        'allowed',
      ]);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('publishes a release the user has not allowed');
      expect(result.stderr).toContain('reviewer as same-agent, independent or user');
      expect(() => calls()).not.toThrow();
      expect(calls()).toEqual([]);
    });
  }

  test('authorization reads existing config and writes nothing', () => {
    const { repo } = makeRepo();
    writeFileSync(join(repo, 'solo-workflow.toml'), 'merge = "when-green"\n');
    // The project's files, not Git's own bookkeeping under .git.
    const files = () =>
      readdirSync(repo, { recursive: true })
        .map(String)
        .filter((f) => f !== '.git' && !f.startsWith('.git/'))
        .sort();
    const before = files();
    const result = cli([
      '--repo',
      repo,
      'authorization',
      '--publication-effect',
      'none',
      '--host-scope',
      'allowed',
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).ready).toBe(true);
    expect(files()).toEqual(before);
  });
});
