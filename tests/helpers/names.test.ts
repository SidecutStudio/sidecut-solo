import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { cli, makeRepo } from './fixture.ts';

type Finding = { file: string; line: number; found: string; use: string };

function write(repo: string, path: string, text: string) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

function findings(repo: string): Finding[] {
  return JSON.parse(cli(['--repo', repo, 'retired-names']).stdout).findings;
}

describe('retired-names', () => {
  test('reports the old plugin, repository, helper and skill names a renamed Solo left behind', () => {
    const { repo } = makeRepo();
    // The stale files a project kept after Solo Workflow became Sidecut Solo.
    write(
      repo,
      '.agents/plugins/marketplace.json',
      JSON.stringify(
        {
          name: 'solo-workflow',
          plugins: [
            {
              name: 'solo-workflow',
              source: {
                url: 'https://github.com/SidecutStudio/solo-workflow.git',
                path: './plugins/solo-workflow',
              },
            },
          ],
        },
        null,
        2,
      ),
    );
    write(
      repo,
      '.claude/hooks/session-start.sh',
      "grep -q '\"solo-workflow@' installed_plugins.json\n" +
        'echo "run bun $HOME/solo-workflow/plugins/solo-workflow/scripts/solo.ts --repo ."\n',
    );
    write(
      repo,
      'docs/agent-tooling.md',
      'Use `dogfood` only when asked.\n' +
        'A problem only this repo has goes through `improve-workflow`.\n' +
        'Run the `solo-workflow-review-change` skill, then `solo-decide`.\n',
    );
    write(
      repo,
      'docs/paths.md',
      'See .claude/solo-workflow notes and docs/solo-workflow.md, then the `solo-unknown` skill.\n' +
        'Read https://github.com/SidecutStudio/solo-workflow/blob/main/README.md and ~/.claude/plugins/cache/solo-workflow/x/.\n',
    );
    const found = findings(repo);
    const at = (file: string) =>
      found.filter((row) => row.file === file).map((row) => [row.line, row.found, row.use]);

    expect(at('.agents/plugins/marketplace.json')).toEqual([
      [2, 'solo-workflow', 'sidecut-solo (plugin) or solo (router skill)'],
      [5, 'solo-workflow', 'sidecut-solo (plugin) or solo (router skill)'],
      [7, 'SidecutStudio/solo-workflow', 'SidecutStudio/sidecut-solo'],
      [8, 'solo-workflow', 'sidecut-solo (plugin) or solo (router skill)'],
    ]);
    expect(at('.claude/hooks/session-start.sh').map(([line, name]) => [line, name])).toEqual([
      [1, 'solo-workflow'],
      [2, 'solo-workflow'],
      [2, 'solo-workflow'],
      [2, 'scripts/solo.ts'],
    ]);
    expect(at('.claude/hooks/session-start.sh')[3]?.[2]).toBe(
      'plugins/sidecut-solo/server/data/helper/solo',
    );
    expect(at('docs/paths.md')).toEqual([
      [1, 'solo-workflow', 'sidecut-solo (plugin) or solo (router skill)'],
      [1, 'solo-workflow', 'sidecut-solo (plugin) or solo (router skill)'],
      [1, 'solo-unknown', 'a skill in this Solo version'],
      [2, 'SidecutStudio/solo-workflow', 'SidecutStudio/sidecut-solo'],
      [2, 'solo-workflow', 'sidecut-solo (plugin) or solo (router skill)'],
    ]);
    expect(at('docs/agent-tooling.md')).toEqual([
      [1, 'dogfood', 'solo-compare-plugin'],
      [2, 'improve-workflow', 'solo-prevent-mistake'],
      [3, 'solo-workflow-review-change', 'solo-review-change'],
      [3, 'solo-decide', 'solo-choose-approach'],
    ]);
  });

  test('leaves current names, settings files and ordinary words alone', () => {
    const { repo } = makeRepo();
    write(
      repo,
      'AGENTS.md',
      [
        '<!-- solo-workflow:start -->',
        '## Sidecut Solo',
        '',
        'Follow `solo-workflow.toml`. Use the relevant Solo skill, or `solo` to route the request.',
        'Keep overrides in `solo-workflow.local.toml`; task records live in `.git/solo-workflow/`.',
        'Use `solo-review-change`, with the `solo-reviewer` profile, then run `build` and `review`.',
        'The task queue picks up the `solo-ready` label; each skill writes `solo-workflow-owner`.',
        'Records live in $(git rev-parse --git-common-dir)/solo-workflow/ and $XDG_STATE_HOME/solo-workflow/.',
        'Task records live under solo-workflow/TASK in .git/solo-workflow/ and ~/.local/state/solo-workflow/.',
        'Replace only the existing solo-workflow marker block.',
        '<!-- solo-workflow:end -->',
        '',
      ].join('\n'),
    );
    write(repo, 'CHANGELOG.md', 'Renamed from Solo Workflow (`solo-workflow`).\n');
    write(repo, 'src/app.ts', '// Solo Workflow is not an instruction file\nexport {};\n');
    const result = JSON.parse(cli(['--repo', repo, 'retired-names']).stdout);
    expect(result.findings).toEqual([]);
    expect(result.note).toBeUndefined();
    expect(result.plugin).toMatchObject({
      name: 'sidecut-solo',
      repository: 'SidecutStudio/sidecut-solo',
      helper: 'plugins/sidecut-solo/server/data/helper/solo',
    });
    expect(result.plugin.skills).toContain('solo-configure-project');
  });
});
