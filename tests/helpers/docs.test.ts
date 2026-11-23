import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { anchors } from '../../plugins/sidecut-solo/server/src/helper/lib/docs.ts';
import { git } from '../../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import { cli, makeRepo, scratch } from './fixture.ts';

type Problem = { file: string; line: number; kind: string; found: string };

function write(repo: string, path: string, text: string) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

function check(repo: string, ...flags: string[]) {
  const run = cli(['--repo', repo, 'docs-check', ...flags]);
  return { code: run.code, ...JSON.parse(run.stdout) } as {
    code: number;
    ok: boolean;
    checked: string[];
    problems: Problem[];
  };
}

function project() {
  const { repo } = makeRepo();
  write(repo, 'package.json', JSON.stringify({ scripts: { test: 'vitest', 'e2e:local': 'x' } }));
  write(repo, 'actor/tests/capture.test.ts', '');
  write(repo, 'actor/package.json', JSON.stringify({ scripts: { build: 'x' } }));
  write(repo, 'src/lib/look.ts', '');
  write(repo, 'tests/look.test.ts', '');
  write(repo, 'scripts/build.sh', '');
  write(repo, '.gitignore', '.env.local\ndist-local/\n');
  write(
    repo,
    'docs/testing.md',
    '# Testing\n\n## Test IDs\n\n## Browser checks: e2e\n\n## Test IDs\n',
  );
  return repo;
}

describe('docs-check', () => {
  test('reports missing paths, broken links and anchors, unknown scripts and retired names', () => {
    const repo = project();
    write(
      repo,
      'AGENTS.md',
      [
        'Run `tests/capture.test.ts` and `actor/tests/capture.test.ts`.',
        'Read [testing](docs/testing.md#test-ids) and [gone](docs/gone.md).',
        'See [checks](docs/testing.md#browser-checks-e2e) and [nope](docs/testing.md#nothing-here).',
        'Then `bun run e2e:local` and `npm run lint`.',
        'Globs: `src/**/*.ts` and `scripts/*.ts`.',
        'Use the `dogfood` skill.',
        '```sh',
        'bun run not-a-script `missing/in/fence.ts`',
        '```',
        '',
      ].join('\n'),
    );
    const result = check(repo);
    expect(result.code).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.problems.map((p) => [p.line, p.kind, p.found])).toEqual([
      [1, 'path', 'tests/capture.test.ts'],
      [2, 'link', 'docs/gone.md'],
      [3, 'anchor', 'docs/testing.md#nothing-here'],
      [4, 'script', 'run lint'],
      [5, 'path', 'scripts/*.ts'],
      [6, 'retired-name', 'dogfood'],
    ]);
  });

  test('leaves existing, ignored, other-repo and historical paths alone', () => {
    const repo = project();
    write(
      repo,
      'docs/guide.md',
      [
        '# Guide',
        '',
        'Back to [AGENTS](../AGENTS.md), [here](#guide) and [IDs](testing.md#test-ids-1).',
        'Never commit `.env.local` or `actor/dist-local`; `src/lib/look.ts` is fine.',
        "other-repo's `scripts/github-settings.ts` applies it.",
        'Attach `ExampleOrg/other-repo` and read `src/other.ts` there.',
        '`src/old.css` deleted.',
        'From `actor/` run `bun run build`, with `TASK` placeholders like `src/TASK/x.ts`.',
        '',
      ].join('\n'),
    );
    write(repo, 'AGENTS.md', '# Agents\n');
    write(repo, 'CHANGELOG.md', 'Removed `src/never.ts`.\n');
    write(repo, 'node_modules/pkg/README.md', 'See `src/missing.ts`.\n');
    git(repo, ['add', '-A']);
    const result = check(repo);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
    expect(result.checked).toEqual(['AGENTS.md', 'docs/guide.md', 'docs/testing.md']);
  });

  test('reports lines with more than one sentence only when asked', () => {
    const repo = project();
    write(
      repo,
      'README.md',
      [
        '# Readme',
        '',
        'One sentence here, e.g. with an abbreviation, version 1.2 and `a. B` code.',
        'Two sentences. Here is the second.',
        '| A table. With cells. |',
        '- A list item ends. Another starts.',
        '',
      ].join('\n'),
    );
    expect(check(repo).problems).toEqual([]);
    expect(check(repo, '--one-sentence-per-line').problems.map((p) => [p.line, p.kind])).toEqual([
      [4, 'sentences'],
      [6, 'sentences'],
    ]);
  });

  test('underlined headings, links shown as code, odd manifests and long lines', () => {
    const repo = project();
    write(
      repo,
      'README.md',
      [
        'Title',
        '=====',
        '',
        'Sub part',
        '--------',
        '',
        'See [t](#title), [s](#sub-part), and write `[text](missing.md)` for a link.',
        'Read/Write mode keeps `src/gone.ts` checked.',
        `${']('.repeat(50_000)}`,
        '',
      ].join('\n'),
    );
    const started = Date.now();
    const result = check(repo);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result.problems.map((p) => [p.line, p.kind, p.found])).toEqual([
      [8, 'path', 'src/gone.ts'],
    ]);
    write(repo, 'package.json', '{bad');
    write(repo, 'AGENTS.md', 'Run `npm run anything`.\n');
    expect(check(repo).problems.filter((p) => p.kind === 'script')).toEqual([]);
  });

  test('checks every doc in a folder that is not a Git checkout', () => {
    const dir = scratch();
    write(dir, 'README.md', 'See [guide](docs/guide.md).\n');
    write(dir, 'docs/guide.md', 'Back to [missing](nowhere.md).\n');
    write(dir, 'node_modules/x/README.md', '[broken](no.md)\n');
    rmSync(join(dir, '.git'), { recursive: true, force: true });
    symlinkSync('..', join(dir, 'docs/loop'));
    const result = check(dir);
    expect(result.checked).toEqual(['README.md', 'docs/guide.md']);
    expect(result.problems.map((p) => [p.file, p.kind, p.found])).toEqual([
      ['docs/guide.md', 'link', 'nowhere.md'],
    ]);
  });

  test('builds heading anchors the way GitHub does', () => {
    const ids = anchors(
      '# Installing Sidecut Solo\n## What `solo` does?\n## Test IDs\n## Test IDs\n<a id="custom"></a>\n```\n# not a heading\n```\n',
    );
    expect([...ids]).toEqual([
      'installing-sidecut-solo',
      'what-solo-does',
      'test-ids',
      'test-ids-1',
      'custom',
    ]);
  });
});
