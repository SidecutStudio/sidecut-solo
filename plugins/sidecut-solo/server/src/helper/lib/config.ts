// Personal defaults, repository settings, then the local override. Tables merge one level.
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'smol-toml';
import { git } from './git.ts';
import { REVIEW_POLICIES } from './review.ts';

const LAYERS = ['solo-workflow.toml', 'solo-workflow.local.toml'] as const;
export const MERGE_POLICIES = ['ask', 'when-green', 'never'] as const;
export const MERGE_METHODS = ['squash', 'merge', 'rebase'] as const;
const WORKTREE_POLICIES = ['always', 'when-overlapping', 'never'] as const;
const REVIEW_EFFORTS = ['low', 'medium', 'high'] as const;
const INTEGRATIONS = ['issue_tracker', 'task_board', 'ci'];
const PERSONAL_KEYS = new Set([
  'worktrees',
  'review',
  'review_model',
  'codex_review_model',
  'review_effort',
  'deep_review_rounds',
  'voice_guide',
]);

type Kind = 'string' | 'table' | 'list' | 'number';
const KEYS: Record<string, Kind> = {
  base_branch: 'string',
  checks: 'table',
  merge: 'string',
  merge_method: 'string',
  required_checks: 'list',
  worktrees: 'string',
  protected_paths: 'list',
  review: 'string',
  review_model: 'string',
  codex_review_model: 'string',
  review_effort: 'string',
  deep_review_rounds: 'number',
  voice_guide: 'string',
  integrations: 'table',
};
// What the skills do for a key nobody set. base_branch has no default: read it from the repo.
// review_model is the Claude Code model; codex_review_model has none, so Codex keeps the parent's.
export const DEFAULTS = {
  merge: 'ask',
  merge_method: 'squash',
  worktrees: 'when-overlapping',
  review: 'auto',
  review_model: 'sonnet',
  review_effort: 'medium',
  deep_review_rounds: 3,
};
const CHOICES: Record<string, readonly string[]> = {
  merge: MERGE_POLICIES,
  merge_method: MERGE_METHODS,
  worktrees: WORKTREE_POLICIES,
  review: REVIEW_POLICIES,
  review_effort: REVIEW_EFFORTS,
};

type Settings = {
  base_branch?: string;
  checks?: Record<string, string>;
  merge?: string;
  merge_method?: string;
  required_checks?: string[];
  worktrees?: string;
  protected_paths?: string[];
  review?: string;
  review_model?: string;
  codex_review_model?: string;
  review_effort?: string;
  deep_review_rounds?: number;
  voice_guide?: string;
  integrations?: Record<string, string>;
};

function kindOf(value: unknown): Kind | 'other' {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'list';
  if (
    value &&
    typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return 'table';
  }
  return 'other';
}

/** [key, message] for every key that is unknown or holds a value the skills can't use. */
function problems(
  data: Record<string, unknown>,
  name: string,
  personal: boolean,
): [string, string][] {
  const found: [string, string][] = [];
  for (const [key, value] of Object.entries(data)) {
    const kind = Object.hasOwn(KEYS, key) ? KEYS[key] : undefined;
    if (!kind) found.push([key, `${name}: unknown key '${key}'`]);
    else if (personal && !PERSONAL_KEYS.has(key)) {
      found.push([key, `${name}: '${key}' belongs in repository settings`]);
    } else if (kindOf(value) !== kind) found.push([key, `${name}: '${key}' must be a ${kind}`]);
    else if (CHOICES[key] && !CHOICES[key].includes(value as string)) {
      found.push([key, `${name}: '${key}' must be one of ${CHOICES[key].join(', ')}`]);
    } else if (
      key === 'checks' &&
      !Object.values(value as object).every((v) => typeof v === 'string')
    ) {
      found.push([key, `${name}: every [checks] entry must be a command string`]);
    } else if (
      key === 'integrations' &&
      !Object.entries(value as object).every(
        ([setting, service]) =>
          INTEGRATIONS.includes(setting) && typeof service === 'string' && service.trim(),
      )
    ) {
      found.push([
        key,
        `${name}: [integrations] accepts nonempty strings for ${INTEGRATIONS.join(', ')}`,
      ]);
    } else if (kind === 'number' && !(Number.isInteger(value) && (value as number) >= 1)) {
      found.push([key, `${name}: '${key}' must be a whole number of at least 1`]);
    } else if (kind === 'list' && !(value as unknown[]).every((v) => typeof v === 'string')) {
      found.push([key, `${name}: '${key}' must list strings`]);
    }
  }
  return found;
}

function gitRoot(repo: string): string | undefined {
  try {
    return realpathSync(git(repo, ['rev-parse', '--show-toplevel']));
  } catch {
    return undefined;
  }
}

export function repoRoot(repo: string): string {
  return gitRoot(repo) ?? resolve(repo);
}

function present(path: string): boolean {
  return existsSync(path) || Boolean(lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink());
}

export type Loaded = {
  root: string;
  files: string[];
  user_preferences?: string;
  setup_needed: boolean;
  config: Settings;
  defaults: Partial<typeof DEFAULTS>;
  problems: string[];
  hint?: string;
};

/**
 * Settings from the files, the defaults used for keys they leave unset, and any problems.
 * `config` holds only what the files set; invalid keys are dropped and fall back to defaults.
 */
export function load(repo: string): Loaded {
  const gitRepo = gitRoot(repo);
  const root = gitRepo ?? resolve(repo);
  const preferences = join(homedir(), '.config', 'solo', 'preferences.toml');
  const merged: Record<string, unknown> = Object.create(null);
  const files: string[] = [];
  const found: string[] = [];
  let userPreferences: string | undefined;
  for (const name of [preferences, ...LAYERS]) {
    const personal = name === preferences;
    const path = personal ? name : join(root, name);
    if (!present(path)) continue;
    let data: Record<string, unknown>;
    try {
      data = parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch (error) {
      found.push(`${name}: can't be read (${(error as Error).message})`);
      continue;
    }
    if (personal) userPreferences = name;
    else files.push(name);
    const issues = problems(data, name, personal);
    found.push(...issues.map(([, message]) => message));
    const bad = new Set(issues.map(([key]) => key));
    for (const [key, value] of Object.entries(data)) {
      if (bad.has(key)) continue;
      const prior = merged[key];
      merged[key] =
        kindOf(value) === 'table' && kindOf(prior) === 'table'
          ? { ...(prior as object), ...(value as object) }
          : value;
    }
  }
  const defaults = Object.fromEntries(Object.entries(DEFAULTS).filter(([key]) => !(key in merged)));
  const setupNeeded = Boolean(gitRepo && !files.length && !userPreferences && !found.length);
  const result: Loaded = {
    root,
    files,
    setup_needed: setupNeeded,
    config: merged as Settings,
    defaults,
    problems: found,
  };
  if (userPreferences) result.user_preferences = userPreferences;
  if (setupNeeded) {
    result.hint =
      'No Solo settings found. Offer setup through solo-configure-project before acting.';
  }
  return result;
}
