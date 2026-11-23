// Bundles the MCP server into plugins/sidecut-solo/server/index.mjs with every dependency inlined,
// builds the usage dashboard's MCP App view into server/usage.html, and writes the licence of each
// inlined package to server/THIRD_PARTY_LICENSES.txt. `--check` builds into a temporary folder and
// fails when a committed file differs.

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { dashboardApp } from '../plugins/sidecut-solo/server/src/helper/dashboard/page.ts';

const server = join(import.meta.dirname, '..', 'plugins', 'sidecut-solo', 'server');
const check = process.argv.includes('--check');
const out = check ? mkdtempSync(join(tmpdir(), 'solo-server-')) : server;
const meta = mkdtempSync(join(tmpdir(), 'solo-server-meta-'));

/** Each bundled package and the folder it came from (the last node_modules folder in its path). */
function packagesOf(inputs: string[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const path of inputs) {
    const last = [...path.matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g)].at(-1);
    if (last?.[1] && !found.has(last[1]))
      found.set(last[1], path.slice(0, (last.index ?? 0) + last[0].length));
  }
  return new Map([...found].sort(([a], [b]) => a.localeCompare(b)));
}

function licence(pkg: string, dir: string): string {
  const files = readdirSync(dir)
    .filter((f) => /^(licen[cs]e|copying)/i.test(f) && statSync(join(dir, f)).isFile())
    .sort();
  if (files.length)
    return `${pkg}\n\n${files.map((f) => readFileSync(join(dir, f), 'utf8').trim()).join('\n\n')}\n`;
  const named = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).license;
  if (typeof named !== 'string')
    throw new Error(`${pkg} has neither a licence file nor a license field.`);
  return `${pkg}\n\nLicensed under ${named}. The package ships no licence file.\n`;
}

function bundle(entry: string, target: 'node' | 'browser', outfile: string, metafile: string) {
  const build = buildSync({
    absWorkingDir: join(import.meta.dirname, '..'),
    entryPoints: [join(server, 'src', entry)],
    bundle: true,
    platform: target,
    format: 'esm',
    minify: target === 'browser',
    outfile,
    metafile: true,
  });
  writeFileSync(metafile, JSON.stringify(build.metafile));
  return Object.keys(build.metafile?.inputs ?? {});
}

const FILES = ['usage.html', 'THIRD_PARTY_VIEW_LICENSES.txt'];

try {
  const inputs = [
    ...bundle('usage-view.ts', 'browser', join(meta, 'view.js'), join(meta, 'view.json')),
  ];
  writeFileSync(join(out, 'usage.html'), dashboardApp(readFileSync(join(meta, 'view.js'), 'utf8')));
  const root = join(import.meta.dirname, '..');
  const notices = [...packagesOf(inputs)].map(([pkg, dir]) => licence(pkg, join(root, dir)));
  writeFileSync(join(out, 'THIRD_PARTY_VIEW_LICENSES.txt'), notices.join('\n---\n\n'));
  if (check) {
    for (const file of FILES) {
      const committed = join(server, file);
      if (!existsSync(committed) || !readFileSync(join(out, file)).equals(readFileSync(committed)))
        throw new Error(
          `plugins/sidecut-solo/server/${file} is stale. Run npm run build and commit it.`,
        );
    }
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  rmSync(meta, { recursive: true, force: true });
  if (check) rmSync(out, { recursive: true, force: true });
}
