// Visual changes must reach Design review: the helper that spots them, and the skills that act on it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { git } from '../../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import { classify } from '../../plugins/sidecut-solo/server/src/helper/lib/surface.ts';
import { cli, commit, makeRepo } from './fixture.ts';

type Case = {
  id: string;
  files: string[];
  expected: { design_review: string; includes?: string[]; excludes?: string[] };
};
const SCENARIOS = join(import.meta.dirname, '..', 'fixtures', 'design-review-scenarios.json');
const { cases } = JSON.parse(readFileSync(SCENARIOS, 'utf8')) as { cases: Case[] };
const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'sidecut-solo');
const read = (path: string) => readFileSync(join(PLUGIN, path), 'utf8');

describe('user-facing changes', () => {
  for (const c of cases) {
    test(`${c.id}: design review ${c.expected.design_review}`, () => {
      const result = classify(c.files);
      expect(result.design_review as string).toBe(c.expected.design_review);
      const paths = result.user_facing.map((f) => f.path);
      for (const path of c.expected.includes ?? []) expect(paths).toContain(path);
      for (const path of c.expected.excludes ?? []) expect(paths).not.toContain(path);
    });
  }

  test('the helper reads a committed range and the working tree', () => {
    const { repo } = makeRepo();
    const base = git(repo, ['rev-parse', 'HEAD']);
    git(repo, ['checkout', '-b', 'redesign']);
    commit(repo, 'server.ts', 'export {};\n', 'backend only');
    const backend = JSON.parse(
      cli(['--repo', repo, 'user-facing', '--base', base, '--head', 'HEAD']).stdout,
    );
    expect(backend.design_review).toBe('not needed');
    mkdirSync(join(repo, 'src'));
    commit(repo, 'src/hero.tsx', 'export const Hero = () => null;\n', 'new hero');
    const range = JSON.parse(
      cli(['--repo', repo, 'user-facing', '--base', base, '--head', 'HEAD']).stdout,
    );
    expect(range.design_review).toBe('needed');
    expect(range.user_facing).toEqual([{ path: 'src/hero.tsx', reason: 'markup or components' }]);
    writeFileSync(join(repo, 'site.css'), 'body {}\n');
    const tree = JSON.parse(cli(['--repo', repo, 'user-facing', '--base', base]).stdout);
    expect(tree.head).toBe('working tree');
    expect(tree.user_facing.map((f: { path: string }) => f.path)).toEqual([
      'site.css',
      'src/hero.tsx',
    ]);
  });
});

test('from a subfolder, and with a component moved out of the UI', () => {
  const { repo } = makeRepo();
  const base = git(repo, ['rev-parse', 'HEAD']);
  mkdirSync(join(repo, 'src', 'components'), { recursive: true });
  mkdirSync(join(repo, 'lib'));
  commit(repo, 'src/components/My Button.tsx', 'export {};\n', 'button');
  const moved = git(repo, ['rev-parse', 'HEAD']);
  git(repo, ['mv', 'src/components/My Button.tsx', 'lib/button.ts']);
  git(repo, ['commit', '-m', 'move']);
  const rename = JSON.parse(
    cli(['--repo', repo, 'user-facing', '--base', moved, '--head', 'HEAD']).stdout,
  );
  expect(rename.user_facing.map((f: { path: string }) => f.path)).toEqual([
    'src/components/My Button.tsx',
  ]);
  writeFileSync(join(repo, 'src', 'new file.css'), 'a {}\n');
  const sub = JSON.parse(cli(['user-facing', '--base', base], join(repo, 'lib')).stdout);
  expect(sub.user_facing.map((f: { path: string }) => f.path)).toEqual(['src/new file.css']);
});

test('the deep-review workflow flags the same files as the helper', async () => {
  const source = readFileSync(
    join(PLUGIN, 'server', 'data', 'workflows', 'review-change.js'),
    'utf8',
  );
  const block = source.slice(
    source.indexOf('const NOT_SEEN_FILES'),
    source.indexOf('const seen ='),
  );
  const seen = new Function(`${block}; return f => !NOT_SEEN_FILES.some(re => re.test(f)) &&
    SEEN_FILES.some(([, res]) => res.some(re => re.test(f)))`)() as (f: string) => boolean;
  for (const c of cases)
    for (const path of c.files)
      expect([path, seen(path)]).toEqual([path, classify([path]).design_review === 'needed']);
});

describe('a visual change invoked through review gets the design pass', () => {
  test('design review is its own skill, and the method lives only there', () => {
    expect(read('skills/solo-review-design/SKILL.md')).toContain('name: solo-review-design');
    expect(existsSync(join(PLUGIN, 'skills/solo-review-code/references/design.md'))).toBe(false);
  });

  test('review checks for files people see and runs both reviews, or says design was skipped', () => {
    const review = read('skills/solo-review-code/SKILL.md');
    expect(review).toContain('solo user-facing');
    expect(review).toContain('solo-review-design');
    expect(review).toMatch(
      /Design not reviewed|design (?:was |is )?(?:not reviewed|unavailable)|unavailable.*design/i,
    );
    expect(review).toContain('## Done when');
    expect(review).toMatch(/design.*(?:coverage|review)|(?:coverage|review).*design/i);
  });

  test('the router, build, finish and the reviewer agent all send visual changes there', () => {
    for (const path of [
      'skills/solo/SKILL.md',
      'skills/solo-build-change/SKILL.md',
      'skills/solo-deliver-change/SKILL.md',
    ])
      expect(read(path)).toContain('solo-review-design');
    for (const path of ['agents/reviewer.md', 'codex/agents/solo-reviewer.toml'])
      expect(read(path)).toMatch(/rendered design (?:wasn't|was not) reviewed/);
  });
});
