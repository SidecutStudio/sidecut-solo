import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { PLUGIN } from './package-rules.ts';

// Two skills whose descriptions say nearly the same thing compete for the same requests, and the
// model picks one at random. This scores every pair with TF-IDF cosine similarity, which costs no
// model credits, and fails when a pair crosses the line. The closest pair scored 0.17 in 0.39.0.
const LIMIT = 0.4;
const STOP = new Set(
  'a an and are as at be by for from in into is it its of on or the this that to use used uses when with without not user users'.split(
    ' ',
  ),
);

async function descriptions(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const skill of await readdir(join(PLUGIN, 'skills'))) {
    const text = await readFile(join(PLUGIN, 'skills', skill, 'SKILL.md'), 'utf8');
    const description = text.match(/^description: *"(.+)"$/m)?.[1];
    if (description) out.set(skill, description);
  }
  return out;
}

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z-]+/g) ?? []).filter(
    (w) => !STOP.has(w) && !w.startsWith('solo-'),
  );
}

function similarities(docs: Map<string, string>): [string, string, number][] {
  const tokens = new Map([...docs].map(([k, v]) => [k, words(v)]));
  const df = new Map<string, number>();
  for (const list of tokens.values())
    for (const w of new Set(list)) df.set(w, (df.get(w) ?? 0) + 1);
  const n = tokens.size;
  const vectors = new Map<string, Map<string, number>>();
  for (const [k, list] of tokens) {
    const v = new Map<string, number>();
    for (const w of list) v.set(w, (v.get(w) ?? 0) + 1);
    for (const [w, tf] of v) v.set(w, tf * Math.log((1 + n) / (1 + (df.get(w) ?? 0))));
    vectors.set(k, v);
  }
  const norm = (v: Map<string, number>) =>
    Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
  const names = [...vectors.keys()].sort();
  const pairs: [string, string, number][] = [];
  names.forEach((first, i) => {
    for (const second of names.slice(i + 1)) {
      const a = vectors.get(first) as Map<string, number>;
      const b = vectors.get(second) as Map<string, number>;
      let dot = 0;
      for (const [w, x] of a) dot += x * (b.get(w) ?? 0);
      pairs.push([first, second, dot / (norm(a) * norm(b) || 1)]);
    }
  });
  return pairs;
}

test('no two skill descriptions overlap enough to compete for the same request', async () => {
  const docs = await descriptions();
  expect(docs.size).toBeGreaterThan(10);
  const close = similarities(docs)
    .filter(([, , s]) => s >= LIMIT)
    .map(([a, b, s]) => `${a} ~ ${b}: ${s.toFixed(2)}`);
  expect(close).toEqual([]);
});

test('every skill has a trigger eval that names it', async () => {
  const evals = join(PLUGIN, '../../evals');
  const fired = new Set<string>();
  for (const dir of await readdir(evals, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const prompt = await readFile(join(evals, dir.name, 'prompt.md'), 'utf8').catch(() => '');
    if (!/tags: \[[^\]]*trigger/.test(prompt)) continue;
    for (const grader of await readdir(join(evals, dir.name, 'graders')).catch(() => [])) {
      const text = await readFile(join(evals, dir.name, 'graders', grader), 'utf8');
      const name = text.match(/sidecut-solo:(solo[a-z-]*)/)?.[1];
      if (name && /min: [1-9]/.test(text)) fired.add(name);
    }
  }
  const skills = (await readdir(join(PLUGIN, 'skills'))).sort();
  expect(skills.filter((s) => !fired.has(s))).toEqual([]);
});
