// Sidecut Solo helpers: settings, Git state, task records, bounded commands, CI checks, merging
// and cleanup. Every command prints JSON (or text for `report` and `qa`). No autonomous scheduler.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// The working directory identifies the caller's project; installed assets resolve from import.meta.
import { cwd } from 'node:process';
import { dashboardPage } from './dashboard/page.ts';
import { summarize } from './dashboard/summary.ts';
import { codexAgents } from './lib/agents.ts';
import { HOST_SCOPES, PUBLICATION_EFFECTS, resolveAuthorization } from './lib/authorization.ts';
import { DEFAULTS, load, MERGE_METHODS } from './lib/config.ts';
import {
  cleanupWorktree,
  collectChecks,
  createWorktree,
  deleteMerged,
  gate,
  markPrMerged,
  merge,
  push,
} from './lib/delivery.ts';
import { docsCheck } from './lib/docs.ts';
import { run } from './lib/execution.ts';
import { freshRemoteState, inventory, mergedBranches, WorkflowError } from './lib/git.ts';
import { waitMerge } from './lib/handoff.ts';
import { retiredNames } from './lib/names.ts';
import { pluginRoot } from './lib/paths.ts';
import { textReport } from './lib/present.ts';
import { qaCommand } from './lib/qa.ts';
import type { ReviewPolicy } from './lib/review.ts';
import { lastReviewedBefore, loadReview, saveReview, unreviewedCommits } from './lib/reviews.ts';
import { defaultTask, Store, type Task } from './lib/state.ts';
import { userFacing } from './lib/surface.ts';
import {
  logRefusal,
  readJsonl,
  readRefusals,
  readSkillRuns,
  shareLine,
  soloReport,
  type UsageRecord,
  usageFile,
} from './lib/usage.ts';

type Option = {
  kind: 'string' | 'flag' | 'list';
  choices?: readonly string[];
  required?: boolean;
  /** Shown by `<command> --help`. */
  about?: string;
};
type Spec = {
  options?: Record<string, Option>;
  positionals?: string[];
  rest?: boolean;
  help: string;
};

const AUTHORIZATION: Record<string, Option> = {
  authorized: { kind: 'flag' },
  'publication-authorized': { kind: 'flag' },
  'publication-effect': { kind: 'string', choices: PUBLICATION_EFFECTS },
  'host-scope': { kind: 'string', choices: HOST_SCOPES },
};
const REQUIRE: Record<string, Option> = { 'require-check': { kind: 'list' } };

const COMMANDS: Record<string, Spec> = {
  config: { help: 'Show merged settings, defaults for unset keys and any problems' },
  inventory: { help: 'Branch, head, uncommitted files, worktrees and branches; no fetch' },
  'remote-state': {
    help: 'Fetch and verify the remote default branch; --version-path blocks a version collision',
    options: { remote: { kind: 'string' }, 'version-path': { kind: 'string' } },
  },
  push: {
    help: "Push HEAD to the branch's upstream by name, never force, and confirm the remote tip",
    options: { to: { kind: 'string' }, remote: { kind: 'string' } },
  },
  'user-facing': {
    help: 'List changed files people would see, say whether the change needs a design review and suggest its review level',
    options: {
      base: { kind: 'string', about: 'where the change starts (default: base_branch)' },
      head: {
        kind: 'string',
        about: 'commit to stop at (default: the working tree, untracked included)',
      },
    },
  },
  authorization: { help: 'Resolve task permissions; no writes', options: AUTHORIZATION },
  merged: {
    help: 'Classify local branches by whether their content is already in a ref',
    options: { into: { kind: 'string', required: true } },
  },
  'delete-merged': {
    help: 'Delete named local branches that `merged` proves are in a ref',
    options: { into: { kind: 'string', required: true } },
    positionals: ['branches...'],
  },
  start: {
    help: 'Create a task record',
    options: { constraint: { kind: 'list' }, budget: { kind: 'string' } },
    positionals: ['goal'],
  },
  resume: { help: 'Compare a task record with the current state' },
  reconcile: {
    help: 'Record what is actually present now',
    options: { found: { kind: 'string', required: true } },
  },
  checkpoint: {
    help: 'Record a phase boundary',
    options: {
      next: { kind: 'string', required: true },
      acceptance: { kind: 'string', required: true },
    },
    positionals: ['phase'],
  },
  run: {
    help: 'Run a command once per key: run --key <name> [--timeout 120] -- <argv...>',
    options: { key: { kind: 'string', required: true }, timeout: { kind: 'string' } },
    rest: true,
  },
  checks: {
    help: 'Read required checks for the current PR head',
    options: {
      'reviewed-head': {
        kind: 'string',
        about: 'full SHA you reviewed; fails if the PR head has moved off it',
      },
      ...REQUIRE,
    },
    positionals: ['pr'],
  },
  gate: {
    help: 'Check merge readiness only; does not merge',
    options: {
      checks: { kind: 'string', required: true },
      review: { kind: 'string', required: true },
      ...AUTHORIZATION,
    },
  },
  review: {
    help: 'Save the review of one commit, which merge and the merge guard read',
    options: {
      'reviewed-head': { kind: 'string', required: true, about: 'full SHA the review covered' },
      reviewer: { kind: 'string', required: true, choices: ['same-agent', 'independent', 'user'] },
      'review-notes': { kind: 'string', required: true, about: 'what was reviewed and found' },
      'blocking-findings': {
        kind: 'string',
        required: true,
        about: 'unresolved blocker or major findings',
      },
    },
  },
  brief: {
    help: "Print the paragraph to paste into a sub-agent's brief so its delivery goes through this helper",
  },
  merge: {
    help: 'Merge the PR at the reviewed head once every requirement holds; starts a task record if there is none',
    options: {
      review: {
        kind: 'string',
        about:
          'review JSON file; or give the review inline with the next four; without either, the review saved for HEAD',
      },
      'reviewed-head': {
        kind: 'string',
        about: 'full SHA the review covered; alone, uses the review `review` saved for it',
      },
      reviewer: { kind: 'string', choices: ['same-agent', 'independent', 'user'] },
      'review-notes': { kind: 'string', about: 'what was reviewed and found' },
      'blocking-findings': {
        kind: 'string',
        about: 'unresolved blocker or major findings; required inline',
      },
      method: { kind: 'string', choices: MERGE_METHODS },
      ...AUTHORIZATION,
      ...REQUIRE,
    },
    positionals: ['pr'],
  },
  'wait-merge': {
    help: 'Wait for a PR handed to automerge to merge, close or fail a required check, then say what to do next',
    options: {
      timeout: { kind: 'string', about: 'seconds to wait before giving up (default 540)' },
      interval: { kind: 'string', about: 'seconds between reads (default 30)' },
      ...REQUIRE,
    },
    positionals: ['pr'],
  },
  worktree: {
    help: 'Create a task-owned worktree',
    options: { ref: { kind: 'string' } },
    positionals: ['path'],
  },
  cleanup: {
    help: 'Remove a task-owned worktree whose work is preserved',
    options: { 'preserved-ref': { kind: 'string', required: true } },
    positionals: ['path'],
  },
  report: { help: 'Print a shareable text report from a JSON summary', positionals: ['content'] },
  'qa-check': { help: 'Validate a QA run against its scenario', positionals: ['scenario', 'run'] },
  'qa-compare': {
    help: 'Compare with/without-plugin runs',
    positionals: ['scenario', 'with', 'without'],
  },
  usage: {
    help: "Solo's skills from Claude Code's usage export or the skill hook log, plus the helper's own refusals",
    options: {
      days: { kind: 'string', about: 'how far back to look (default 7)' },
      share: {
        kind: 'flag',
        about: 'print only one line of skill run counts to paste somewhere yourself; sends nothing',
      },
      html: {
        kind: 'string',
        about: 'also save the usage dashboard as a self-contained HTML file',
      },
      json: { kind: 'flag', about: 'print the report and the dashboard summary as JSON instead' },
    },
  },
  'codex-agents': {
    help: "Show or install Solo's agent profiles in this project's .codex/agents/",
    options: { install: { kind: 'flag' } },
  },
  'docs-check': {
    help: 'Check instructions and docs against the repository: paths, links and anchors, package scripts and Solo names; exits 1 on problems',
    options: {
      'one-sentence-per-line': {
        kind: 'flag',
        about: 'also report prose lines that hold more than one sentence',
      },
    },
  },
  'retired-names': {
    help: 'Find retired Solo plugin, repository, helper and skill names in instructions, the Codex marketplace file and hooks',
  },
};

type Parsed = Record<string, string | boolean | string[] | undefined> & {
  _: string[];
  rest: string[];
};

type Globals = { repo?: string; task?: string };

function parse(command: string, args: string[], globals: Globals): Parsed {
  const spec = COMMANDS[command] as Spec;
  const options = spec.options ?? {};
  const out: Parsed = { _: [], rest: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === '--' && spec.rest) {
      out.rest = args.slice(i + 1);
      break;
    }
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
      if (name === 'repo' || name === 'task') {
        // Global options may follow the command too; anything after `--` stays the command's.
        const value = inline ?? args[++i];
        if (value === undefined) throw new WorkflowError(`--${name} needs a value`);
        if (globals[name] !== undefined && globals[name] !== value) {
          throw new WorkflowError(`--${name} given twice`);
        }
        globals[name] = value;
        continue;
      }
      const option = options[name];
      if (!option)
        throw new WorkflowError(
          `${command}: unknown option --${name}; \`${command} --help\` lists its options`,
        );
      if (option.kind === 'flag') {
        // A flag takes no value: --authorized=false must never read as a grant.
        if (inline !== undefined) throw new WorkflowError(`${command}: --${name} takes no value`);
        out[name] = true;
        continue;
      }
      const value = inline ?? args[++i];
      if (value === undefined) throw new WorkflowError(`${command}: --${name} needs a value`);
      if (option.choices && !option.choices.includes(value)) {
        throw new WorkflowError(
          `${command}: --${name} must be one of ${option.choices.join(', ')}`,
        );
      }
      if (option.kind === 'list') out[name] = [...((out[name] as string[]) ?? []), value];
      else out[name] = value;
    } else if (spec.rest && !spec.positionals) {
      out.rest = args.slice(i);
      break;
    } else out._.push(arg);
  }
  for (const [name, option] of Object.entries(options)) {
    if (option.required && out[name] === undefined)
      throw new WorkflowError(`${command}: --${name} is required`);
  }
  const wanted = spec.positionals ?? [];
  const variadic = wanted.at(-1)?.endsWith('...');
  if (variadic ? out._.length < wanted.length : out._.length !== wanted.length) {
    throw new WorkflowError(`${command}: expects ${wanted.join(' ') || 'no arguments'}`);
  }
  return out;
}

/** Whether --help or -h stands where `parse` would read an option name, not as a value or `run`'s argv. */
function wantsHelp(command: string, args: string[]): boolean {
  const spec = COMMANDS[command] as Spec;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === '--help' || arg === '-h') return true;
    if (arg === '--') return false;
    if (arg.startsWith('--')) {
      const name = arg.slice(2).split('=')[0] as string;
      const flag = (spec.options?.[name]?.kind ?? 'flag') === 'flag';
      if (!arg.includes('=') && (name === 'repo' || name === 'task' || !flag)) i++;
    } else if (spec.rest && !spec.positionals) return false;
  }
  return false;
}

function commandHelp(command: string): string {
  const spec = COMMANDS[command] as Spec;
  const positionals = (spec.positionals ?? []).map((name) => `<${name}>`).join(' ');
  const lines = [
    `usage: sh server/data/helper/solo ${command}${positionals ? ` ${positionals}` : ''} [--repo <path>] [--task <id>]${spec.options ? ' [options]' : ''}${spec.rest ? ' -- <argv...>' : ''}`,
    '',
    spec.help,
  ];
  const options = Object.entries(spec.options ?? {});
  if (options.length) lines.push('', 'options:');
  for (const [name, option] of options) {
    const value =
      option.kind === 'flag' ? '' : option.choices ? ` <${option.choices.join('|')}>` : ' <value>';
    const notes = [
      option.required ? 'required' : '',
      option.kind === 'list' ? 'may repeat' : '',
      option.about ?? '',
    ].filter(Boolean);
    lines.push(`  --${name}${value}${notes.length ? `  ${notes.join('; ')}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

function usage(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  return [
    'usage: sh server/data/helper/solo <command> [--repo <path>] [--task <id>] [options]  (--repo/--task may also come first)',
    '',
    ...Object.entries(COMMANDS).map(([name, spec]) => `  ${name.padEnd(width)}  ${spec.help}`),
  ].join('\n');
}

/** Short view of a saved task; `resume` prints the full record. */
function summary(data: Task) {
  const last = data.increments.at(-1);
  return {
    goal: data.goal,
    phase: data.phase,
    next_action: data.next_action,
    acceptance: last?.acceptance ?? null,
    increments: `${data.increments.length}/${data.budget_increments ?? 'unbounded'}`,
    end_state: data.end_state,
    head: data.snapshot.head,
    branch: data.snapshot.branch,
    dirty_entries: data.snapshot.status.length,
    fingerprint: data.snapshot.fingerprint,
  };
}

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** The four review fields given inline, with "none" read as a stated zero. */
function inlineReview(args: Parsed) {
  const count = args['blocking-findings'] as string | undefined;
  // A review states its count; an unstated one never reads as zero, and the gate refuses it.
  // "none" is a stated zero: agents write it often enough that refusing it only cost a rerun.
  const findings =
    count !== undefined && /^none$/i.test(count)
      ? 0
      : count !== undefined && /^\d+$/.test(count)
        ? Number(count)
        : undefined;
  return {
    head: args['reviewed-head'] as string | undefined,
    reviewer: args.reviewer as string | undefined,
    notes: args['review-notes'] as string | undefined,
    blocking_findings: findings,
  };
}

/**
 * The review a merge relies on: a JSON file, the same four fields given inline, or the review
 * `solo review` saved for `--reviewed-head` alone or, with no review flags, for HEAD.
 */
function reviewFrom(args: Parsed, repo: string, base?: string): object {
  const inline = ['reviewed-head', 'reviewer', 'review-notes', 'blocking-findings'].filter(
    (name) => args[name] !== undefined,
  );
  if (args.review !== undefined) {
    if (inline.length)
      throw new WorkflowError('merge: give --review or the inline review, not both');
    return json(args.review as string) as object;
  }
  // --reviewed-head alone names the commit whose saved review the merge relies on.
  if (inline.length === 1 && inline[0] === 'reviewed-head') {
    const named = args['reviewed-head'] as string;
    const saved = loadReview(repo, named);
    if (saved) return saved;
    throw new WorkflowError(
      `merge: no review is saved for ${named}: save it with \`solo review --reviewed-head ${named} --reviewer <kind> --review-notes <text> --blocking-findings <n>\`, or give those three on merge too`,
    );
  }
  if (inline.length) return inlineReview(args);
  const head = inventory(repo).head;
  const saved = loadReview(repo, head);
  if (saved) return saved;
  const below = lastReviewedBefore(repo, head, base);
  throw new WorkflowError(
    below
      ? `merge: ${unreviewedCommits(below.head, below.after, head)}`
      : 'merge: needs a review: `solo review --reviewed-head <sha> --reviewer <kind> --review-notes <text> --blocking-findings <n>` first, or the same four on merge, or --review <file>',
  );
}

/** The paragraph a parent pastes into a sub-agent's brief for delivery in this repo. */
function brief(repo: string, settings: ReturnType<typeof load>['config']): string {
  const solo = `sh ${JSON.stringify(join(pluginRoot, 'server', 'data', 'helper', 'solo'))}`;
  const checks = settings.required_checks?.length
    ? settings.required_checks.join(', ')
    : "the base branch's protection rules";
  const policy = settings.merge ?? DEFAULTS.merge;
  return [
    `Deliver through the Sidecut Solo helper, \`${solo}\` (add \`--repo <worktree>\` when running elsewhere), never raw \`gh pr merge\` or a \`gh api\` merge: in this repo the merge guard refuses those without a saved review.`,
    `Push with \`solo push\`, then record the review of that head with \`solo review --reviewed-head <full sha> --reviewer same-agent|independent|user --review-notes <text> --blocking-findings <n>\`. Any commit after it, a fix included, needs its own review first.`,
    `Run \`solo checks <pr> --reviewed-head <full sha>\`: every required check (${checks}) must pass on that exact head, and missing, queued, skipped, cancelled or failed are not passes.`,
    `Merge with \`solo merge <pr>\` (merge policy: ${policy}; it refuses a stacked PR until the one below it merges). After a merge or release, wait until the provider confirms it before reporting or going idle.`,
    'Never skip Git hooks (--no-verify). The brief above says whether proposing or making follow-ups is in scope; if it says nothing, report them and leave them undone.',
    `Repo: ${repo}`,
  ].join(' ');
}

const VERSION = (() => {
  try {
    return (
      (
        json(join(pluginRoot, '.codex-plugin', 'plugin.json')) as {
          version?: string;
        }
      ).version ?? '?'
    );
  } catch {
    return '?';
  }
})();

async function main(argv: string[]): Promise<number> {
  const leading: Globals = {};
  while (argv[0] === '--repo' || argv[0] === '--task') {
    const [flag, value] = argv.splice(0, 2);
    if (value === undefined) throw new WorkflowError(`${flag} needs a value`);
    leading[flag === '--repo' ? 'repo' : 'task'] = value;
  }
  const [command, ...rest] = argv;
  if (command === 'help' && rest[0] && COMMANDS[rest[0]]) {
    process.stdout.write(commandHelp(rest[0]));
    return 0;
  }
  if (command && COMMANDS[command] && wantsHelp(command, rest)) {
    process.stdout.write(commandHelp(command));
    return 0;
  }
  if (
    !command ||
    command === '--help' ||
    command === '-h' ||
    command === 'help' ||
    !COMMANDS[command]
  ) {
    console.log(usage());
    return command && !['--help', '-h', 'help'].includes(command) ? 2 : 0;
  }
  const later: Globals = {};
  const args = parse(command, rest, later);
  for (const name of ['repo', 'task'] as const) {
    const first = leading[name];
    if (first !== undefined && later[name] !== undefined && first !== later[name]) {
      throw new WorkflowError(`--${name} given twice`);
    }
  }
  let repo = leading.repo ?? later.repo;
  // Resolved only now: --help and an explicit --repo must work from a deleted directory.
  repo ??= cwd();
  const explicitTask = leading.task ?? later.task;
  const loaded = load(repo);
  const settings = loaded.config;
  if (loaded.problems.length && ['checks', 'merge', 'gate', 'authorization'].includes(command)) {
    // A broken settings file must not quietly drop a rule such as merge = "never".
    throw new WorkflowError(`fix Sidecut Solo settings first: ${loaded.problems.join('; ')}`);
  }
  // Per-command checks extend repo policy; they must never silently replace it.
  const required = [
    ...new Set([
      ...(settings.required_checks ?? []),
      ...((args['require-check'] as string[]) ?? []),
    ]),
  ];
  const permission = () =>
    resolveAuthorization(settings.merge ?? DEFAULTS.merge, {
      userMerge: Boolean(args.authorized),
      userPublication: Boolean(args['publication-authorized']),
      publicationEffect: (args['publication-effect'] as string) ?? 'unknown',
      hostScope: (args['host-scope'] as string) ?? 'unknown',
    });
  const positional = (index: number) => args._[index] as string;
  let result: unknown;
  switch (command) {
    case 'config':
      result = loaded;
      break;
    case 'inventory':
      result = inventory(repo);
      break;
    case 'remote-state':
      result = freshRemoteState(
        repo,
        (args.remote as string) ?? 'origin',
        args['version-path'] as string | undefined,
      );
      break;
    case 'push':
      result = push(repo, settings.base_branch, {
        to: args.to as string | undefined,
        remote: args.remote as string | undefined,
      });
      break;
    case 'user-facing': {
      const base = (args.base as string) ?? settings.base_branch;
      if (!base) throw new WorkflowError('user-facing: pass --base, or set base_branch');
      result = userFacing(
        repo,
        base,
        args.head as string | undefined,
        settings.review as ReviewPolicy | undefined,
      );
      break;
    }
    case 'authorization':
      result = permission();
      break;
    case 'merged':
      result = markPrMerged(repo, mergedBranches(repo, args.into as string));
      break;
    case 'delete-merged':
      result = deleteMerged(repo, args.into as string, args._);
      break;
    case 'report':
      process.stdout.write(textReport(json(positional(0))));
      return 0;
    case 'qa-check':
      return qaCommand(command, [positional(0), positional(1)]);
    case 'qa-compare':
      return qaCommand(command, [positional(0), positional(1), positional(2)]);
    case 'usage': {
      const days = Number((args.days as string) ?? 7);
      if (!(days > 0)) throw new WorkflowError('--days must be a positive number');
      const records = readJsonl<UsageRecord>(usageFile());
      const refusals = readRefusals();
      const runs = readSkillRuns();
      const since = new Date(Date.now() - days * 86_400_000);
      if (args.share) {
        if (args.json || args.html !== undefined)
          throw new WorkflowError('usage: give --share alone, without --json or --html');
        console.log(shareLine(records, runs, since, days, VERSION));
        return 0;
      }
      if (args.json) {
        if (args.html !== undefined)
          throw new WorkflowError('usage: give --json or --html, not both');
        const output = {
          report: soloReport(records, refusals, since, new Date(), runs),
          summary: summarize(records, refusals, since, new Date(), runs),
        };
        console.log(JSON.stringify(output));
        return 0;
      }
      console.log(soloReport(records, refusals, since, new Date(), runs));
      if (typeof args.html === 'string') {
        writeFileSync(
          args.html,
          dashboardPage(summarize(records, refusals, since, new Date(), runs)),
        );
        console.log(`\nDashboard saved to ${args.html}`);
      }
      return 0;
    }
    case 'codex-agents':
      result = codexAgents(repo, Boolean(args.install));
      break;
    case 'docs-check':
      result = docsCheck(repo, { oneSentencePerLine: Boolean(args['one-sentence-per-line']) });
      break;
    case 'retired-names':
      result = retiredNames(repo);
      break;
    case 'review':
      result = saveReview(repo, inlineReview(args));
      break;
    case 'brief':
      process.stdout.write(`${brief(repo, settings)}\n`);
      return 0;
    case 'checks':
      result = collectChecks(
        repo,
        positional(0),
        required,
        args['reviewed-head'] as string | undefined,
      );
      break;
    case 'wait-merge':
      result = await waitMerge(
        repo,
        positional(0),
        required,
        Number(args.timeout ?? 540),
        Number(args.interval ?? 30),
      );
      break;
    case 'gate': {
      const resolved = permission();
      result = {
        ...gate(
          inventory(repo).head,
          json(args.checks as string),
          resolved.ready,
          json(args.review as string) as object,
        ),
        authorization: resolved,
      };
      break;
    }
    default: {
      // Without --task, each worktree uses its own default record (see defaultTask).
      const task = explicitTask ?? defaultTask(repo);
      const store = new Store(repo, task);
      if (command === 'start') {
        const budget = args.budget === undefined ? undefined : Number(args.budget);
        if (budget !== undefined && !Number.isInteger(budget))
          throw new WorkflowError('--budget must be a whole number');
        result = summary(store.start(positional(0), (args.constraint as string[]) ?? [], budget));
      } else if (command === 'resume') result = store.resume();
      else if (command === 'reconcile') result = summary(store.reconcile(args.found as string));
      else if (command === 'checkpoint') {
        result = summary(
          store.checkpoint(positional(0), args.next as string, args.acceptance as string),
        );
      } else if (command === 'run') {
        result = await run(store, args.key as string, args.rest, Number(args.timeout ?? 120));
      } else if (command === 'merge') {
        const review = reviewFrom(args, repo, settings.base_branch);
        const resolved = permission();
        if (resolved.merge_vetoed)
          throw new WorkflowError('repo settings set merge = "never"; configuration veto');
        // Collected with every other unmet requirement, so one refusal names them all.
        const problems: string[] = [];
        if (resolved.missing_user_authorizations.includes('merge'))
          problems.push('the user has not allowed this merge (--authorized)');
        if (resolved.missing_user_authorizations.includes('publication'))
          problems.push(
            'merging publishes a release the user has not allowed (--publication-authorized)',
          );
        if (resolved.publication_effect === 'unknown')
          problems.push(
            'inspect what merging triggers first (--publication-effect none or automatic)',
          );
        if (resolved.host_scope !== 'allowed')
          problems.push(
            `host permission scope is ${resolved.host_scope.replace('_', ' ')}; use the native tool approval flow (--host-scope)`,
          );
        // A merge always runs under a task record, so a crash mid-merge is recoverable; a short
        // task gets one here instead of being refused.
        if (!store.exists()) {
          const open = store.openElsewhere();
          if (open.length)
            throw new WorkflowError(
              `Task ${open.map((name) => `'${name}'`).join(', ')} still has uncertain work; resume and reconcile it before merging under a new task record`,
            );
          store.start(`Merge PR ${positional(0)}`, []);
          console.error(`Started task record '${task}' for this merge.`);
        }
        result = merge(
          store,
          positional(0),
          resolved.merge_authorized,
          review,
          (args.method as string) ?? settings.merge_method ?? DEFAULTS.merge_method,
          required,
          problems,
          settings.base_branch,
        );
      } else if (command === 'worktree')
        result = createWorktree(store, positional(0), (args.ref as string) ?? 'HEAD');
      else result = cleanupWorktree(store, positional(0), args['preserved-ref'] as string);
    }
  }
  console.log(JSON.stringify(result, null, 2));
  const status = (result as { status?: string; allowed?: boolean }) ?? {};
  if (
    (command === 'gate' && !status.allowed) ||
    (command === 'docs-check' && !(result as { ok?: boolean }).ok) ||
    (command === 'run' && !['passed', 'reconciled'].includes(status.status ?? '')) ||
    (command === 'wait-merge' && status.status !== 'merged')
  ) {
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  try {
    const code = await main(process.argv.slice(2));
    // Exit explicitly: a timed-out command's escaped descendants must not keep the CLI alive.
    await new Promise((done) => process.stdout.write('', done));
    process.exit(code);
  } catch (error) {
    const message = (error as Error).message;
    const argv = process.argv.slice(2);
    let at = 0;
    while (/^--(repo|task)(=|$)/.test(argv[at] ?? ''))
      at += (argv[at] as string).includes('=') ? 1 : 2;
    const name = argv[at] ?? '';
    logRefusal(COMMANDS[name] ? name : '?', message, VERSION);
    console.error(`Blocked: ${message}`);
    if (name === 'merge')
      console.error(
        `Merges follow Deliver Change, which lists every requirement: read ${join(pluginRoot, 'skills', 'solo-deliver-change', 'SKILL.md')}`,
      );
    process.exit(2);
  }
}

export { main };
