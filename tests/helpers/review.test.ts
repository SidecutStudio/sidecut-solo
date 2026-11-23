import { describe, expect, test } from 'vitest';
import {
  type ReviewLevel,
  reviewLevel,
} from '../../plugins/sidecut-solo/server/src/helper/lib/review.ts';

describe('review level', () => {
  const cases: [string, string[], number, ReviewLevel][] = [
    ['a dependency bump', ['package.json', 'package-lock.json'], 400, 'light'],
    ['a README and CHANGELOG edit', ['README.md', 'CHANGELOG.md'], 120, 'light'],
    ['a one-line fix', ['src/lib/format.ts'], 4, 'light'],
    [
      'an ordinary feature',
      ['src/lib/format.ts', 'src/lib/parse.ts', 'tests/format.test.ts'],
      180,
      'standard',
    ],
    ['a skill rewrite', ['plugins/x/skills/do-thing/SKILL.md'], 60, 'standard'],
    ['an AGENTS.md rule change', ['AGENTS.md', 'README.md'], 40, 'standard'],
    [
      'a React hooks folder',
      ['src/hooks/useThing.ts', 'src/hooks/useOther.ts', 'src/a.ts'],
      90,
      'standard',
    ],
    ['design tokens', ['src/styles/tokens.css', 'src/a.tsx', 'src/b.tsx'], 90, 'standard'],
    [
      'an example settings file',
      ['docs/examples/solo-workflow.toml', 'src/a.ts', 'src/b.ts'],
      60,
      'standard',
    ],
    [
      'a generated agent profile',
      ['.codex/agents/x-reviewer.toml', 'src/a.ts', 'src/b.ts'],
      60,
      'standard',
    ],
    ['host settings', ['.claude/settings.json'], 2, 'deep'],
    ['a sign-in change', ['src/auth/session.ts'], 6, 'deep'],
    ['an authentication helper', ['src/lib/authentication.ts'], 8, 'deep'],
    ['an authorization check', ['src/authorization.ts'], 8, 'deep'],
    ['a sign-in page', ['app/signin/page.tsx'], 8, 'deep'],
    ['token code', ['src/jwt.ts'], 8, 'deep'],
    ['an env file', ['.env.production'], 1, 'deep'],
    ['encryption', ['src/crypto.ts'], 8, 'deep'],
    ['a Codex agent profile', ['.codex/agents/x-reviewer.toml'], 4, 'standard'],
    ['a root hooks script', ['hooks/pre-commit.sh'], 3, 'deep'],
    ['code owners', ['.github/CODEOWNERS'], 2, 'deep'],
    ['an author page', ['src/author.ts', 'src/a.ts'], 40, 'standard'],
    ['a skill reference', ['plugins/x/skills/y/references/rules.md'], 6, 'standard'],
    ['a spec', ['plugins/x/server/data/specification.md'], 6, 'standard'],
    ['a package.json scripts edit', ['package.json'], 4, 'standard'],
    ['a small fix in two files', ['src/a.ts', 'src/b.ts'], 8, 'standard'],
    ['a payments page', ['app/billing/page.tsx', 'app/a.tsx', 'app/b.tsx'], 50, 'deep'],
    ['a migration', ['supabase/migrations/0007_add.sql'], 12, 'deep'],
    ['a CI workflow', ['.github/workflows/check.yml'], 3, 'deep'],
    ['a plugin hook', ['plugins/x/hooks/pre-tool-use-guard.mjs'], 2, 'deep'],
    ['the merge policy', ['solo-workflow.toml'], 1, 'deep'],
    ['a large rewrite', Array.from({ length: 41 }, (_, i) => `src/f${i}.ts`), 900, 'deep'],
    ['many changed lines', ['src/a.ts', 'src/b.ts', 'src/c.ts'], 1600, 'deep'],
  ];
  for (const [name, paths, lines, level] of cases) {
    test(name, () => expect(reviewLevel(paths, lines).level).toBe(level));
  }

  test('deep areas are named in the reasons', () => {
    expect(reviewLevel(['src/auth/a.ts', 'db/schema.sql'], 10).reasons).toEqual([
      'sign-in, accounts or secrets',
      'stored data',
    ]);
  });

  test('review = "deep" makes every change deep', () => {
    expect(reviewLevel(['README.md'], 2, 'deep').level).toBe('deep');
  });

  test('review = "light" keeps standard changes same-agent but never lowers a deep area', () => {
    expect(reviewLevel(['src/a.ts', 'src/b.ts', 'src/c.ts'], 200, 'light').level).toBe('light');
    expect(reviewLevel(['src/auth/a.ts'], 2, 'light').level).toBe('deep');
  });
});
