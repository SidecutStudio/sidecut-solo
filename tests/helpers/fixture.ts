import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Disposable Git repos and a scripted `gh` for helper tests.
import { afterAll, afterEach } from 'vitest';
import { git } from '../../plugins/sidecut-solo/server/src/helper/lib/git.ts';
import { runCommand } from '../process.ts';

const SOLO = join(
  import.meta.dirname,
  '..',
  '..',
  'plugins',
  'sidecut-solo',
  'server',
  'data',
  'helper',
  'solo.mjs',
);

// Helper refusals in tests must not land in the developer's own log.
process.env.SOLO_HELPER_LOG = 'off';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A fresh temporary directory, removed after the test. */
export function scratch(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'solo-test-')));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

let template: string | undefined;
// A worker process outlives its test file, so the template goes when the file's tests finish.
afterAll(() => {
  if (template) rmSync(join(template, '..'), { recursive: true, force: true });
  template = undefined;
});

/** A repo on main with one commit holding calc.py (a known-bad add) and valuable.txt. */
export function makeRepo(): { repo: string; tmp: string } {
  const tmp = scratch();
  const repo = join(tmp, 'repo');
  // Built once per test file, then copied: a copy costs no git runs.
  cpSync(template ?? buildTemplate(), repo, { recursive: true, preserveTimestamps: true });
  return { repo, tmp };
}

function buildTemplate(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'solo-template-')));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Fixture']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  git(repo, ['config', 'core.hooksPath', '/dev/null']);
  writeFileSync(join(repo, 'calc.py'), 'def add(a, b):\n    return a - b\n');
  writeFileSync(join(repo, 'valuable.txt'), 'original\n');
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'fixture base']);
  template = repo;
  return repo;
}

export function commit(repo: string, name: string, text: string, message: string): void {
  writeFileSync(join(repo, name), text);
  git(repo, ['add', name]);
  git(repo, ['commit', '-m', message]);
}

type Reply = { stdout?: unknown; stderr?: string; code?: number; sleep?: number };
export type Rule = { args: string[]; replies: Reply[] };

/**
 * Puts a scripted `gh` first on PATH for this test. Each rule matches an argument prefix and
 * answers with its replies in order, repeating the last. Returns a function listing the calls.
 */
export function fakeGh(rules: Rule[]): () => string[][] {
  const dir = scratch();
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(dir, 'rules.json'), JSON.stringify(rules));
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh\nexec node ${JSON.stringify(join(import.meta.dirname, '..', 'probes', 'fake-gh.mjs'))} ${JSON.stringify(dir)} "$@"\n`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${bin}:${previous}`;
  cleanups.unshift(() => {
    process.env.PATH = previous;
  });
  return () =>
    runCommand(['cat', join(dir, 'calls.jsonl')])
      .stdout.toString()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
}

export function cli(args: string[], cwd?: string) {
  const result = runCommand([process.execPath, SOLO, ...args], {
    cwd,
    env: process.env,
  });
  return {
    code: result.status,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

const OPEN_PR = {
  headRefOid: 'abc',
  state: 'OPEN',
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
};

export function evidence(head: string) {
  return {
    head,
    source: 'live-gh',
    observed_at: new Date().toISOString(),
    pr: { ...OPEN_PR, headRefOid: head },
    required_checks: [{ name: 'tests', state: 'SUCCESS', bucket: 'pass' }],
  };
}

export function cleanReview(head: string) {
  return { head, reviewer: 'same-agent', blocking_findings: 0, notes: 'review' };
}
