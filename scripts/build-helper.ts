import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSync } from 'esbuild';

const dir = 'plugins/sidecut-solo/server/data/helper';
const bundle = join(dir, 'solo.mjs');
const result = buildSync({
  entryPoints: ['plugins/sidecut-solo/server/src/helper/solo.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile: bundle,
  write: false,
  metafile: true,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
const output = result.outputFiles[0];
if (!output) throw new Error('Helper build produced no output');
const notice =
  'smol-toml\n\n' + readFileSync('node_modules/smol-toml/LICENSE', 'utf8').trim() + '\n';
for (const [path, value] of [
  [bundle, output.text],
  [join(dir, 'THIRD_PARTY_LICENSES.txt'), notice],
] as const) {
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== value)
      throw new Error(path + ' is stale; run npm run build');
  } else writeFileSync(path, value);
}
