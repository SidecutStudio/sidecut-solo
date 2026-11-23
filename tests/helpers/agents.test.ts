import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { cli, makeRepo } from './fixture.ts';

describe('codex-agents', () => {
  test('lists, installs missing profiles and never overwrites', () => {
    const { repo } = makeRepo();
    const before = JSON.parse(cli(['--repo', repo, 'codex-agents']).stdout);
    expect(before.profiles.map((row: { status: string }) => row.status)).toEqual([
      'missing',
      'missing',
      'missing',
      'missing',
    ]);
    expect(existsSync(join(repo, '.codex'))).toBe(false);
    mkdirSync(join(repo, '.codex/agents'), { recursive: true });
    writeFileSync(join(repo, '.codex/agents/solo-reviewer.toml'), 'name = "mine"\n');
    const installed = JSON.parse(cli(['--repo', repo, 'codex-agents', '--install']).stdout);
    const status = Object.fromEntries(
      installed.profiles.map((row: { profile: string; status: string }) => [
        row.profile,
        row.status,
      ]),
    );
    expect(status['solo-reviewer.toml']).toBe('different');
    expect(status['solo-investigator.toml']).toBe('installed now');
    expect(installed.note).toContain('left alone');
    expect(readFileSync(join(repo, '.codex/agents/solo-reviewer.toml'), 'utf8')).toBe(
      'name = "mine"\n',
    );
    const again = JSON.parse(cli(['--repo', repo, 'codex-agents']).stdout);
    expect(
      again.profiles.filter((row: { status: string }) => row.status === 'installed'),
    ).toHaveLength(3);
  });
});
