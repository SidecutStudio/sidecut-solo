// Builds dist/sidecut-solo-<version>.zip, the same as a release, from plugins/sidecut-solo, or with --verify checks
// that the package would build cleanly without writing anything.

import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLUGIN, packageErrors, packageFiles } from '../tests/package-rules.ts';

const verifyOnly = process.argv.includes('--verify');
const errors = await packageErrors(PLUGIN);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const manifest = JSON.parse(await readFile(join(PLUGIN, '.codex-plugin', 'plugin.json'), 'utf8'));
const files = await packageFiles(PLUGIN);
if (verifyOnly) {
  console.log(`package ok: ${manifest.name} ${manifest.version}, ${files.length} files`);
  process.exit(0);
}
const out = join('dist', `sidecut-solo-${manifest.version}.zip`);
await mkdir('dist', { recursive: true });
await rm(out, { force: true });
const stage = await mkdtemp(join(tmpdir(), 'solo-package-'));
try {
  await mkdir(join(stage, 'sidecut-solo'), { recursive: true });
  for (const file of files) {
    await mkdir(join(stage, 'sidecut-solo', file, '..'), { recursive: true });
    await copyFile(join(PLUGIN, file), join(stage, 'sidecut-solo', file));
  }
  execFileSync('zip', ['-qrX', join(process.cwd(), out), 'sidecut-solo'], { cwd: stage });
  const check = await packageErrors(join(stage, 'sidecut-solo'));
  if (check.length) throw new Error(check.join('\n'));
} finally {
  await rm(stage, { recursive: true, force: true });
}
console.log(`wrote ${out} (${files.length} files)`);
