// Saved review records, one per reviewed commit, under the Git common directory at
// solo-reviews/<sha>.json. `solo review` writes them, `solo merge` reads them, and the merge guard
// hook refuses a raw `gh pr merge --match-head-commit <sha>` without one.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { commonDir, gitRun, WorkflowError } from './git.ts';
import { atomicJson, now } from './state.ts';

const REVIEWERS = ['same-agent', 'independent', 'user'];
const FULL_SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

export type Review = {
  head?: string;
  reviewer?: string;
  blocking_findings?: unknown;
  notes?: string;
  at?: string;
};

/** What a review must state, whatever head it covers. */
export function reviewProblems(review: Review): string[] {
  const reasons: string[] = [];
  if (!REVIEWERS.includes(review.reviewer ?? '')) {
    reasons.push('review must disclose reviewer as same-agent, independent or user');
  }
  const found = review.blocking_findings;
  if (typeof found !== 'number' || !Number.isInteger(found) || found < 0)
    reasons.push(
      'review must state its blocking findings as a whole number (--blocking-findings <n>)',
    );
  else if (found) reasons.push(`review has ${found} unresolved blocking findings`);
  if (!review.notes) reasons.push('review file needs notes on what was reviewed');
  return reasons;
}

function reviewDir(repo: string): string {
  return join(commonDir(repo), 'solo-reviews');
}

/** Saves a review of one commit. A review with blocking findings is kept too: it is the record. */
export function saveReview(repo: string, review: Review) {
  const head = review.head ?? '';
  if (!FULL_SHA.test(head))
    throw new WorkflowError('review: --reviewed-head must be the full commit SHA you reviewed');
  if (gitRun(repo, ['cat-file', '-e', `${head}^{commit}`]).code)
    throw new WorkflowError(`review: ${head} is not a commit in this repository; fetch it first`);
  const problems = reviewProblems(review).filter((reason) => !/unresolved blocking/.test(reason));
  if (problems.length) throw new WorkflowError(`review: ${problems.join('; ')}`);
  const record = {
    head,
    reviewer: review.reviewer,
    blocking_findings: review.blocking_findings,
    notes: review.notes,
    at: now(),
  };
  const path = join(reviewDir(repo), `${head}.json`);
  atomicJson(path, record);
  return { path, review: record };
}

export function loadReview(repo: string, head: string): Review | undefined {
  if (!FULL_SHA.test(head)) return undefined;
  const path = join(reviewDir(repo), `${head}.json`);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Review;
  } catch {
    return undefined;
  }
}

/** How far `head` runs past `reviewed`, when `reviewed` is one of its ancestors. */
export function commitsAfter(repo: string, reviewed: string, head: string): number | undefined {
  if (!FULL_SHA.test(reviewed) || reviewed === head) return undefined;
  if (gitRun(repo, ['merge-base', '--is-ancestor', reviewed, head]).code) return undefined;
  const count = gitRun(repo, ['rev-list', '--count', `${reviewed}..${head}`]);
  return count.code ? undefined : Number(count.stdout.trim());
}

/** The saved review nearest below `head`, for saying which commits still need one. */
export function lastReviewedBefore(repo: string, head: string) {
  const dir = reviewDir(repo);
  if (!existsSync(dir)) return undefined;
  let best: { head: string; after: number } | undefined;
  for (const name of readdirSync(dir)) {
    const sha = name.replace(/\.json$/, '');
    const after = commitsAfter(repo, sha, head);
    if (after !== undefined && (!best || after < best.after)) best = { head: sha, after };
  }
  return best;
}

/** The refusal for a review that sits below the head being merged. */
export function unreviewedCommits(reviewed: string, after: number, head: string): string {
  const range = `${reviewed.slice(0, 12)}..${head.slice(0, 12)}`;
  return `${after} commit${after === 1 ? '' : 's'} after the reviewed head ${reviewed.slice(0, 12)} have no review: review ${range} (the fix diff), then record it with \`solo review --reviewed-head ${head}\``;
}
