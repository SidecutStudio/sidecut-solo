// Installs Solo's agent profiles into a project's .codex/agents/, which is the only place Codex
// loads project agents from. Never overwrites a file and never touches global config.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './config.ts';
import { pluginRoot } from './paths.ts';

const SOURCE = join(pluginRoot, 'codex', 'agents');

export function codexAgents(repo: string, install: boolean) {
  const target = join(repoRoot(repo), '.codex', 'agents');
  const profiles = readdirSync(SOURCE)
    .filter((name) => name.endsWith('.toml'))
    .sort();
  const rows = profiles.map((name) => {
    const wanted = readFileSync(join(SOURCE, name), 'utf8');
    const path = join(target, name);
    if (!existsSync(path)) return { profile: name, status: 'missing' };
    return {
      profile: name,
      status: readFileSync(path, 'utf8') === wanted ? 'installed' : 'different',
    };
  });
  if (install) {
    mkdirSync(target, { recursive: true });
    for (const row of rows.filter((item) => item.status === 'missing')) {
      writeFileSync(join(target, row.profile), readFileSync(join(SOURCE, row.profile)), {
        flag: 'wx',
      });
      row.status = 'installed now';
    }
  }
  return {
    directory: target,
    profiles: rows,
    note: rows.some((row) => row.status === 'different')
      ? 'Some profiles differ from this Solo version; they were left alone. Compare and decide.'
      : undefined,
  };
}
