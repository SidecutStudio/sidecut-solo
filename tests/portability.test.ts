// Solo is public, so what it ships and what a contributor reads have to work for someone with none
// of Sidecut Studio's private setup. This fails when one of those files names a private repo,
// another Sidecut product, Sidecut's own CI runners, a personal path or the maintainer's identity.
// Each allowance below says why that file may keep the name.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';

const root = join(import.meta.dirname, '..');
const plugin = 'plugins/sidecut-solo';

/** What people install, run or read: the plugin, repo scripts, docs, CI, examples and tests. */
const SCANNED = [
  'plugins/',
  'scripts/',
  'evals/',
  'dogfood/',
  'docs/',
  'tests/',
  '.github/',
  '.claude-plugin/',
  '.agents/',
  '.claude/settings.json',
  '.claude/hooks/',
  'README.md',
  'CHANGELOG.md',
  'AGENTS.md',
  'SECURITY.md',
  'RELEASING.md',
  'VOICE.md',
  'package.json',
  'solo-workflow.toml',
];

/** Built from sources this test reads, third-party notices, history and binary files. */
const SKIPPED = [
  `${plugin}/server/index.mjs`,
  `${plugin}/server/usage.html`,
  `${plugin}/server/data/helper/solo.mjs`,
  `${plugin}/server/THIRD_PARTY_LICENSES.txt`,
  `${plugin}/server/THIRD_PARTY_VIEW_LICENSES.txt`,
  `${plugin}/codex/agents/`,
  'tests/portability.test.ts',
];
const BINARY = /\.(png|woff2|ico)$/;

type Rule = { what: string; re: RegExp; allow?: { files: string[]; why: string } };

const RULES: Rule[] = [
  {
    what: 'a private Sidecut repo',
    re: /\bsidecut-(ops|plugins|rules|cookbook|builder|solo-dogfood)\b/i,
    allow: {
      files: ['AGENTS.md', 'package.json', 'RELEASING.md'],
      why: 'maintainer guidance says where the full dogfood records and the shared marketplace live',
    },
  },
  {
    what: 'another Sidecut product',
    re: /\b(Sidecut Builder|Next Role|next-role|Pair Board|pair-board|Lovable Workbench|Eval Bench|Reference Rebuild|Veyla)\b|\bbuilder:replicate\b/i,
  },
  {
    what: 'a SidecutStudio repo other than this one or its earlier name',
    re: /\bSidecut(Studio|Dev)\/(?!(sidecut-solo|solo-workflow|sidecut-agentskills)\b)[\w.-]+/,
  },
  {
    what: "Sidecut Studio's own CI runners",
    re: /\bsidecut-(linux-x64|light|ci|mac-\d+)\b|after-nine-mac|SIDECUT_(CI_APP_KEY|CI_CLIENT_ID|RUNNER_MODE)|runs-on:.*self-hosted/,
  },
  {
    what: 'a personal path',
    re: /[/\\]Users[/\\](?!me\b|someone\b|Jane Doe\b)[\w.-]+|~\/Developer\b|\/home\/(?!runner\b|me\b)[a-z][\w.-]*\//,
  },
  {
    what: 'an email address that is not a placeholder',
    re: /[\w.+-]+@(?!example\.(com|invalid)\b|users\.noreply\.github\.com\b|anthropic\.com\b)[\w-]+\.[a-z]{2,}\b/i,
    allow: {
      files: ['package.json'],
      why: 'package metadata may carry a public contact address',
    },
  },
];

// The maintainer's name and handles, hashed to keep them out of plain text here. Short names are
// easy to guess from a hash, so this hides nothing from someone determined; it only keeps the test
// from listing them.
const IDENTITY = new Set([
  '8297d40c4e87aad2',
  '9d87609a3584d3fc',
  'b60416ef877a6787',
  '7adf063491ac1201',
  '90df947fd21a60c1',
]);
const hash = (word: string) => createHash('sha256').update(word).digest('hex').slice(0, 16);

function under(file: string, prefixes: string[]): boolean {
  return prefixes.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p));
}

function scannedFiles(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => f && under(f, SCANNED) && !under(f, SKIPPED) && !BINARY.test(f))
    .filter((f) => {
      try {
        return statSync(join(root, f)).isFile();
      } catch {
        return false;
      }
    });
}

/** Every line of `text` that breaks a rule, as `label:line: what`. */
function findings(label: string, text: string, file = label): string[] {
  const out: string[] = [];
  text.split('\n').forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.allow && under(file, rule.allow.files)) continue;
      if (rule.re.test(line)) out.push(`${label}:${i + 1}: names ${rule.what}`);
    }
    for (const word of line.toLowerCase().match(/[a-z]+/g) ?? [])
      if (IDENTITY.has(hash(word))) out.push(`${label}:${i + 1}: names the maintainer`);
  });
  return out;
}

test('shipped and contributor files name nothing private', () => {
  const files = scannedFiles();
  expect(files.length).toBeGreaterThan(250);
  const out = files.flatMap((f) => findings(f, readFileSync(join(root, f), 'utf8')));
  expect(out).toEqual([]);
});

test('every rule catches what it is for', () => {
  const samples = [
    'Bundle it into sidecut-plugins.',
    'Copy it from SidecutStudio/sidecut-ops.',
    'Use the Sidecut Builder tokens.',
    'Pair Board picks it up.',
    'Clone SidecutStudio/next-role-lovable.',
    'runs-on: [self-hosted, sidecut-light]',
    'Clone it into ~/Developer/notes.',
    'See /Users/alex/notes.md.',
    'Write to alex@company.io.',
  ];
  for (const sample of samples)
    expect(findings('sample', sample).length, sample).toBeGreaterThan(0);
  for (const fine of [
    'Install it with /plugin marketplace add SidecutStudio/sidecut-solo.',
    'github:SidecutStudio/sidecut-agentskills#v1.2.0',
    'Settings live in solo-workflow.toml.',
    'Mail me@example.com from /Users/me/notes.md.',
  ])
    expect(findings('sample', fine), fine).toEqual([]);
});

test('each allowance still applies to a scanned file', () => {
  const files = new Set(scannedFiles());
  for (const path of RULES.flatMap((r) => r.allow?.files ?? []))
    expect(files.has(path), path).toBe(true);
});

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

test("the helper's commands name nothing private in a stranger's repo", () => {
  const repo = mkdtempSync(join(tmpdir(), 'solo-stranger-'));
  scratch.push(repo);
  const run = ([command = '', ...args]: string[]) =>
    execFileSync(command, args, {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, HOME: repo },
    });
  run(['git', 'init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'README.md'), '# Notes\n\nKeeps short notes beside your code.\n');
  writeFileSync(join(repo, 'AGENTS.md'), '# Agents\n\nRun `npm test`.\n');
  run(['git', 'add', '-A']);
  const helper = join(root, plugin, 'server/data/helper/solo');
  // Each command must succeed and print its own JSON, so a broken or renamed one that falls back
  // to printing usage fails here instead of passing as "no private names".
  const expected: Record<string, string> = {
    config: 'files',
    'retired-names': 'findings',
    'docs-check': 'problems',
    inventory: 'branches',
    'codex-agents': 'profiles',
  };
  for (const [command, key] of Object.entries(expected)) {
    const output = run(['sh', helper, command, '--repo', repo]);
    expect(JSON.parse(output), command).toHaveProperty(key);
    expect(findings(command, output, command)).toEqual([]);
  }
});
