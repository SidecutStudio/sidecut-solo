import {
  cp,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
  writeFile as writeTestFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { PLUGIN, packageErrors } from './package-rules.ts';

async function copy() {
  const dir = await mkdtemp(join(tmpdir(), 'solo-pkg-'));
  await cp(PLUGIN, join(dir, 'p'), { recursive: true });
  return { root: join(dir, 'p'), done: () => rm(dir, { recursive: true, force: true }) };
}

describe('package', () => {
  test('current package is valid', async () => {
    expect(await packageErrors(PLUGIN)).toEqual([]);
  });

  const breaks: [string, (root: string) => Promise<unknown>, string][] = [
    [
      'development-only eval',
      (r) => cp(join(r, 'README.md'), join(r, 'evals/prompt.md'), { recursive: true }),
      'development-only eval: evals/prompt.md',
    ],
    ['python file', (r) => writeFile(join(r, 'x.py'), ''), 'python file: x.py'],
    [
      'shared folder',
      (r) => cp(join(r, 'README.md'), join(r, 'shared/x.md'), { recursive: true }),
      'shared folder: shared/x.md',
    ],
    ['symlink', (r) => symlink('/tmp', join(r, 'escape')), 'symlink: escape'],
    [
      'manifest drift',
      async (r) => {
        const path = join(r, '.claude-plugin/plugin.json');
        const data = JSON.parse(await readFile(path, 'utf8'));
        await writeTestFile(path, JSON.stringify({ ...data, version: '9.9.9' }));
      },
      'manifests disagree on version',
    ],
    [
      'broken link',
      (r) => writeFile(join(r, 'README.md'), 'See [x](skills/nope/SKILL.md).\n'),
      'README.md: broken link skills/nope/SKILL.md',
    ],
  ];
  for (const [name, breakIt, error] of breaks) {
    test(`rejects ${name}`, async () => {
      const { root, done } = await copy();
      try {
        await breakIt(root);
        expect(await packageErrors(root)).toContain(error);
      } finally {
        await done();
      }
    });
  }
});

// Every file that sends the agent to the owner-input guide. Losing one of these pointers, or
// pointing one at a path the installed plugin doesn't have, fails here.
const OWNER_INPUT_POINTERS = [
  'skills/solo/SKILL.md',
  'skills/solo/references/helpers-and-hosts.md',
  'skills/solo-build-change/SKILL.md',
  'skills/solo-choose-approach/SKILL.md',
  'skills/solo-choose-approach/references/bake-off.md',
  'skills/solo-choose-approach/references/directions.md',
  'skills/solo-configure-project/SKILL.md',
  'skills/solo-diagnose-problem/SKILL.md',
  'skills/solo-finish-change/SKILL.md',
  'skills/solo-maintain-context/SKILL.md',
  'skills/solo-plan-change/SKILL.md',
  'skills/solo-research-topic/SKILL.md',
  'skills/solo-review-change/SKILL.md',
  'skills/solo-review-design/SKILL.md',
  'skills/solo-verify-change/SKILL.md',
  'skills/solo-write-copy/SKILL.md',
  'server/data/specification.md',
];

test.each(OWNER_INPUT_POINTERS)('%s points to the packaged owner-input guide', async (file) => {
  const text = await readFile(join(PLUGIN, file), 'utf8');
  // Skills name the guide from the plugin root; files beside it in server/data link it directly.
  const pointer = file.startsWith('server/data/')
    ? '](owner-input.md)'
    : '`server/data/owner-input.md` from the loaded plugin root';
  expect(text).toContain(pointer);
});

test('the packaged owner-input guide keeps both hosts and the permission rule', async () => {
  const guidance = await readFile(join(PLUGIN, 'server/data/owner-input.md'), 'utf8');
  expect(guidance).toContain('AskUserQuestion');
  expect(guidance).toContain('request_user_input');
  expect(guidance).toContain('cannot satisfy a separate plan approval');
});

test('every file naming the owner-input guide is in the pointer list', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(PLUGIN, { recursive: true })).filter(
    (f) => f.endsWith('.md') && !f.endsWith('owner-input.md') && !f.endsWith('CHANGELOG.md'),
  );
  const naming: string[] = [];
  for (const f of files)
    if ((await readFile(join(PLUGIN, f), 'utf8')).includes('owner-input.md')) naming.push(f);
  expect(naming.sort()).toEqual([...OWNER_INPUT_POINTERS].sort());
});

test('frontmatter that is not valid YAML is rejected', async () => {
  const { root, done } = await copy();
  try {
    await writeFile(
      join(root, 'skills/solo-plan-change/SKILL.md'),
      '---\nname: solo-plan-change\ndescription: >-\nnot indented\n---\n# Plan\n',
    );
    expect(await packageErrors(root)).toContain('solo-plan-change: missing frontmatter');
  } finally {
    await done();
  }
});

test('read-only preapprovals cannot include an unmentioned command', async () => {
  const { root, done } = await copy();
  try {
    const path = join(root, 'skills/solo-plan-change/SKILL.md');
    const text = await readFile(path, 'utf8');
    await writeFile(
      path,
      text.replace(
        'allowed-tools:\n',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the skill text carries this placeholder literally.
        'allowed-tools:\n  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" merge *)\n',
      ),
    );
    expect(
      (await packageErrors(root)).some((error) =>
        error.startsWith('solo-plan-change: allowed-tools must be '),
      ),
    ).toBe(true);
  } finally {
    await done();
  }
});
