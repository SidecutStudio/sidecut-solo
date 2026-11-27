// Saved review records, one per reviewed commit, under the Git common directory at
// solo-reviews/<sha>.json. `solo review` writes them; `solo merge` and `solo automerge` read them.
// Each states its level and whether it covered the whole change or only a fix diff, so the helper
// counts a PR's deep rounds (deep reviews of the whole change on its commits) and refuses one past
// deep_review_rounds: the session reports to the owner instead of looping.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { commonDir, gitRun, WorkflowError } from './git.ts';
import { atomicJson, now } from './state.ts';

const REVIEWERS = ['same-agent', 'independent', 'user'];
export const REVIEW_LEVELS = ['light', 'standard', 'deep'] as const;
export const REVIEW_SCOPES = ['whole', 'fix-diff'] as const;
const FULL_SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

export type Review = {
  head?: string;
  reviewer?: string;
  blocking_findings?: unknown;
  notes?: string;
  level?: string;
  scope?: string;
  branch?: string;
  deep_round?: number;
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

/**
 * Saves a review of one commit. A review with blocking findings is kept too: it is the record.
 * `solo review` must state the level; a merge keeps the review it relied on as it was given.
 */
export function saveReview(repo: string, review: Review, cap = 3, base?: string, asked = true) {
  const head = review.head ?? '';
  if (!FULL_SHA.test(head))
    throw new WorkflowError('review: --reviewed-head must be the full commit SHA you reviewed');
  if (gitRun(repo, ['cat-file', '-e', `${head}^{commit}`]).code)
    throw new WorkflowError(`review: ${head} is not a commit in this repository; fetch it first`);
  const problems = reviewProblems(review).filter((reason) => !/unresolved blocking/.test(reason));
  if (asked && !(REVIEW_LEVELS as readonly string[]).includes(review.level ?? ''))
    problems.push('review must state its level (--level light, standard or deep)');
  const scope = review.scope ?? 'whole';
  if (!(REVIEW_SCOPES as readonly string[]).includes(scope))
    problems.push('--scope must be whole or fix-diff');
  if (problems.length) throw new WorkflowError(`review: ${problems.join('; ')}`);
  // A change is its branch: reviews saved on another branch (a PR stacked below, or one merged
  // since) belong to that change, even when their commits are this head's ancestors.
  const branch = gitRun(repo, ['symbolic-ref', '--short', '-q', 'HEAD']).stdout.trim();
  const below = reviewsBelow(repo, head, base).filter(
    (item) => (item.review.branch ?? '') === branch,
  );
  if (asked && scope === 'fix-diff') {
    // A fix diff alone is enough only after a review that left no blocker or major findings.
    const last = below[0];
    if (last?.review.blocking_findings !== 0)
      throw new WorkflowError(
        last
          ? `review: the review of ${last.head.slice(0, 12)} left ${String(last.review.blocking_findings)} blocker or major findings, so this head needs a review of the whole change (--scope whole)`
          : 'review: no earlier review of this change is saved, so this head needs a review of the whole change (--scope whole)',
      );
  }
  let round: number | undefined;
  if (asked && review.level === 'deep' && scope === 'whole') {
    const done = below.filter(
      (item) => item.review.level === 'deep' && (item.review.scope ?? 'whole') === 'whole',
    ).length;
    if (done >= cap)
      throw new WorkflowError(
        `review: this change has had ${done} deep review rounds, the most deep_review_rounds allows (${cap}). Don't review it again: stop and report to the owner with two choices, rethink the design or accept the remaining minor findings. If they accept them, fix what they choose and review only that fix diff (--scope fix-diff)`,
      );
    round = done + 1;
  }
  const record = {
    head,
    reviewer: review.reviewer,
    blocking_findings: review.blocking_findings,
    notes: review.notes,
    ...(review.level ? { level: review.level, scope } : {}),
    ...(branch ? { branch } : {}),
    ...(round ? { deep_round: round } : {}),
    at: now(),
  };
  const path = join(reviewDir(repo), `${head}.json`);
  atomicJson(path, record);
  return { path, review: record, ...(round ? { deep_rounds: { used: round, cap } } : {}) };
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

/**
 * Saved reviews of commits below `head` on its own line of work, nearest first. Reviews of
 * commits already on the base branch belong to earlier PRs, so they never count.
 */
function reviewsBelow(repo: string, head: string, base?: string) {
  const dir = reviewDir(repo);
  if (!existsSync(dir)) return [];
  const baseRefs = base
    ? [`refs/remotes/origin/${base}`, `refs/heads/${base}`].filter(
        (ref) => !gitRun(repo, ['rev-parse', '--verify', '--quiet', ref]).code,
      )
    : [];
  const found: { head: string; after: number; review: Review }[] = [];
  for (const name of readdirSync(dir)) {
    const sha = name.replace(/\.json$/, '');
    if (baseRefs.some((ref) => !gitRun(repo, ['merge-base', '--is-ancestor', sha, ref]).code))
      continue;
    const after = commitsAfter(repo, sha, head);
    const review = after === undefined ? undefined : loadReview(repo, sha);
    if (after !== undefined && review) found.push({ head: sha, after, review });
  }
  return found.sort((a, b) => a.after - b.after);
}

/** The saved review nearest below `head`, for saying which commits still need one. */
export function lastReviewedBefore(repo: string, head: string, base?: string) {
  const nearest = reviewsBelow(repo, head, base)[0];
  return nearest && { head: nearest.head, after: nearest.after };
}

/** The refusal for a review that sits below the head being merged. */
export function unreviewedCommits(reviewed: string, after: number, head: string): string {
  const range = `${reviewed.slice(0, 12)}..${head.slice(0, 12)}`;
  return `${after} commit${after === 1 ? '' : 's'} after the reviewed head ${reviewed.slice(0, 12)} ${after === 1 ? 'has' : 'have'} no review: review ${range} (the fix diff), then record it with \`solo review --reviewed-head ${head} --level <level> --scope fix-diff ...\``;
}
