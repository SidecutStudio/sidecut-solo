// Keep repository profiles and protected paths aligned with the canonical build output.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const plugin = join(root, 'plugins', 'sidecut-solo');
const source = join(plugin, 'codex', 'agents');
const target = join(root, '.codex', 'agents');
const check = process.argv.includes('--check');
const names = readdirSync(source)
  .filter((f) => f.endsWith('.toml'))
  .sort();
let stale = false;
if (!check) mkdirSync(target, { recursive: true });
for (const name of names) {
  const wanted = readFileSync(join(source, name), 'utf8');
  const path = join(target, name);
  if (existsSync(path) && readFileSync(path, 'utf8') === wanted) continue;
  stale = true;
  if (!check) writeFileSync(path, wanted);
}
for (const name of readdirSync(target)) {
  if (!/^solo-workflow-(investigator|refuter|reviewer|verifier)\.toml$/.test(name)) continue;
  stale = true;
  if (!check) rmSync(join(target, name));
}
const settingsPath = join(root, 'solo-workflow.toml');
const settings = readFileSync(settingsPath, 'utf8');
const protectedPaths = names.flatMap((name) => [
  `plugins/sidecut-solo/codex/agents/${name}`,
  `.codex/agents/${name}`,
]);
const wantedSettings = settings
  .replace(
    /protected_paths = \[[\s\S]*?\]/,
    `protected_paths = [\n${protectedPaths.map((p) => `  ${JSON.stringify(p)},`).join('\n')}\n]`,
  )
  .replaceAll('plugins/solo-workflow/agents/', 'plugins/sidecut-solo/agents/');
if (settings !== wantedSettings) {
  stale = true;
  if (!check) writeFileSync(settingsPath, wantedSettings);
}
const workflowPath = join(plugin, 'server', 'data', 'workflows', 'review-change.js');
const workflow = readFileSync(workflowPath, 'utf8');
const roles = ['reviewer', 'refuter']
  .map((name) => {
    const body = readFileSync(join(plugin, 'agents', `${name}.md`), 'utf8')
      .replace(/^---\n[\s\S]*?\n---\n/, '')
      .trim();
    return `  [${name.toUpperCase()}]: ${JSON.stringify(body)},`;
  })
  .join('\n');
const wantedWorkflow = workflow
  .replace(/const ROLES = \{[\s\S]*?\n\}/, `const ROLES = {\n${roles}\n}`)
  .replaceAll("'solo-workflow:reviewer'", "'sidecut-solo:reviewer'")
  .replaceAll("'solo-workflow:refuter'", "'sidecut-solo:refuter'");
if (workflow !== wantedWorkflow) {
  stale = true;
  if (!check) writeFileSync(workflowPath, wantedWorkflow);
}
if (check && stale) {
  console.error(
    'Repository profiles, protected paths or workflow role mirrors are stale. Run npm run build.',
  );
  process.exit(1);
}
