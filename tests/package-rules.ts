// What makes plugins/sidecut-solo a valid package. Used by the package tests and scripts/package.ts.
import { lstat, readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';

export const PLUGIN = join(import.meta.dirname, '..', 'plugins', 'sidecut-solo');

const IGNORED = new Set(['.DS_Store']);

export async function packageFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (IGNORED.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else out.push(relative(root, path));
    }
  }
  await walk(root);
  return out.sort();
}

// Helper commands that never fetch, write or run anything. A skill pre-approves exactly the ones it names, command first,
// so the prompt still appears for anything that runs, pushes, merges or deletes.
const READ_ONLY = [
  'config',
  'retired-names',
  'docs-check',
  'inventory',
  'user-facing',
  'authorization',
  'merged',
  'checks',
  'gate',
  'report',
  'qa-check',
  'qa-compare',
];
const MENTION = /solo(?:\.ts)? (?:--(?:task|repo) \S+ )*([a-z][a-z-]+)/g;

function helperTool(command: string): string {
  return `Bash(sh "$${'{'}CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" ${command} *)`;
}

// The plugin's MCP tool for each read-only command that has one; a skill pre-approves it too, after
// the Bash forms.
const MCP_TOOL: Record<string, string> = {
  config: 'get_settings',
  inventory: 'get_work_state',
  'user-facing': 'get_user_facing_changes',
  merged: 'list_merged_branches',
  checks: 'get_pr_checks',
};
const mcpTool = (tool: string) => `mcp__plugin_sidecut-solo_solo__${tool}`;
// Every Solo MCP tool is read-only, so a skill that names one in backticks pre-approves it too, as
// sidecut-check's SKILL_ALLOWED_MCP_MISSING requires. get_usage has no helper command of its own.
const NAMED_TOOLS = [...Object.values(MCP_TOOL), 'get_usage'];
const BRAND = /^#[0-9A-F]{6}$/;

function frontmatter(text: string): Record<string, unknown> | null {
  // Hosts parse frontmatter as YAML; one that fails to parse loads with no metadata at all.
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match?.[1]) return null;
  try {
    const data = parseYaml(match[1]);
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function readJson(path: string, errors: string[]) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    errors.push(`cannot read ${path}`);
    return null;
  }
}

export async function packageErrors(root: string): Promise<string[]> {
  const errors: string[] = [];
  const files = await packageFiles(root);
  for (const file of files) {
    if (file.split('/')[0] === 'evals') errors.push(`development-only eval: ${file}`);
    if ((await lstat(join(root, file))).isSymbolicLink()) errors.push(`symlink: ${file}`);
    if (file.endsWith('.py') || file.includes('__pycache__')) errors.push(`python file: ${file}`);
    if (file.split('/').includes('shared')) errors.push(`shared folder: ${file}`);
  }

  const codex = await readJson(join(root, '.codex-plugin', 'plugin.json'), errors);
  const claude = await readJson(join(root, '.claude-plugin', 'plugin.json'), errors);
  if (codex && claude) {
    for (const key of ['name', 'version', 'description', 'license', 'repository'] as const) {
      if (codex[key] !== claude[key]) errors.push(`manifests disagree on ${key}`);
    }
    const prompts: unknown[] = codex.interface?.defaultPrompt ?? [];
    if (prompts.length > 3) errors.push('more than 3 default prompts');
    for (const prompt of prompts) {
      if (typeof prompt !== 'string' || prompt.length > 128) {
        errors.push('default prompt over 128 characters');
      }
    }
    const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8').catch(() => '');
    if (/^## \[([^\]]+)\]/m.exec(changelog)?.[1] !== codex.version) {
      errors.push(`CHANGELOG.md has no entry for ${codex.version}`);
    }
  }
  for (const required of ['README.md', 'LICENSE', 'CHANGELOG.md']) {
    if (!files.includes(required)) errors.push(`missing ${required}`);
  }

  const brand = codex?.interface?.brandColor;
  if (typeof brand !== 'string' || !BRAND.test(brand))
    errors.push('Codex manifest needs a brandColor');
  const skills = files.filter((f) => /^skills\/[^/]+\/SKILL\.md$/.test(f));
  for (const skill of skills) {
    const name = skill.split('/')[1] as string;
    // Skill names share one list across every installed plugin, and Codex's $name has no plugin
    // prefix, so each carries Solo's.
    if (name !== 'solo' && !name.startsWith('solo-'))
      errors.push(`${name}: skill name must start with solo-`);
    if (`sidecut-solo:${name}`.length > 64) errors.push(`${name}: plugin and skill name over 64`);
    const text = await readFile(join(root, skill), 'utf8');
    const meta = frontmatter(text);
    if (!meta) errors.push(`${name}: missing frontmatter`);
    else {
      if (meta.name !== name) errors.push(`${name}: frontmatter name is ${meta.name}`);
      const description = meta.description;
      if (typeof description !== 'string' || !description)
        errors.push(`${name}: missing description`);
      else if (description.length > 400) errors.push(`${name}: description over 400`);
      const own = files.filter((f) => f.startsWith(`skills/${name}/`) && f.endsWith('.md'));
      const named = new Set<string>();
      const namedTools = new Set<string>();
      for (const file of own) {
        const body = await readFile(join(root, file), 'utf8');
        for (const [, command] of body.matchAll(MENTION)) named.add(command as string);
        for (const tool of NAMED_TOOLS) if (body.includes(`\`${tool}\``)) namedTools.add(tool);
      }
      const commands = READ_ONLY.filter((c) => named.has(c));
      const expected = [
        ...commands.map(helperTool),
        ...commands.flatMap((c) => (MCP_TOOL[c] ? [mcpTool(MCP_TOOL[c])] : [])),
      ];
      for (const tool of NAMED_TOOLS)
        if (namedTools.has(tool) && !expected.includes(mcpTool(tool))) expected.push(mcpTool(tool));
      const tools = meta['allowed-tools'] ?? [];
      if (JSON.stringify(tools) !== JSON.stringify(expected))
        errors.push(`${name}: allowed-tools must be ${JSON.stringify(expected)}`);
    }
    errors.push(...(await agentMetadataErrors(root, name, text, brand)));
  }
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const text = await readFile(join(root, file), 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (!target || /^[a-z]+:/.test(target) || target.startsWith('/')) continue;
      const resolved = relative(root, join(root, dirname(file), target));
      if (resolved.startsWith('..')) errors.push(`${file}: link leaves the plugin: ${target}`);
      else if (!files.includes(resolved) && !files.some((f) => f.startsWith(`${resolved}/`))) {
        errors.push(`${file}: broken link ${target}`);
      }
    }
  }
  for (const agent of files.filter((f) => /^agents\/[^/]+\.md$/.test(f))) {
    const meta = frontmatter(await readFile(join(root, agent), 'utf8'));
    if (!meta?.name || !meta.description) errors.push(`${agent}: needs name and description`);
    if (!Array.isArray(meta?.tools) || meta.tools.length === 0)
      errors.push(`${agent}: needs an explicit tools list`);
  }
  for (const profile of files.filter((f) => /^codex\/agents\/[^/]+\.toml$/.test(f))) {
    try {
      const data = parseToml(await readFile(join(root, profile), 'utf8')) as Record<
        string,
        unknown
      >;
      for (const key of ['name', 'description', 'developer_instructions']) {
        if (typeof data[key] !== 'string') errors.push(`${profile}: missing ${key}`);
      }
    } catch {
      errors.push(`${profile}: invalid TOML`);
    }
  }
  return errors;
}

/** Codex's agents/openai.yaml for one skill, checked against its SKILL.md. */
async function agentMetadataErrors(root: string, name: string, skill: string, brand: unknown) {
  const errors: string[] = [];
  const path = join(root, 'skills', name, 'agents', 'openai.yaml');
  let data: { interface?: Record<string, unknown>; policy?: Record<string, unknown> };
  try {
    data = parseYaml(await readFile(path, 'utf8')) as typeof data;
  } catch {
    return [`${name}: missing or invalid agents/openai.yaml`];
  }
  const ui = data?.interface ?? {};
  const title = /^# (.+)$/m.exec(skill)?.[1];
  if (ui.display_name !== title) errors.push(`${name}: openai.yaml display_name is not "${title}"`);
  // Keep Codex metadata aligned with the house summary rather than a separately shortened claim.
  const description = frontmatter(skill)?.description;
  const summary = typeof description === 'string' ? `${description.split('. ')[0]}.` : null;
  if (typeof ui.short_description !== 'string' || ui.short_description !== summary)
    errors.push(`${name}: openai.yaml short_description must match the first description sentence`);
  const start = `Use $${name} to `;
  if (typeof ui.default_prompt !== 'string' || !ui.default_prompt.startsWith(start))
    errors.push(`${name}: openai.yaml default_prompt must start "${start}"`);
  if (ui.brand_color !== brand)
    errors.push(`${name}: openai.yaml brand_color differs from the manifest`);
  for (const key of Object.keys(data?.policy ?? {}))
    if (key !== 'allow_implicit_invocation') errors.push(`${name}: openai.yaml policy.${key}`);
  return errors;
}
