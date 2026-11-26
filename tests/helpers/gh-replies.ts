// GitHub's REST answers for the delivery tests, scripted through fakeGh().
import type { Rule } from './fixture.ts';

export const PR = 'repos/{owner}/{repo}/pulls/1';

/** A pull request as GitHub's REST API returns it. */
export function restPr(head: string, merged = false, mergeable: boolean | null = true) {
  return {
    number: 1,
    html_url: 'https://github.com/o/r/pull/1',
    head: { sha: head },
    base: { ref: 'main' },
    state: merged ? 'closed' : 'open',
    merged_at: merged ? '2026-01-01T00:00:00Z' : null,
    merge_commit_sha: merged ? 'm' : null,
    mergeable,
    mergeable_state: merged ? 'unknown' : 'clean',
  };
}

/** One page of completed check runs, as `gh api --paginate --slurp` returns them. */
export function runs(...rows: [name: string, conclusion: string][]) {
  return [
    {
      check_runs: rows.map(([name, conclusion]) => ({
        name,
        status: 'completed',
        conclusion,
        html_url: `https://ci/${name}`,
      })),
    },
  ];
}

export const PROTECTION = 'repos/{owner}/{repo}/branches/main/protection/required_status_checks';
export const NO_STATUSES: Rule = { args: ['api'], replies: [{ stdout: { statuses: [] } }] };

/** gh answers for a clean, open PR at `head` with passing checks, then `merge` and `after`. */
export function provider(
  head: string,
  mergeReply: Rule['replies'][number] = { stdout: { merged: true } },
  after: unknown = restPr(head, true),
): Rule[] {
  const pr = restPr(head);
  return [
    { args: ['api', PR], replies: [{ stdout: pr }, { stdout: pr }, { stdout: after }] },
    { args: ['api', '--paginate', '--slurp'], replies: [{ stdout: runs(['tests', 'success']) }] },
    { args: ['api', '--method', 'PUT'], replies: [mergeReply] },
    { args: ['api', PROTECTION], replies: [{ stdout: { contexts: ['tests'] } }] },
    NO_STATUSES,
  ];
}
