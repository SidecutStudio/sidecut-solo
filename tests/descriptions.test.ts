import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { PLUGIN } from './package-rules.ts';

// Keep the rebuilt descriptions within the existing total context budget.
const BUDGET = 3645;

test('all skill descriptions together stay within the budget', async () => {
  let total = 0;
  for (const skill of await readdir(join(PLUGIN, 'skills'))) {
    const text = await readFile(join(PLUGIN, 'skills', skill, 'SKILL.md'), 'utf8');
    const block =
      text.match(/^description: >-\n((?: {2}.*\n)+)/m)?.[1] ??
      text.match(/^description: *['"]?(.+?)['"]?$/m)?.[1] ??
      '';
    expect(block).not.toBe('');
    total += block.replace(/\s+/g, ' ').trim().length;
  }
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(BUDGET);
});
