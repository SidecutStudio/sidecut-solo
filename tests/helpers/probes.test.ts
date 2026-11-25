// Runs every probe in tests/probes/helper.yaml on this checkout's plugin, as the eval runner's
// command variant would, and checks its assertions. A fixed test must pass; an open one must still
// fail, so a fix that lands without setting status: fixed shows here.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

const HERE = join(import.meta.dirname, '..', 'probes');
const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'sidecut-solo');

type Assertion = { type: string; value: string };
type Probe = {
  description: string;
  metadata: { status: 'fixed' | 'open'; kind: string };
  vars: { probe: string };
  assert: Assertion[];
};

const { tests } = parse(readFileSync(join(HERE, 'helper.yaml'), 'utf8')) as { tests: Probe[] };

function holds(output: string, { type, value }: Assertion): boolean {
  const negate = type.startsWith('not-');
  const kind = negate ? type.slice(4) : type;
  const result =
    kind === 'contains'
      ? output.includes(value)
      : kind === 'icontains'
        ? output.toLowerCase().includes(value.toLowerCase())
        : kind === 'regex'
          ? new RegExp(value).test(output)
          : (() => {
              throw new Error(`probes.test.ts doesn't know assertion type ${type}`);
            })();
  return negate ? !result : result;
}

describe('helper probes', () => {
  test('every probe has a status, a kind and at least one assertion', () => {
    expect(tests.length).toBeGreaterThan(0);
    for (const probe of tests) {
      expect(['fixed', 'open']).toContain(probe.metadata.status);
      expect(['regression', 'control']).toContain(probe.metadata.kind);
      expect(probe.assert.length).toBeGreaterThan(0);
    }
  });

  for (const probe of tests) {
    test(`${probe.metadata.status}: ${probe.description}`, () => {
      const run = spawnSync('sh', [join(HERE, 'probe.sh'), probe.vars.probe], {
        cwd: HERE,
        env: { ...process.env, SOLO_PLUGIN: PLUGIN },
        encoding: 'utf8',
      });
      const output = `${run.stdout}${run.stderr}`;
      const failed = probe.assert.filter((assertion) => !holds(output, assertion));
      if (probe.metadata.status === 'fixed') expect(failed, output).toEqual([]);
      else
        expect(
          failed.length,
          `open probe now passes: set status: fixed\n${output}`,
        ).toBeGreaterThan(0);
    });
  }
});
