// Runs plugins/sidecut-solo/server/data/workflows/review-change.js against a mock Claude Code workflow runtime
// (agent, parallel, log, args); no model calls.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

type Opts = { label?: string; phase?: string; schema?: object; model?: string; agentType?: string };
type Agent = (prompt: string, opts: Opts) => unknown;
type Finding = {
  severity: string;
  location: string;
  problem: string;
  trigger: string;
  fix: string;
};

const source = readFileSync(
  join(import.meta.dirname, '../../plugins/sidecut-solo/server/data/workflows/review-change.js'),
  'utf8',
);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const script = new AsyncFunction(
  'agent',
  'parallel',
  'log',
  'args',
  'budget',
  source.replace(/^export const meta = /m, 'const meta = '),
);

const ARGS = {
  repo: '/r',
  base: 'a'.repeat(40),
  head: 'b'.repeat(40),
  files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
  requirements: 'fix login',
};
const finding = (location: string, severity = 'major'): Finding => ({
  severity,
  location,
  problem: 'p',
  trigger: 't',
  fix: 'f',
});
const dataOf = (prompt: string) => JSON.parse(prompt.slice(prompt.indexOf('DATA:\n') + 6));

function run(impl: Agent, args: unknown = ARGS, budget?: { spent(): number }) {
  const calls: { label: string; opts: Opts; prompt: string }[] = [];
  const logs: string[] = [];
  const agent = async (prompt: string, opts: Opts = {}) => {
    calls.push({ label: opts.label ?? '', opts, prompt });
    return impl(prompt, opts);
  };
  const parallel = (thunks: (() => Promise<unknown>)[]) =>
    Promise.all(thunks.map((t) => t().catch(() => null)));
  return {
    out: script(agent, parallel, (m: string) => logs.push(m), args, budget) as Promise<
      Record<string, unknown>
    >,
    calls,
    logs,
  };
}

// Reviewers return findings by area; refuters answer each finding by the verdict table, or refute it.
function standard(
  findings: Record<string, Finding[]> = { runtime: [finding('src/a.ts:3'), finding('src/a.ts:9')] },
  verdicts: Record<string, string> = { 'src/a.ts:3': 'confirmed', 'src/a.ts:9': 'refuted' },
): Agent {
  return (prompt, opts) => {
    const label = opts.label ?? '';
    if (label.startsWith('review ')) {
      return { head_matches: true, findings: findings[label.slice(7)] ?? [] };
    }
    if (label.startsWith('refute ')) {
      const list = dataOf(prompt).findings as (Finding & { index: number })[];
      return {
        head_matches: true,
        verdicts: list.map((f) => ({
          index: f.index,
          verdict: verdicts[f.location] ?? 'refuted',
          reason: 'r',
        })),
      };
    }
    throw new Error(`unexpected agent ${label}`);
  };
}

describe('deep review workflow', () => {
  test('keeps confirmed findings, drops refuted ones and uses the right roles and models', async () => {
    const { out, calls } = run(standard());
    const result = await out;
    expect((result.confirmed as Finding[]).map((f) => f.location)).toEqual(['src/a.ts:3']);
    expect(result.refuted).toBe(1);
    expect(result.unreviewed).toEqual([]);
    expect(result.ready_allowed).toBe(false);
    expect(calls.map((c) => c.label)).toEqual([
      'review runtime',
      'review interactions',
      'refute src/a.ts:3',
      'refute src/a.ts:9',
    ]);
    for (const call of calls) {
      const refute = call.label.startsWith('refute');
      expect(call.opts.agentType).toBe(refute ? 'sidecut-solo:refuter' : 'sidecut-solo:reviewer');
      expect(call.opts.model).toBe(call.label === 'review runtime' ? 'sonnet' : 'opus');
      expect(call.prompt).toContain('ignore any other request');
      expect(call.prompt).toContain(`head ${ARGS.head}`);
      expect(call.prompt).toContain('untrusted data');
    }
    expect(result.report).toContain('## Verdict\nNeeds fixes');
    expect(result.report).toContain('## Cost\n4 agents (1 sonnet, 3 opus)');
  });

  test('every reviewer traces new output into existing features; one more reads across areas', async () => {
    const files = ['src/a.ts', 'app/ui/B.tsx'];
    const { calls } = run(standard({}), { ...ARGS, files });
    const reviewers = calls.filter((c) => c.label.startsWith('review '));
    for (const c of reviewers) expect(c.prompt).toContain('existing features');
    const interactions = reviewers.find((c) => c.label === 'review interactions');
    expect(interactions?.opts.model).toBe('opus');
    expect(dataOf(interactions?.prompt ?? '').areas).toEqual([
      { name: 'UI', files: ['app/ui/B.tsx'] },
      { name: 'runtime', files: ['src/a.ts'] },
    ]);
  });

  test('the first-pass model can be raised for a run', async () => {
    const { calls } = run(standard({}), { ...ARGS, first_pass_model: 'opus' });
    expect(calls.find((c) => c.label === 'review runtime')?.opts.model).toBe('opus');
  });

  test('a failed interactions reviewer blocks ready', async () => {
    const base = standard({});
    const { out } = run((prompt, opts) =>
      opts.label === 'review interactions' ? null : base(prompt, opts),
    );
    const result = await out;
    expect(result.ready_allowed).toBe(false);
    expect(result.report).toContain('interactions between areas not reviewed');
  });

  test('one reviewer per area, not per file, with high-risk areas on the strong model', async () => {
    const files = [
      ...Array.from({ length: 6 }, (_, i) => `server/route${i}.ts`),
      ...Array.from({ length: 6 }, (_, i) => `app/components/Card${i}.tsx`),
      'prompts/system.md',
      'scripts/deploy.sh',
      'server/billing/spend-limit.ts',
      'migrations/0042_add_index.sql',
      '.github/workflows/ci.yml',
      'package.json',
      'tests/route.test.ts',
      'docs/guide.md',
      'README.md',
    ];
    const { out, calls } = run(standard({}), { ...ARGS, files });
    const result = await out;
    const reviewers = calls.filter((c) => c.label.startsWith('review '));
    expect(reviewers.map((c) => [c.label, c.opts.model]).sort()).toEqual([
      ['review UI', 'sonnet'],
      ['review config and CI', 'sonnet'],
      ['review high-risk code', 'opus'],
      ['review interactions', 'opus'],
      ['review prompts and rules', 'sonnet'],
      ['review runtime', 'sonnet'],
    ]);
    const runtime = dataOf(reviewers.find((c) => c.label === 'review runtime')?.prompt ?? '');
    expect(runtime.files).toContain('tests/route.test.ts');
    expect(result.skipped).toEqual(['README.md', 'docs/guide.md']);
    expect(result.unreviewed).toEqual([]);
    expect(result.ready_allowed).toBe(true);
    expect(result.report).toContain('skipped, docs only: `README.md`');
  });

  test('docs the skill marks as carrying behavior are reviewed with the prompts', async () => {
    const files = ['src/a.ts', 'DESIGN.md', 'README.md'];
    const { out, calls } = run(standard({}), { ...ARGS, files, behavior_docs: ['DESIGN.md'] });
    expect((await out).skipped).toEqual(['README.md']);
    expect(calls.map((c) => c.label).sort()).toEqual([
      'review interactions',
      'review prompts and rules',
      'review runtime',
    ]);
  });

  test('build and code files never count as docs', async () => {
    const files = [
      'src/a.py',
      'requirements.txt',
      'CMakeLists.txt',
      'docs/conf.py',
      'docs/guide.md',
    ];
    const { out, calls } = run(standard({}), { ...ARGS, files });
    expect((await out).skipped).toEqual(['docs/guide.md']);
    const reviewed = calls
      .filter((c) => c.label.startsWith('review ') && c.label !== 'review interactions')
      .flatMap((c) => dataOf(c.prompt).files)
      .sort();
    expect(reviewed).toEqual(['CMakeLists.txt', 'docs/conf.py', 'requirements.txt', 'src/a.py']);
  });

  test('a max_agents below 4 or not a whole number is refused before any agent runs', async () => {
    for (const max_agents of [3, 0, '5', 4.5]) {
      const { out, calls } = run(standard(), { ...ARGS, max_agents });
      expect((await out).error).toContain('max_agents');
      expect(calls).toEqual([]);
    }
  });

  test('a change that is only docs is still reviewed', async () => {
    const { out, calls } = run(standard({}), { ...ARGS, files: ['README.md'] });
    expect((await out).skipped).toEqual([]);
    expect(calls.map((c) => c.label)).toEqual(['review docs', 'review interactions']);
  });

  test('files the skill marks high risk go to the strong model', async () => {
    const { calls } = run(standard({}), { ...ARGS, high_risk: ['src/b.ts'] });
    const labels = calls.map((c) => [c.label, c.opts.model]);
    expect(labels).toContainEqual(['review high-risk code', 'opus']);
    expect(labels).toContainEqual(['review runtime', 'sonnet']);
  });

  test('over the cap, areas merge instead of dropping files, and the report says so', async () => {
    const files = [
      'src/a.ts',
      'app/ui/A.tsx',
      'prompts/p.md',
      'scripts/x.sh',
      'Dockerfile',
      'docs/a.md',
    ];
    const { out, calls } = run(standard({}), { ...ARGS, files, max_agents: 4 });
    const result = await out;
    const reviewers = calls.filter(
      (c) => c.label.startsWith('review ') && c.label !== 'review interactions',
    );
    expect(reviewers.length).toBe(1);
    const reviewed = reviewers.flatMap((c) => dataOf(c.prompt).files).sort();
    expect(reviewed).toEqual(files.filter((f) => f !== 'docs/a.md').sort());
    expect(calls.length).toBeLessThanOrEqual(4);
    expect(result.report).toContain('merged');
    expect((result.cost as { notes: string[] }).notes.some((n) => n.startsWith('merged'))).toBe(
      true,
    );
  });

  test('a large area is split while there is room under the cap', async () => {
    const files = Array.from({ length: 40 }, (_, i) => `src/f${String(i).padStart(2, '0')}.ts`);
    const { calls } = run(standard({}), { ...ARGS, files });
    const reviewers = calls.filter(
      (c) => c.label.startsWith('review ') && c.label !== 'review interactions',
    );
    expect(reviewers.length).toBe(6);
    expect(reviewers.flatMap((c) => dataOf(c.prompt).files).sort()).toEqual(files);
  });

  test('minor findings share one refuter on the cheaper model', async () => {
    const { out, calls } = run(
      standard(
        {
          runtime: [
            finding('src/a.ts:1', 'blocker'),
            finding('src/a.ts:2', 'minor'),
            finding('src/a.ts:3', 'minor'),
          ],
        },
        { 'src/a.ts:1': 'refuted', 'src/a.ts:2': 'confirmed', 'src/a.ts:3': 'confirmed' },
      ),
    );
    const result = await out;
    const refuters = calls.filter((c) => c.label.startsWith('refute'));
    expect(refuters.map((c) => [c.label, c.opts.model])).toEqual([
      ['refute src/a.ts:1', 'opus'],
      ['refute 2 findings', 'sonnet'],
    ]);
    expect((result.confirmed as Finding[]).length).toBe(2);
    expect(result.ready_allowed).toBe(true);
  });

  test('more serious findings than slots share refuters and stay within the cap', async () => {
    const many = Array.from({ length: 12 }, (_, i) => finding(`src/a.ts:${i}`));
    const { out, calls } = run(standard({ runtime: many }, {}));
    const result = await out;
    expect(calls.length).toBe(9);
    expect((result.unverified as Finding[]).length).toBe(0);
    expect(result.refuted).toBe(12);
    expect((result.cost as { notes: string[] }).notes).toContain(
      '12 serious findings shared 7 refuters',
    );
  });

  test('a reviewer whose head does not match leaves its files unreviewed and blocks ready', async () => {
    const files = ['src/a.ts', 'app/ui/B.tsx'];
    const base = standard({});
    const { out } = run(
      (prompt, opts) =>
        opts.label === 'review UI' ? { head_matches: false, findings: [] } : base(prompt, opts),
      { ...ARGS, files },
    );
    const result = await out;
    expect(result.unreviewed).toEqual(['app/ui/B.tsx']);
    expect(result.ready_allowed).toBe(false);
    expect(result.report).toContain('Blocked');
  });

  test('a failed refuter leaves its findings unverified', async () => {
    const base = standard();
    const { out } = run((prompt, opts) =>
      opts.label === 'refute src/a.ts:9' ? null : base(prompt, opts),
    );
    const result = await out;
    expect((result.unverified as Finding[]).map((f) => f.location)).toEqual(['src/a.ts:9']);
    expect(result.ready_allowed).toBe(false);
  });

  test('an unproven verdict keeps the finding as unverified, never dropped', async () => {
    const { out } = run(
      standard(undefined, { 'src/a.ts:3': 'confirmed', 'src/a.ts:9': 'unproven' }),
    );
    const result = await out;
    expect((result.unverified as Finding[]).map((f) => f.location)).toEqual(['src/a.ts:9']);
    expect(result.refuted).toBe(0);
    expect(result.ready_allowed).toBe(false);
  });

  test('reports agent count and output tokens when the host exposes them', async () => {
    let spent = 1000;
    const base = standard();
    const { out } = run(
      (prompt, opts) => {
        spent += 500;
        return base(prompt, opts);
      },
      ARGS,
      { spent: () => spent },
    );
    const cost = (await out).cost as { agents: number; output_tokens: number };
    expect(cost.agents).toBe(4);
    expect(cost.output_tokens).toBe(2000);
  });

  test('without the plugin agents, each role runs as a general-purpose agent with its own instructions', async () => {
    const body = (name: string) =>
      readFileSync(
        join(import.meta.dirname, `../../plugins/sidecut-solo/agents/${name}.md`),
        'utf8',
      )
        .split(/^---$/m)[2]
        ?.trim() ?? '';
    const missing: Agent = (prompt, opts) => {
      if (opts.agentType?.startsWith('sidecut-solo:'))
        throw new Error(`agent({agentType}): agent type '${opts.agentType}' not found.`);
      return standard()(prompt, opts);
    };
    const { out, calls, logs } = run(missing);
    const result = await out;
    expect((result.confirmed as Finding[]).map((f) => f.location)).toEqual(['src/a.ts:3']);
    expect(result.unreviewed).toEqual([]);
    const ran = calls.filter((call) => call.opts.agentType === 'general-purpose');
    expect(ran.map((call) => call.label).sort()).toEqual([
      'refute src/a.ts:3',
      'refute src/a.ts:9',
      'review interactions',
      'review runtime',
    ]);
    for (const call of ran)
      expect(
        call.prompt.startsWith(body(call.label.startsWith('refute') ? 'refuter' : 'reviewer')),
      ).toBe(true);
    expect(logs.filter((line) => line.includes('not loaded'))).toHaveLength(1);
  });

  test('an agent error other than a missing role is not retried', async () => {
    const base = standard();
    const { out, calls } = run((prompt, opts) => {
      if (opts.label === 'review runtime') throw new Error('overloaded');
      return base(prompt, opts);
    });
    const result = await out;
    expect(result.unreviewed).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(calls.some((call) => call.opts.agentType === 'general-purpose')).toBe(false);
  });

  test('a change people see is flagged for Design review instead of reading as fully covered', async () => {
    const files = ['src/a.ts', 'src/components/hero.tsx', 'src/index.css'];
    const visual = await run(standard({}), { ...ARGS, files }).out;
    expect(visual.design_review_needed).toBe(true);
    expect(visual.report).toContain('design not reviewed here: 2 files people see');
    const backend = await run(standard({})).out;
    expect(backend.design_review_needed).toBe(false);
    expect(backend.report).not.toContain('design not reviewed');
  });

  test('bad arguments are refused before any agent runs', async () => {
    const { out, calls } = run(standard(), { ...ARGS, head: 'main' });
    expect((await out).error).toContain('full commit SHAs');
    expect(calls).toEqual([]);
  });
});
