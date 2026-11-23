import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

let root = import.meta.dirname;
while (!existsSync(join(root, '.codex-plugin', 'plugin.json'))) {
  const parent = dirname(root);
  if (parent === root) throw new Error('Solo plugin root not found');
  root = parent;
}
export const pluginRoot = root;
