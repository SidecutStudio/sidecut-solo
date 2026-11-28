import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { load } from '../../plugins/sidecut-solo/server/src/helper/lib/config.ts';
import { cli, makeRepo, scratch } from './fixture.ts';

function write(repo: string, files: Record<string, string>) {
  for (const [name, content] of Object.entries(files)) writeFileSync(join(repo, name), content);
}

describe('settings', () => {
  beforeEach(() => vi.stubEnv('HOME', scratch()));
  afterEach(() => vi.unstubAllEnvs());

  test('a fresh repository offers setup and has neutral defaults', () => {
    const { repo } = makeRepo();
    const result = load(repo);
    expect(result.files).toEqual([]);
    expect(result.config).toEqual({});
    expect(result.problems).toEqual([]);
    expect(result.defaults).toEqual({
      merge: 'ask',
      merge_method: 'squash',
      worktrees: 'when-overlapping',
      review: 'auto',
      review_model: 'sonnet',
      review_effort: 'medium',
      deep_review_rounds: 3,
    });
    expect(result.setup_needed).toBe(true);
    expect(result.user_preferences).toBeUndefined();
    expect(result.hint).toContain('solo-configure-project');
  });

  test('the next run honours a saved choice to keep defaults', () => {
    const { repo } = makeRepo();
    write(repo, { 'solo-workflow.local.toml': '# Keep Solo defaults for this repository.\n' });
    const result = load(repo);
    expect(result.setup_needed).toBe(false);
    expect(result.files).toEqual(['solo-workflow.local.toml']);
    expect(result.defaults.merge).toBe('ask');
    expect(result.config).toEqual({});
  });

  test('a folder outside Git does not offer project setup', () => {
    expect(load(scratch()).setup_needed).toBe(false);
  });

  test('personal preferences apply without a project file, and project values take precedence', () => {
    const { repo } = makeRepo();
    const preferences = join(process.env.HOME as string, '.config', 'solo');
    mkdirSync(preferences, { recursive: true });
    write(preferences, {
      'preferences.toml':
        'review = "light"\nworktrees = "never"\nvoice_guide = "/example/voice.md"\n',
    });
    const fresh = load(repo);
    expect(fresh.setup_needed).toBe(false);
    expect(fresh.files).toEqual([]);
    expect(fresh.user_preferences).toBe(join(preferences, 'preferences.toml'));
    expect(fresh.config).toEqual({
      review: 'light',
      worktrees: 'never',
      voice_guide: '/example/voice.md',
    });

    write(repo, {
      'solo-workflow.toml':
        'review = "deep"\n[integrations]\nci = "Hosted CI"\nissue_tracker = "Team Tracker"\n',
      'solo-workflow.local.toml': 'voice_guide = ""\n[integrations]\nissue_tracker = "off"\n',
    });
    expect(load(repo).config).toEqual({
      review: 'deep',
      worktrees: 'never',
      voice_guide: '',
      integrations: { ci: 'Hosted CI', issue_tracker: 'off' },
    });
  });

  test('user preferences cannot change merge policy or enable integrations across projects', () => {
    const { repo } = makeRepo();
    const preferences = join(process.env.HOME as string, '.config', 'solo');
    mkdirSync(preferences, { recursive: true });
    write(preferences, {
      'preferences.toml': 'merge = "when-green"\n[integrations]\nci = "Hosted CI"\n',
    });
    const result = load(repo);
    expect(result.config).toEqual({});
    expect(result.defaults.merge).toBe('ask');
    expect(result.problems).toHaveLength(2);
  });

  test('defaults list only keys the files leave unset; invalid values fall back', () => {
    const { repo } = makeRepo();
    write(repo, { 'solo-workflow.toml': 'merge = "never"\nmerge_method = "Rebase"\n' });
    const result = load(repo);
    expect(result.config).toEqual({ merge: 'never' });
    expect(result.defaults).toEqual({
      merge_method: 'squash',
      worktrees: 'when-overlapping',
      review: 'auto',
      review_model: 'sonnet',
      review_effort: 'medium',
      deep_review_rounds: 3,
    });
    expect(result.hint).toBeUndefined();
  });

  test('review takes auto, deep or light', () => {
    const { repo } = makeRepo();
    write(repo, { 'solo-workflow.toml': 'review = "always"\nreview_model = "haiku"\n' });
    const result = load(repo);
    expect(result.config).toEqual({ review_model: 'haiku' });
    expect(result.problems.join(' ')).toContain("'review' must be one of auto, deep, light");
  });

  test('review settings cover both hosts and effort takes low, medium or high', () => {
    const { repo } = makeRepo();
    write(repo, {
      'solo-workflow.toml': 'codex_review_model = "gpt-6-luna"\nreview_effort = "low"\n',
    });
    const ok = load(repo);
    expect(ok.problems).toEqual([]);
    expect(ok.config).toEqual({ codex_review_model: 'gpt-6-luna', review_effort: 'low' });
    expect(ok.defaults.review_model).toBe('sonnet');
    expect(ok.defaults).not.toHaveProperty('codex_review_model');

    write(repo, { 'solo-workflow.toml': 'review_effort = "max"\n' });
    const bad = load(repo);
    expect(bad.config).toEqual({});
    expect(bad.defaults.review_effort).toBe('medium');
    expect(bad.problems.join(' ')).toContain("'review_effort' must be one of low, medium, high");
  });

  test('the local file wins and tables merge', () => {
    const { repo } = makeRepo();
    write(repo, {
      'solo-workflow.toml':
        'base_branch = "main"\nmerge = "ask"\n[checks]\ntest = "npm test"\nlint = "biome check ."\n',
      'solo-workflow.local.toml': 'merge = "when-green"\n[checks]\ntest = "npm test -- --bail=1"\n',
    });
    const result = load(repo);
    expect(result.files).toEqual(['solo-workflow.toml', 'solo-workflow.local.toml']);
    expect(result.config.merge).toBe('when-green');
    expect(result.config.checks).toEqual({ test: 'npm test -- --bail=1', lint: 'biome check .' });
  });

  test('reads from the repo root in a subdirectory', () => {
    const { repo } = makeRepo();
    write(repo, { 'solo-workflow.toml': 'base_branch = "trunk"\n' });
    mkdirSync(join(repo, 'src'));
    expect(load(join(repo, 'src')).config).toEqual({ base_branch: 'trunk' });
  });

  test('bad values are reported and dropped', () => {
    const { repo } = makeRepo();
    write(repo, {
      'solo-workflow.toml':
        'merge = "yolo"\ncolour = "red"\nrequired_checks = "ci"\nworktrees = "never"\nwhen = 1979-05-27\n[checks]\ntest = 1\n',
    });
    const result = load(repo);
    expect(result.config).toEqual({ worktrees: 'never' });
    expect(result.problems).toHaveLength(5);
  });

  for (const content of ['merge = \n', 'merge = [']) {
    test(`unreadable file is a problem, not a crash: ${JSON.stringify(content)}`, () => {
      const { repo } = makeRepo();
      write(repo, { 'solo-workflow.toml': content });
      const result = load(repo);
      expect(result.files).toEqual([]);
      expect(result.setup_needed).toBe(false);
      expect(result.problems.length).toBeGreaterThan(0);
    });
  }

  test('the local file overrides the committed one', () => {
    const { repo } = makeRepo();
    write(repo, {
      'solo-workflow.toml': 'merge = "when-green"',
      'solo-workflow.local.toml': 'merge = "never"',
    });
    const result = load(repo);
    expect(result.config.merge).toBe('never');
    expect(result.files).toEqual(['solo-workflow.toml', 'solo-workflow.local.toml']);
    expect(result.problems).toEqual([]);
  });

  test('retired settings file names are ignored', () => {
    const { repo } = makeRepo();
    write(repo, {
      'sidecut-workflows.toml': 'merge = "never"',
      'ship-properly.local.toml': 'merge = "never"',
    });
    const result = load(repo);
    expect(result.files).toEqual([]);
    expect(result.config.merge).toBeUndefined();
  });

  test('a directory named like the settings file is an error', () => {
    const { repo } = makeRepo();
    mkdirSync(join(repo, 'solo-workflow.toml'));
    expect(load(repo).problems.length).toBeGreaterThan(0);
  });

  test('broken settings block merge but not other commands', () => {
    const { repo, tmp } = makeRepo();
    write(repo, { 'solo-workflow.toml': 'merge = "Never"\n' });
    writeFileSync(join(tmp, 'review.json'), '{}');
    const blocked = cli([
      '--repo',
      repo,
      'merge',
      '1',
      '--authorized',
      '--review',
      join(tmp, 'review.json'),
    ]);
    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain('fix Sidecut Solo settings first');
    expect(cli(['--repo', repo, 'inventory']).code).toBe(0);
  });

  for (const name of ['solo-workflow.toml', 'solo-workflow.local.toml']) {
    test(`config command and merge = "never" veto from ${name}`, () => {
      const { repo, tmp } = makeRepo();
      write(repo, { [name]: 'merge = "never"\n' });
      expect(JSON.parse(cli(['--repo', repo, 'config']).stdout).config).toEqual({ merge: 'never' });
      writeFileSync(join(tmp, 'review.json'), '{}');
      const blocked = cli([
        '--repo',
        repo,
        'merge',
        '1',
        '--authorized',
        '--review',
        join(tmp, 'review.json'),
      ]);
      expect(blocked.code).toBe(2);
      expect(blocked.stderr).toContain('merge = "never"');
    });
  }
});
