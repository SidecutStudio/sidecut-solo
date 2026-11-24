// Finds names of retired Solo plugins, repositories, helper paths and skills in a project's
// instruction files, Codex marketplace file and hooks. Read-only. When Solo renames any of these,
// add the old name here so every project's next setup refresh reports it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { repoRoot } from './config.ts';
import { git } from './git.ts';
import { pluginRoot } from './paths.ts';
import { SOLO_SKILL_ALIASES } from './usage.ts';

/** Earlier skill names with no `solo-` prefix, from before the 0.10 rename. */
const BARE_SKILLS: Record<string, string> = {
  dogfood: 'solo-compare-plugin',
  'improve-workflow': 'solo-prevent-mistake',
  'design-review': 'solo-review-design',
  troubleshoot: 'solo-diagnose-problem',
  investigate: 'solo-diagnose-problem',
  explore: 'solo-research-topic',
  decide: 'solo-choose-approach',
  research: 'solo-research-topic',
  plan: 'solo-plan-change',
  build: 'solo-build-change',
  review: 'solo-review-change',
  verify: 'solo-verify-change',
  finish: 'solo-finish-change',
  setup: 'solo-configure-project',
  status: 'solo-list-work',
};
/** Bare names that are ordinary words, so reported only when written as a skill. */
const COMMON_WORDS = new Set([
  'explore',
  'decide',
  'research',
  'plan',
  'build',
  'review',
  'verify',
  'finish',
  'setup',
  'status',
]);
const RETIRED_PLUGINS = ['sidecut-solo-workflow', 'solo-workflow'];
const RETIRED_DISPLAY = ['Sidecut Solo Workflow', 'Solo Workflow'];
const RETIRED_HELPERS = ['scripts/solo.ts'];
// `solo-workflow` stays current in these: the settings files, the AGENTS.md marker block, the
// worktree owner file, and the task-record and log directories in Git's common directory and the
// state directory.
const CURRENT_AFTER = /^(?:\.toml|\.local\.toml|:start|:end|-owner| marker|\/(?:TASK|<task>))/;
const CURRENT_DIR = /(?:\.git\/|state\/|\)\/|_HOME\/|\$\{?[A-Z_]*STATE[A-Z_]*\}?\/)$/;

type Finding = { file: string; line: number; found: string; use: string };

function manifest() {
  const data = JSON.parse(readFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
  const name = String(data.name);
  const repository = String(data.repository ?? '')
    .replace(/^https:\/\/github\.com\//, '')
    .replace(/\.git$/, '');
  const skills = readdirSync(join(pluginRoot, 'skills')).filter((entry) =>
    existsSync(join(pluginRoot, 'skills', entry, 'SKILL.md')),
  );
  const agentDir = join(pluginRoot, 'codex', 'agents');
  const agents = (existsSync(agentDir) ? readdirSync(agentDir) : [])
    .filter((entry) => entry.endsWith('.toml'))
    .map((entry) => entry.replace(/\.toml$/, ''));
  const owner = repository.split('/')[0] || 'SidecutStudio';
  return {
    name,
    repository,
    owner,
    helper: `plugins/${name}/server/data/helper/solo`,
    skills,
    agents,
  };
}

/** Instruction files, the Codex marketplace file, hooks and Solo setup scripts, tracked or new. */
function candidates(root: string): string[] {
  let listed: string[];
  try {
    listed = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], false)
      .split('\0')
      .filter(Boolean);
  } catch {
    listed = ['AGENTS.md', 'CLAUDE.md', '.agents/plugins/marketplace.json'];
  }
  return [...new Set(listed)].filter((path) => {
    if (path.includes('node_modules/') || /(^|\/)CHANGELOG[^/]*$/i.test(path)) return false;
    // Solo's own bundled helper carries the retired-name tables.
    if (path.includes('/server/data/helper/')) return false;
    if (/^\.(agents|claude|codex)\//.test(path)) return true;
    if (path.endsWith('.md')) return true;
    return /solo/i.test(basename(path));
  });
}

function scan(text: string, current: ReturnType<typeof manifest>) {
  const known = new Set([...current.skills, ...current.agents]);
  const hits: { at: number; found: string; use: string }[] = [];
  const taken: [number, number][] = [];
  const add = (at: number, found: string, use: string) => {
    if (taken.some(([start, end]) => at < end && at + found.length > start)) return;
    taken.push([at, at + found.length]);
    hits.push({ at, found, use });
  };
  for (const [old, now] of SOLO_SKILL_ALIASES) {
    if (old === now || known.has(old) || RETIRED_PLUGINS.includes(old)) continue;
    for (const match of text.matchAll(new RegExp(`(?<![\\w/-])${old}(?![\\w-])`, 'g'))) {
      add(match.index, old, now);
    }
  }
  for (const old of RETIRED_PLUGINS) {
    for (const match of text.matchAll(new RegExp(`(?<![\\w-])${old}(?![\\w-])`, 'g'))) {
      const after = text.slice(match.index + old.length);
      const before = text.slice(Math.max(0, match.index - 60), match.index);
      if (CURRENT_AFTER.test(after)) continue;
      if (after.startsWith('/') && CURRENT_DIR.test(before)) continue;
      // OWNER/solo-workflow is the old repository when it is on GitHub or under Solo's own owner.
      const owner =
        /github\.com\/([\w.-]+)\/$/.exec(before)?.[1] ??
        new RegExp(`(?<![\\w./$-])(${current.owner})\\/$`).exec(before)?.[1];
      if (owner) {
        add(match.index - owner.length - 1, `${owner}/${old}`, current.repository);
      } else add(match.index, old, `${current.name} (plugin) or solo (router skill)`);
    }
  }
  for (const old of RETIRED_DISPLAY) {
    for (const match of text.matchAll(new RegExp(`\\b${old}\\b`, 'g'))) {
      add(match.index, old, 'Sidecut Solo');
    }
  }
  for (const old of RETIRED_HELPERS) {
    for (const match of text.matchAll(new RegExp(`(?<![\\w-])${old.replace('.', '\\.')}`, 'g'))) {
      add(match.index, old, current.helper);
    }
  }
  // A backticked bare name; an ordinary word or an unknown solo-* name counts only as
  // "the `name` skill".
  for (const match of text.matchAll(/`([a-z][a-z-]*[a-z])`( skill)?/g)) {
    const [, name = '', skill] = match;
    const old = BARE_SKILLS[name];
    if (old && (!COMMON_WORDS.has(name) || skill)) add(match.index, name, old);
    else if (skill && name.startsWith('solo-') && !known.has(name)) {
      add(match.index, name, 'a skill in this Solo version');
    }
  }
  return hits.map((hit) => ({
    line: text.slice(0, hit.at).split('\n').length,
    found: hit.found,
    use: hit.use,
  }));
}

export function retiredNames(repo: string) {
  const root = repoRoot(repo);
  const current = manifest();
  const files = candidates(root);
  const findings: Finding[] = [];
  for (const file of files) {
    const path = join(root, file);
    let text: string;
    try {
      if (!statSync(path).isFile() || statSync(path).size > 1_000_000) continue;
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    for (const hit of scan(text, current)) findings.push({ file, ...hit });
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return {
    plugin: {
      name: current.name,
      repository: current.repository,
      helper: current.helper,
      skills: current.skills,
    },
    scanned: files.length,
    findings,
    note: findings.length
      ? 'These name a retired Solo plugin, repository, helper path or skill. Replace each with the current name.'
      : undefined,
  };
}
