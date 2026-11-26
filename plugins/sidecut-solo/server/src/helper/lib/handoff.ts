// Merges handed to automerge. When a session labels a PR for a merge workflow or turns on GitHub's
// auto-merge, the turn-guard hooks record it under the Git common directory at
// solo-handoffs/<key>.json and refuse to end the turn until something will wake the session when
// the PR merges. `solo wait-merge` is that something: it marks itself as the record's waiter, polls
// the PR, and returns when it merges, closes, stops being handed off, a required check fails or the
// wait runs out. The hooks make no network calls, so only wait-merge removes a record.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { collectChecks } from './delivery.ts';
import { commonDir, spawn, WorkflowError } from './git.ts';
import { atomicJson, now } from './state.ts';

type Handoff = { ref?: string; waiter?: { pid: number; at: string }; [key: string]: unknown };

function handoffDir(repo: string): string {
  return join(commonDir(repo), 'solo-handoffs');
}

/** The PR number a ref names: `461` or a pull-request URL. */
function prNumber(pr: string): string {
  return /([1-9][0-9]*)$/.exec(pr)?.[1] ?? pr;
}

/** Record files that point at this PR: its own, and any keyed by a ref that resolved to it. */
function recordsFor(repo: string, pr: string, branch?: string): string[] {
  const dir = handoffDir(repo);
  if (!existsSync(dir)) return [];
  const keys = new Set([`pr-${prNumber(pr)}.json`]);
  if (branch) keys.add(`branch-${branch.replace(/[^\w.-]/g, '_')}.json`);
  return readdirSync(dir)
    .filter((name) => keys.has(name))
    .map((name) => join(dir, name));
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

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export type WaitResult = {
  status: 'merged' | 'closed' | 'not-handed-off' | 'check-failed' | 'timeout';
  pr: string;
  head?: string;
  merge_commit?: string;
  failed_checks?: string[];
  next: string;
};

/**
 * Waits for a PR handed to automerge. Polls every `intervalS` seconds for at most `timeoutS`.
 * While it runs, the handoff record names this process as its waiter, so ending the turn is allowed;
 * a merge or close clears the record, anything else leaves it for the next turn.
 */
export async function waitMerge(
  repo: string,
  pr: string,
  require: string[],
  timeoutS: number,
  intervalS: number,
): Promise<WaitResult> {
  if (!/^[1-9][0-9]*$/.test(pr) && !/^https:\/\/[^\s]+\/pull\/[1-9][0-9]*$/.test(pr))
    throw new WorkflowError('PR must be a positive number or an HTTPS pull-request URL');
  if (!(timeoutS > 0) || !(intervalS > 0))
    throw new WorkflowError('--timeout and --interval must be positive numbers of seconds');
  const mine = join(handoffDir(repo), `pr-${prNumber(pr)}.json`);
  const claim = (paths: string[]) => {
    const all = [...new Set([mine, ...paths])];
    // The PR-number record keeps the session of the branch record it stands in for.
    const session = all.map((path) => read(path).session).find(Boolean);
    for (const path of all)
      atomicJson(path, {
        ...read(path),
        ...(session ? { session } : {}),
        ref: prNumber(pr),
        waiter: { pid: process.pid, at: now() },
      });
  };
  claim([]);
  const deadline = Date.now() + timeoutS * 1000;
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
      const view = seen.pr as {
        state?: string;
        headRefName?: string;
        mergeCommit?: { oid?: string };
      };
      claim(recordsFor(repo, pr, view.headRefName));
      const base = { pr: prNumber(pr), head: seen.head };
      if (view.state === 'MERGED') {
        for (const path of recordsFor(repo, pr, view.headRefName)) rmSync(path, { force: true });
        result = {
          ...base,
          status: 'merged',
          ...(view.mergeCommit?.oid ? { merge_commit: view.mergeCommit.oid } : {}),
          next: 'Carry on with the steps after the merge: confirm the merged head, then every requested release, deployment and cleanup.',
        };
      } else if (view.state === 'CLOSED') {
        for (const path of recordsFor(repo, pr, view.headRefName)) rmSync(path, { force: true });
        result = {
          ...base,
          status: 'closed',
          next: 'The PR was closed without merging. Find out why before doing anything else with it.',
        };
      } else if (!handedOff(repo, pr)) {
        for (const path of recordsFor(repo, pr, view.headRefName)) rmSync(path, { force: true });
        result = {
          ...base,
          status: 'not-handed-off',
          next: 'Nothing will merge it: the PR has no merge label and no auto-merge. Merge through solo merge, or hand it off again and wait.',
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
            next: 'Repair the failing check (Deliver Change, ci-repair), or take the PR off automerge; then wait again.',
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
    // A merge or close removed the records; otherwise give the turn back to the hook.
    for (const path of [mine, ...readdirSafe(repo)]) {
      if (!existsSync(path)) continue;
      const record = read(path);
      if (record.waiter?.pid === process.pid) {
        delete record.waiter;
        atomicJson(path, record);
      }
    }
  }
  return result;
}

function readdirSafe(repo: string): string[] {
  const dir = handoffDir(repo);
  return existsSync(dir) ? readdirSync(dir).map((name) => join(dir, name)) : [];
}
