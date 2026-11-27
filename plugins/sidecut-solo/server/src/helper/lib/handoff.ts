// Merges handed to automerge. `solo automerge` is the one way to hand a PR to a merge label or
// GitHub's auto-merge: it checks the saved review of the PR head, the user's permission and the
// required checks, makes the handoff, writes solo-handoffs/pr-<n>.json under the Git common
// directory for this worktree, and waits. `solo wait-merge` waits on its own: it marks itself as the
// record's waiter until the end of the wait it announces, polls the PR, and returns when it merges,
// closes, stops being handed off, a required check fails or the wait runs out. The Stop hook trusts
// the record and GitHub's own PR state; it never reads shell commands.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { collectChecks, openPrs, prApi, validatePr } from './delivery.ts';
import { commonDir, git, spawn, WorkflowError } from './git.ts';
import { lastReviewedBefore, loadReview, reviewProblems, unreviewedCommits } from './reviews.ts';
import { atomicJson, now } from './state.ts';

type Handoff = {
  ref?: string;
  waiter?: { pid: number; at: string; until?: string };
  [key: string]: unknown;
};

/** How long past its announced end a waiter still counts, for the poll in flight. */
const GRACE_MS = 60_000;

/** The PR number a ref names: `461` or a pull-request URL. */
function prNumber(pr: string): string {
  return /([1-9][0-9]*)$/.exec(pr)?.[1] ?? pr;
}

function recordPath(repo: string, pr: string): string {
  return join(commonDir(repo), 'solo-handoffs', `pr-${prNumber(pr)}.json`);
}

function read(path: string): Handoff {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Handoff;
  } catch {
    return {};
  }
}

/** Labels a merge workflow merges on; the hooks use the same pattern. */
const MERGE_LABEL = /auto[-_ ]?merge/i;

/** Whether GitHub auto-merge or a merge label is still set on the PR; true when gh can't say. */
function handedOff(repo: string, pr: string): boolean {
  const run = spawn(['gh', 'pr', 'view', pr, '--json', 'labels,autoMergeRequest'], repo);
  if (run.code) return true;
  try {
    const view = JSON.parse(run.stdout) as {
      labels?: { name?: string }[];
      autoMergeRequest?: unknown;
    };
    return (
      Boolean(view.autoMergeRequest) ||
      (view.labels ?? []).some((label) => MERGE_LABEL.test(label.name ?? ''))
    );
  } catch {
    return true;
  }
}

/** Removes a merge label through REST, as `solo automerge` added it. */
function takeLabelOff(repo: string, pr: string, label: string) {
  const api = prApi(pr);
  return spawn(
    [
      'gh',
      'api',
      ...api.host,
      '--method',
      'DELETE',
      `${api.repoPath}/issues/${prNumber(pr)}/labels/${encodeURIComponent(label)}`,
    ],
    repo,
  );
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export type WaitResult = {
  status:
    | 'merged'
    | 'merged-unreviewed'
    | 'closed'
    | 'not-handed-off'
    | 'head-moved'
    | 'check-failed'
    | 'timeout';
  pr: string;
  head?: string;
  merge_commit?: string;
  failed_checks?: string[];
  next: string;
};

/**
 * Waits for a PR handed to automerge. Polls every `intervalS` seconds for at most `timeoutS`.
 * While it runs, the handoff record names this process as its waiter until the wait's end, so
 * ending the turn is allowed; a merge or close clears the record, anything else leaves it.
 */
export async function waitMerge(
  repo: string,
  pr: string,
  require: string[],
  timeoutS: number,
  intervalS: number,
): Promise<WaitResult> {
  validatePr(pr);
  if (!(timeoutS > 0) || !(intervalS > 0))
    throw new WorkflowError('--timeout and --interval must be positive numbers of seconds');
  const path = recordPath(repo, pr);
  const deadline = Date.now() + timeoutS * 1000;
  // Only `solo automerge` and the Stop hook say which worktree owns a record; a wait doesn't.
  atomicJson(path, {
    ...read(path),
    ref: prNumber(pr),
    waiter: { pid: process.pid, at: now(), until: new Date(deadline + GRACE_MS).toISOString() },
  });
  const done = () => rmSync(path, { force: true });
  let result: WaitResult | undefined;
  try {
    while (!result) {
      let seen: ReturnType<typeof collectChecks>;
      try {
        seen = collectChecks(repo, pr, require);
      } catch (error) {
        // A push mid-read is retried on the next poll; anything else is a real refusal.
        if (!/head changed/.test((error as Error).message)) throw error;
        await sleep(intervalS * 1000);
        continue;
      }
      const view = seen.pr as { state?: string; mergeCommit?: { oid?: string } };
      const base = { pr: prNumber(pr), head: seen.head };
      const handedHead = read(path).head;
      if (view.state === 'MERGED') {
        done();
        // A push after the handoff that merged before a poll saw it went in unreviewed.
        const moved = typeof handedHead === 'string' && handedHead !== seen.head;
        result = {
          ...base,
          status: moved ? 'merged-unreviewed' : 'merged',
          ...(view.mergeCommit?.oid ? { merge_commit: view.mergeCommit.oid } : {}),
          next: moved
            ? `It merged at ${seen.head.slice(0, 12)}, not the reviewed ${handedHead.slice(0, 12)}: review ${handedHead.slice(0, 12)}..${seen.head.slice(0, 12)} now and tell the user what merged unreviewed and what you found, before the steps after the merge.`
            : 'Carry on with the steps after the merge: confirm the merged head, then every requested release, deployment and cleanup.',
        };
      } else if (view.state === 'CLOSED') {
        done();
        result = {
          ...base,
          status: 'closed',
          next: 'The PR was closed without merging. Find out why before doing anything else with it.',
        };
      } else if (typeof handedHead === 'string' && handedHead !== seen.head) {
        // `solo automerge` handed off a reviewed head; a later push must not merge unreviewed.
        const handed = read(path);
        const off = String(handed.via ?? '').startsWith('label ')
          ? takeLabelOff(repo, pr, String(handed.via).slice(6))
          : spawn(['gh', 'pr', 'merge', pr, '--disable-auto'], repo);
        done();
        result = {
          ...base,
          status: 'head-moved',
          next: off.code
            ? `The PR head moved from the reviewed ${String(handed.head).slice(0, 12)} after the handoff, and taking it off automerge failed (${(off.stderr || off.stdout).trim().slice(0, 200)}): take it off by hand now, then review the new commits and run solo automerge again.`
            : `The PR head moved from the reviewed ${String(handed.head).slice(0, 12)} after the handoff, so it was taken off automerge. Review the new commits, save the review, then run solo automerge again.`,
        };
      } else if (!handedOff(repo, pr)) {
        done();
        result = {
          ...base,
          status: 'not-handed-off',
          next: 'Nothing will merge it: the PR has no merge label and no auto-merge. Merge through solo merge, or hand it off with solo automerge.',
        };
      } else {
        const failed = seen.required_checks
          .filter((check) => ['fail', 'cancel'].includes(String(check.bucket)))
          .map((check) => String(check.name));
        if (failed.length)
          result = {
            ...base,
            status: 'check-failed',
            failed_checks: failed,
            next: 'Take the PR off automerge before pushing a fix (gh pr merge PR --disable-auto, or remove the label), so the unreviewed fix cannot merge. Then repair the check (Deliver Change, ci-repair), review the fix and run solo automerge again.',
          };
        else if (Date.now() + intervalS * 1000 > deadline)
          result = {
            ...base,
            status: 'timeout',
            next: 'Still open with checks pending. Run solo wait-merge again to keep waiting.',
          };
        else await sleep(intervalS * 1000);
      }
    }
  } finally {
    // A merge or close removed the record; otherwise give the turn back to the hook.
    if (existsSync(path)) {
      const record = read(path);
      if (record.waiter?.pid === process.pid) {
        delete record.waiter;
        atomicJson(path, record);
      }
    }
  }
  return result;
}

export type AutomergeOptions = {
  /** A label a merge workflow acts on; without one, GitHub's auto-merge. */
  label?: string;
  method: string;
  /** Unmet permission requirements, as `solo merge` collects them. */
  problems: string[];
  require: string[];
  base?: string;
  wait: boolean;
  timeoutS: number;
  intervalS: number;
};

/**
 * Hands a PR to automerge once its head has a clean saved review and the user allowed the merge,
 * records the handoff for this worktree, and waits for it unless told not to.
 */
export async function automerge(repo: string, pr: string, options: AutomergeOptions) {
  validatePr(pr);
  if (options.label !== undefined && !MERGE_LABEL.test(options.label))
    throw new WorkflowError(
      `automerge: ${options.label} doesn't look like a merge label (automerge, auto-merge); the turn guard reads only those`,
    );
  const reasons = [...options.problems];
  const seen = collectChecks(repo, pr, options.require);
  const view = seen.pr as { state?: string };
  if (view.state !== 'OPEN') reasons.push(`PR ${pr} is ${String(view.state).toLowerCase()}`);
  const review = loadReview(repo, seen.head);
  if (!review) {
    const below = lastReviewedBefore(repo, seen.head, options.base);
    reasons.push(
      below
        ? unreviewedCommits(below.head, below.after, seen.head)
        : `no review is saved for the PR head ${seen.head}: review it and record it with \`solo review --reviewed-head ${seen.head} --level <level> ...\``,
    );
  } else reasons.push(...reviewProblems(review));
  // Each required check has to be there, passed or still running: a failed one won't merge, and
  // one missing never reports, so automerge would wait on nothing or merge without it.
  const unfit = seen.required_checks
    .filter((check) => !['pass', 'pending'].includes(String(check.bucket)))
    .map((check) => `${String(check.name)} (${String(check.bucket)})`);
  if (unfit.length) reasons.push(`required checks not passed or running: ${unfit.join(', ')}`);
  // gh turns --auto into an immediate merge when GitHub would merge the PR now; that is a merge, so
  // it goes through solo merge and its gates. A label workflow decides for itself.
  const state = String((seen.pr as { mergeStateStatus?: string }).mergeStateStatus ?? '');
  if (!options.label && ['CLEAN', 'UNSTABLE', 'HAS_HOOKS'].includes(state))
    reasons.push(
      `GitHub would merge this PR at once (${state.toLowerCase()}), since nothing makes it wait for the required checks: merge it with solo merge once they pass`,
    );
  // GitHub works mergeability out in the background; until it has, gh's own read may say clean.
  else if (!options.label && !['BLOCKED', 'BEHIND'].includes(state))
    reasons.push(
      `GitHub reports this PR as ${state.toLowerCase() || 'unknown'}, not blocked on its checks: if it is still working that out (unknown), run solo automerge again in a moment; otherwise fix what it reports first`,
    );
  // A stacked PR merges into the branch below it, not the base: merge the stack bottom up.
  const prBase = (seen.pr as { baseRefName?: string }).baseRefName;
  if (options.base && prBase && prBase !== options.base) {
    const below = openPrs(repo, pr)?.find((item) => item.sameRepo && item.head === prBase);
    if (below)
      reasons.push(
        `PR ${pr} is stacked on PR ${below.number} (${prBase}): merge PR ${below.number} first, then retarget this one to ${options.base} and review its new head`,
      );
  }
  if (reasons.length) throw new WorkflowError(`Automerge blocked: ${reasons.join('; ')}`);
  const api = prApi(pr);
  const number = prNumber(pr);
  const made = options.label
    ? // REST, not GraphQL, which some hosts refuse.
      spawn(
        [
          'gh',
          'api',
          ...api.host,
          '--method',
          'POST',
          `${api.repoPath}/issues/${number}/labels`,
          '-f',
          `labels[]=${options.label}`,
        ],
        repo,
      )
    : spawn(
        [
          'gh',
          'pr',
          'merge',
          pr,
          '--auto',
          `--${options.method}`,
          '--match-head-commit',
          seen.head,
        ],
        repo,
      );
  if (made.code)
    throw new WorkflowError(
      `automerge: GitHub refused the handoff: ${(made.stderr || made.stdout).trim().slice(0, 400)}`,
    );
  const path = recordPath(repo, pr);
  const via = options.label ? `label ${options.label}` : 'auto-merge';
  const { outside_solo: _outside, blocks: _blocks, ...prior } = read(path);
  atomicJson(path, {
    ...prior,
    ref: number,
    head: seen.head,
    via,
    worktree: git(repo, ['rev-parse', '--show-toplevel']),
    at: now(),
    blocks: 0,
  });
  const handed = { pr: number, head: seen.head, via };
  if (!options.wait)
    return {
      ...handed,
      status: 'handed-off' as const,
      next: `Run solo wait-merge ${number} now; the turn guard holds the turn until something waits on it.`,
    };
  return {
    ...handed,
    ...(await waitMerge(repo, pr, options.require, options.timeoutS, options.intervalS)),
  };
}
