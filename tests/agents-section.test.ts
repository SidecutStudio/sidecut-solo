import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { PLUGIN } from './package-rules.ts';

test('the solo-workflow router names every skill an agent should pick', async () => {
  const router = await readFile(join(PLUGIN, 'skills/solo/SKILL.md'), 'utf8');
  const skills = (await readdir(join(PLUGIN, 'skills'))).filter((s) => s !== 'solo');
  for (const skill of skills) expect(router).toContain(`\`${skill}\``);
});

test("this repo's AGENTS.md carries the current Solo section", async () => {
  const text = await readFile(
    join(PLUGIN, 'skills/solo-configure-project/references/agents-section.md'),
    'utf8',
  );
  const block = text.match(/<!-- solo-workflow:start -->[\s\S]*<!-- solo-workflow:end -->/)?.[0];
  expect(block).toBeDefined();
  const agents = await readFile(join(PLUGIN, '../../AGENTS.md'), 'utf8');
  expect(agents).toContain(block as string);
});
