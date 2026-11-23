// Validates saved QA scenarios and run records, and compares the two arms of a with/without-plugin
// pair. No execution or model calls: a valid record is not a behavioral pass. Uses nothing beyond
// node:fs and node:path; the bundled helper runs the same checks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pluginRoot } from './paths.ts';

// biome-ignore lint/suspicious/noExplicitAny: documents and schemas are validated structurally below.
type Json = any;

const SCHEMAS = join(pluginRoot, 'server', 'data', 'qa');

function typeMatches(type: string, value: unknown): boolean {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object')
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}

/** The JSON Schema subset the QA schemas use; returns one message per violation. */
export function schemaErrors(schema: Json, value: unknown, at = '$'): string[] {
  if (schema.anyOf) {
    const options = schema.anyOf.map((option: Json) => schemaErrors(option, value, at));
    return options.some((errors: string[]) => !errors.length)
      ? []
      : [`${at}: matches no allowed form`];
  }
  const errors: string[] = [];
  for (const part of schema.allOf ?? []) errors.push(...schemaErrors(part, value, at));
  if (schema.if) {
    const branch = schemaErrors(schema.if, value, at).length ? schema.else : schema.then;
    if (branch) errors.push(...schemaErrors(branch, value, at));
  }
  if (schema.not && !schemaErrors(schema.not, value, at).length)
    errors.push(`${at}: matches a forbidden form`);
  if (
    schema.contains &&
    Array.isArray(value) &&
    !value.some((item) => !schemaErrors(schema.contains, item).length)
  ) {
    errors.push(`${at}: has no matching item`);
  }
  if ('const' in schema && value !== schema.const)
    errors.push(`${at}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value))
    errors.push(`${at}: must be one of ${schema.enum.join(', ')}`);
  if (schema.type && !typeMatches(schema.type, value))
    return [...errors, `${at}: must be ${schema.type}`];
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      errors.push(`${at}: too short`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value))
      errors.push(`${at}: does not match ${schema.pattern}`);
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value)))
      errors.push(`${at}: not a date-time`);
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${at}: below ${schema.minimum}`);
  }
  if (typeof value === 'number' && schema.maximum !== undefined && value > schema.maximum) {
    errors.push(`${at}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push(`${at}: needs ${schema.minItems}+ items`);
    if (schema.items)
      value.forEach((item, i) => {
        errors.push(...schemaErrors(schema.items, item, `${at}[${i}]`));
      });
  }
  if (typeMatches('object', value) && (schema.properties || schema.required)) {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? [])
      if (!(key in record)) errors.push(`${at}.${key}: required`);
    for (const [key, item] of Object.entries(record)) {
      const property = schema.properties?.[key];
      if (property) errors.push(...schemaErrors(property, item, `${at}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${at}.${key}: not allowed`);
    }
  }
  return errors;
}

function schema(name: 'scenario' | 'run'): Json {
  return JSON.parse(readFileSync(join(SCHEMAS, `${name}.schema.json`), 'utf8'));
}

/** Cross-document errors between a scenario and one run of it. */
export function runProblems(scenario: Json, run: Json): string[] {
  const found = [
    ...schemaErrors(schema('scenario'), scenario).map((e) => `scenario ${e}`),
    ...schemaErrors(schema('run'), run).map((e) => `run ${e}`),
  ];
  if (run?.kind === 'session' && run.comparison)
    found.push('A session record is single-arm; a with/without pair needs dogfood runs');
  if (found.length) return found;
  if (run.skills) {
    const used = [...new Set(run.skills.map((skill: Json) => skill.invocation))];
    const summary = used.length === 1 ? used[0] : 'mixed';
    if (run.invocation !== summary)
      found.push(`Run invocation must be ${summary} to match its skills`);
  } else if (run.invocation === 'mixed') found.push('A mixed invocation needs a skills list');
  if (run.scenario_id !== scenario.id || run.scenario_version !== scenario.version) {
    found.push('Scenario ID/version mismatch');
  }
  const expected: string[] = scenario.checks.map((check: Json) => check.id);
  const actual: string[] = run.checks.map((check: Json) => check.id);
  if (new Set(expected).size !== expected.length || new Set(actual).size !== actual.length) {
    found.push('Duplicate check IDs');
  }
  if ([...new Set(expected)].sort().join() !== [...new Set(actual)].sort().join()) {
    found.push('Missing or unknown check IDs');
  }
  const statuses = new Set(run.checks.map((check: Json) => check.status));
  const summary = ['fail', 'blocked', 'not_run'].find((status) => statuses.has(status)) ?? 'pass';
  if (run.status !== summary) found.push('Summary status does not match check results');
  const byId = new Map(run.checks.map((check: Json) => [check.id, check]));
  const ids = run.findings.map((finding: Json) => finding.id);
  if (new Set(ids).size !== ids.length) found.push('Duplicate finding IDs');
  for (const finding of run.findings) {
    const check: Json = finding.check_id === null ? undefined : byId.get(finding.check_id);
    if (finding.check_id !== null && !check) found.push('Finding references an unknown check ID');
    if (finding.kind === 'defect' && check?.status !== 'fail')
      found.push('Defect must reference a failed check');
  }
  const { started_at: start, finished_at: finish } = run;
  if ((start === null) !== (finish === null))
    found.push('Capture both timestamps or leave both unknown');
  if (start !== null && finish !== null && Date.parse(finish) < Date.parse(start)) {
    found.push('Run finished before it started');
  }
  return found;
}

/** What a single run can't establish, printed after a successful qa-check. */
export function runNotes(run: Json): string[] {
  if (run.kind === 'regression' || run.comparison) return [];
  return [
    'Single-arm record: what helped is observed, not attributed. Attribution to the plugin is inconclusive without a with/without pair.',
  ];
}

/** JSON with sorted keys, so field order never decides whether two subjects match. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)))
      : item,
  );
}

const IDENTITY = ['host', 'host_version', 'requested_model', 'resolved_model'];

/** Errors that stop two runs from forming one attribution pair. */
export function pairProblems(scenario: Json, withRun: Json, withoutRun: Json): string[] {
  const found = [
    ...runProblems(scenario, withRun).map((e) => `with-plugin: ${e}`),
    ...runProblems(scenario, withoutRun).map((e) => `without-plugin: ${e}`),
  ];
  const [a, b] = [withRun?.comparison, withoutRun?.comparison];
  if (!a || !b) return [...found, 'Both runs need a comparison block'];
  if (a.arm !== 'with-plugin' || b.arm !== 'without-plugin')
    found.push('Arms must be with-plugin then without-plugin');
  if (a.pair_id !== b.pair_id) found.push('Runs belong to different pairs');
  if (withRun.kind !== withoutRun.kind) found.push('Both arms must be the same kind of run');
  if (canonical(withRun.subject) !== canonical(withoutRun.subject))
    found.push('Both arms must test the same subject');
  for (const field of IDENTITY) {
    const [left, right] = [withRun.environment?.[field], withoutRun.environment?.[field]];
    if (left && right && left !== right) found.push(`Both arms must use the same ${field}`);
  }
  return found;
}

/** Unknown identity permits observations, but cannot establish attribution. */
function identityKnown(withRun: Json, withoutRun: Json): boolean {
  for (const run of [withRun, withoutRun]) {
    const subject = run.subject;
    if (!(subject.fingerprint || (subject.revision && !subject.dirty))) return false;
    if (!IDENTITY.every((key) => run.environment[key])) return false;
  }
  return (
    canonical(withRun.subject) === canonical(withoutRun.subject) &&
    IDENTITY.every((key) => withRun.environment[key] === withoutRun.environment[key])
  );
}

const VERDICTS: Record<string, string> = {
  'pass,fail': 'attributable',
  'fail,pass': 'regressed',
  'pass,pass': 'both-pass',
  'fail,fail': 'neither',
};

export function comparePair(withRun: Json, withoutRun: Json): string[] {
  const without = new Map(withoutRun.checks.map((check: Json) => [check.id, check.status]));
  const known = identityKnown(withRun, withoutRun);
  const lines: string[] = withRun.checks.map((check: Json) => {
    const pair = `${check.status},${without.get(check.id)}`;
    // A blocked or unrun arm proves nothing either way.
    const verdict = (known && VERDICTS[pair]) || 'inconclusive';
    return `${check.id}: with=${check.status} without=${without.get(check.id)} -> ${verdict}`;
  });
  const [a, b] = [withRun.comparison, withoutRun.comparison];
  lines.push(`Sample counts: with=${a.runs} without=${b.runs}; differences are descriptive.`);
  if (a.score !== null && b.score !== null) {
    const delta = a.score - b.score;
    lines.push(
      `score: with=${a.score.toFixed(2)} without=${b.score.toFixed(2)} delta=${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`,
    );
  }
  lines.push(
    known
      ? 'Pair context matches; differences are observations for these samples, not causal proof.'
      : 'Pair observations retained; attribution inconclusive because identity is unknown.',
    'Prompt, tool and fixture equivalence must also be established by the operator.',
  );
  return lines;
}

/**
 * `qa-check <scenario> <run>` or `qa-compare <scenario> <with> <without>` on saved files: prints
 * the result and returns the exit code. The bundled helper runs it on Node.js.
 */
export function qaCommand(command: string, paths: string[]): number {
  const [scenario, ...runs] = paths.map((path) => JSON.parse(readFileSync(path, 'utf8')));
  const [first, second] = runs;
  const compare = command === 'qa-compare';
  const found = compare ? pairProblems(scenario, first, second) : runProblems(scenario, first);
  for (const error of found) console.error(error);
  if (found.length) return 1;
  if (compare) {
    console.log(comparePair(first, second).join('\n'));
  } else {
    console.log('Scenario and run records are consistent; this is not a behavioral pass.');
    for (const note of runNotes(first)) console.log(note);
  }
  return 0;
}
