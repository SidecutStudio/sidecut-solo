// Fail-closed current-head checks, verified merges and conservative cleanup of task-owned work.
import { existsSync, lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MERGE_METHODS } from './config.ts';
import {
  git,
  gitRun,
  inventory,
  type Merged,
  mergedBranches,
  spawn,
  WorkflowError,
  worktrees,
} from './git.ts';
import { safeText } from './present.ts';
import {
  commitsAfter,
  type Review,
  reviewProblems,
  saveReview,
  unreviewedCommits,
} from './reviews.ts';
import {
  finished,
  type MergeIntent,
  now,
  type OwnedWorktree,
  owns,
  type Store,
  unstartedMerge,
} from './state.ts';

// `merged` statuses that prove a branch's content is already in the target.
const PROVEN = ['ancestor', 'squash-merged', 'content-in-target', 'pr-merged'];

// biome-ignore lint/suspicious/noExplicitAny: gh JSON is checked field by field by its callers.
type Json = any;

// REST conclusions and commit-status states, as the buckets `gh pr checks` used to report.
const BUCKETS: Record<string, string> = {
  success: 'pass',
  failure: 'fail',
  error: 'fail',
  timed_out: 'fail',
  action_required: 'fail',
  startup_failure: 'fail',
  stale: 'fail',
  cancelled: 'cancel',
  skipped: 'skipping',
  neutral: 'skipping',
  pending: 'pending',
};

/** Lets tests act between the safety checks and the ref transaction. */
export const testHooks: { beforeRefTransaction?: () => void } = {};

function gh(repo: string, args: string[], okCodes: number[] = [0], timeoutMs = 60_000): Json {
  let result: ReturnType<typeof spawn>;
  try {
    result = spawn(['gh', ...args], repo, undefined, timeoutMs);
  } catch (error) {
    throw new WorkflowError(`GitHub check data unavailable: ${(error as Error).message}`);
  }
  if (!okCodes.includes(result.code) || !result.stdout.trim()) {
    const detail = result.stderr.trim() || `exit ${result.code}`;
    if (/unknown flag|unknown json field/i.test(detail)) {
      throw new WorkflowError(
        `Installed GitHub CLI lacks a required command option or JSON field: ${detail}`,
      );
    }
    throw new WorkflowError(`GitHub query failed: ${detail}`);
  }
  return JSON.parse(result.stdout);
}

/**
 * Upgrade unproven branches whose exact tip is the head of a PR merged into the target. Git alone
 * can't prove a squash-merged branch landed once later target commits touch the same lines; a
 * merged PR whose head commit equals the local tip does. Without gh the rows stay unproven.
 */
export function markPrMerged(repo: string, result: Merged): Merged {
  const unproven = result.branches.filter((row) => row.status === 'unproven');
  if (!unproven.length) return result;
  let base = result.into;
  for (const remote of git(repo, ['remote']).split('\n').filter(Boolean)) {
    if (base.startsWith(`${remote}/`)) base = base.slice(remote.length + 1);
  }
  let prs: Json[];
  try {
    // REST, not `gh pr list`: GraphQL is refused in some hosts, such as Claude Code on the web.
    const pages: Json[][] = gh(repo, [
      'api',
      '--paginate',
      '--slurp',
      `repos/{owner}/{repo}/pulls?state=closed&base=${encodeURIComponent(base)}&per_page=100`,
    ]);
    prs = pages
      .flat()
      .filter((pr) => pr.merged_at)
      .map((pr) => ({
        number: pr.number,
        headRefOid: pr.head?.sha,
        mergeCommit: pr.merge_commit_sha ? { oid: pr.merge_commit_sha } : null,
      }));
  } catch (error) {
    return { ...result, pr_lookup: `unavailable: ${(error as Error).message}` };
  }
  const heads = new Map(prs.map((pr) => [pr.headRefOid, pr]));
  for (const row of unproven) {
    const pr = heads.get(row.tip);
    const mergeCommit = pr?.mergeCommit?.oid;
    if (!mergeCommit) continue;
    // Historical landing only proves preservation when the provider's merge commit is already
    // in the resolved target's local history.
    if (gitRun(repo, ['merge-base', '--is-ancestor', mergeCommit, result.target]).code) continue;
    Object.assign(row, { status: 'pr-merged', pr: pr.number });
  }
  return { ...result, pr_lookup: `checked ${prs.length} merged PRs into ${base}` };
}

/**
 * Delete the named local branches, all or none, once `merged` proves each is in `into`. Never a
 * branch checked out in any worktree or the target itself, and each ref only if its tip hasn't
 * moved since it was checked.
 */
export function deleteMerged(repo: string, into: string, names: string[]) {
  if (!names.length) throw new WorkflowError('Name the branches to delete');
  const result = markPrMerged(repo, mergedBranches(repo, into));
  const rows = new Map(result.branches.map((row) => [row.branch, row]));
  const checkedOut = new Set(
    worktrees(repo)
      .map((tree) => tree.branch)
      .filter(Boolean),
  );
  const target = gitRun(repo, ['rev-parse', '--symbolic-full-name', into]).stdout.trim() || into;
  const selected = [...new Set(names)];
  const refused: string[] = [];
  for (const name of selected) {
    const row = rows.get(name);
    if (!row) refused.push(`${name}: no such local branch`);
    else if (target === `refs/heads/${name}`) refused.push(`${name}: it is the target`);
    else if (checkedOut.has(name)) refused.push(`${name}: checked out in a worktree`);
    else if (!PROVEN.includes(row.status))
      refused.push(`${name}: ${row.status}, not proven to be in ${into}`);
  }
  if (refused.length) throw new WorkflowError(`Deleted nothing. ${refused.join('; ')}`);
  const transaction = ['start'];
  if (target.startsWith('refs/')) transaction.push(`verify ${target} ${result.target}`);
  for (const name of selected) transaction.push(`delete refs/heads/${name} ${rows.get(name)?.tip}`);
  transaction.push('prepare', 'commit');
  testHooks.beforeRefTransaction?.();
  const completed = gitRun(repo, ['update-ref', '--stdin'], `${transaction.join('\n')}\n`);
  if (completed.code) {
    throw new WorkflowError(`Deleted nothing. Ref transaction failed: ${completed.stderr.trim()}`);
  }
  const deleted = [];
  const cleanupErrors = [];
  for (const name of selected) {
    const row = rows.get(name);
    const cleanup = gitRun(repo, ['config', '--remove-section', `branch.${name}`]);
    // Exit 5 means the branch had no config section to remove.
    if (cleanup.code !== 0 && cleanup.code !== 5) {
      cleanupErrors.push({ branch: name, error: cleanup.stderr.trim() || `exit ${cleanup.code}` });
    }
    deleted.push({
      branch: name,
      tip: row?.tip,
      status: row?.status,
      restore: `git branch ${name} ${row?.tip}`,
    });
  }
  return { into, deleted, cleanup_errors: cleanupErrors, pr_lookup: result.pr_lookup };
}

export function validatePr(pr: string): void {
  if (
    !/^[1-9][0-9]*$/.test(pr) &&
    !/^https:\/\/[a-zA-Z0-9.-]+\/[\w.-]+\/[\w.-]+\/pull\/[1-9][0-9]*$/.test(pr)
  ) {
    throw new WorkflowError('PR must be a positive number or an HTTPS pull-request URL');
  }
}

/** The `gh api` arguments for a PR given as a number (this repo) or an HTTPS URL. */
export function prApi(pr: string): { host: string[]; repoPath: string; prPath: string } {
  const url = pr.match(/^https:\/\/([^/]+)\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)$/);
  const repoPath = url ? `repos/${url[2]}/${url[3]}` : 'repos/{owner}/{repo}';
  const hostname = url?.[1];
  return {
    host: hostname && hostname !== 'github.com' ? ['--hostname', hostname] : [],
    repoPath,
    prPath: `${repoPath}/pulls/${url ? url[4] : pr}`,
  };
}

/** A REST pull request in the shape `gh pr view` gave, which `gate` and task records use. */
function viewPr(repo: string, pr: string): Json {
  const api = prApi(pr);
  const raw = gh(repo, ['api', ...api.host, api.prPath]);
  return {
    number: raw?.number,
    url: raw?.html_url,
    headRefOid: raw?.head?.sha,
    headRefName: raw?.head?.ref,
    headRepo: raw?.head?.repo?.full_name,
    baseRefName: raw?.base?.ref,
    baseRepo: raw?.base?.repo?.full_name,
    state: raw?.merged_at ? 'MERGED' : String(raw?.state ?? '').toUpperCase(),
    mergeable:
      raw?.mergeable === true ? 'MERGEABLE' : raw?.mergeable === false ? 'CONFLICTING' : 'UNKNOWN',
    mergeStateStatus: String(raw?.mergeable_state ?? 'unknown').toUpperCase(),
    mergeCommit: raw?.merged_at && raw.merge_commit_sha ? { oid: raw.merge_commit_sha } : null,
  };
}

/** Check runs and commit statuses on one commit, as name, state, bucket and link. */
function commitChecks(repo: string, pr: string, sha: string): Json[] {
  const api = prApi(pr);
  const commit = `${api.repoPath}/commits/${sha}`;
  const pages: Json[] = gh(repo, [
    'api',
    ...api.host,
    '--paginate',
    '--slurp',
    `${commit}/check-runs?per_page=100`,
  ]);
  const runs = pages
    .flatMap((page) => page?.check_runs ?? [])
    .map((run: Json) => {
      const done = run.status === 'completed';
      const outcome = String((done ? run.conclusion : run.status) ?? '').toLowerCase();
      return {
        name: run.name,
        state: outcome.toUpperCase(),
        bucket: done ? (BUCKETS[outcome] ?? 'fail') : 'pending',
        link: run.html_url ?? '',
      };
    });
  const combined = gh(repo, ['api', ...api.host, `${commit}/status?per_page=100`]);
  const statuses = (combined?.statuses ?? []).map((status: Json) => ({
    name: status.context,
    state: String(status.state ?? '').toUpperCase(),
    bucket: BUCKETS[status.state] ?? 'fail',
    link: status.target_url ?? '',
  }));
  return [...runs, ...statuses];
}

/** Check names branch protection requires on `base`; none when the branch isn't protected. */
function protectedChecks(repo: string, pr: string, base: string): string[] {
  const api = prApi(pr);
  const path = `${api.repoPath}/branches/${encodeURIComponent(base)}/protection/required_status_checks`;
  let required: Json;
  try {
    required = gh(repo, ['api', ...api.host, path]);
  } catch (error) {
    if (/HTTP 404/.test((error as Error).message)) return [];
    throw error;
  }
  return [
    ...new Set<string>([
      ...(required?.contexts ?? []),
      ...(required?.checks ?? []).map((check: Json) => check.context),
    ]),
  ];
}

/**
 * Required checks come from branch protection, or from `require` on unprotected repos (free
 * private GitHub repos have none). Missing names fail the gate. Everything goes through the REST
 * API: GraphQL, which `gh pr` uses, is refused in some hosts, such as Claude Code on the web.
 * With `reviewedHead`, a PR whose head is no longer that commit fails instead of reporting checks.
 */
export function collectChecks(
  repo: string,
  pr: string,
  require: string[] = [],
  reviewedHead?: string,
) {
  validatePr(pr);
  if (reviewedHead !== undefined && !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(reviewedHead)) {
    throw new WorkflowError('--reviewed-head must be the full commit SHA you reviewed');
  }
  const before = viewPr(repo, pr);
  if (reviewedHead !== undefined && before.headRefOid !== reviewedHead) {
    throw new WorkflowError(
      `PR head moved: it is ${before.headRefOid}, not the reviewed head ${reviewedHead}. Review the new head before relying on its checks.`,
    );
  }
  const names = require.length ? require : protectedChecks(repo, pr, before.baseRefName);
  const checks = commitChecks(repo, pr, before.headRefOid).filter((check) =>
    names.includes(check.name),
  );
  const seen = new Set(checks.map((check) => check.name));
  for (const name of names) {
    if (!seen.has(name)) checks.push({ name, state: 'MISSING', bucket: 'missing', link: '' });
  }
  const after = viewPr(repo, pr);
  if (before.headRefOid !== after.headRefOid)
    throw new WorkflowError('PR head changed during check collection');
  return {
    head: after.headRefOid as string,
    ...(reviewedHead === undefined ? {} : { reviewed_head: reviewedHead }),
    observed_at: now(),
    source: 'live-gh',
    policy: require.length ? 'local-require' : 'branch-protection',
    pr: after,
    required_checks: checks,
  };
}

export type { Review };

export function gate(
  head: string,
  evidence: Json,
  authorized: boolean,
  review: Review,
  maxAgeSeconds = 300,
) {
  const reasons: string[] = [];
  if (!authorized) reasons.push('merge authorization missing');
  if (evidence?.source !== 'live-gh') {
    reasons.push('live GitHub check results required; fixture data cannot authorize a merge');
  }
  if (evidence?.head !== head) reasons.push('CI results are for a different commit than HEAD');
  // Only an ISO timestamp with a timezone counts; a local-time or free-form date is invalid.
  const stamp = evidence?.observed_at;
  const iso =
    typeof stamp === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(stamp);
  const observed = iso ? Date.parse(stamp) : Number.NaN;
  if (Number.isNaN(observed)) reasons.push('CI observation time missing or invalid');
  else {
    const age = (Date.now() - observed) / 1000;
    if (!(age >= 0 && age <= maxAgeSeconds))
      reasons.push('CI results are stale or timestamped in the future');
  }
  const checks = evidence?.required_checks;
  if (!Array.isArray(checks) || !checks.length) reasons.push('required check set empty or unknown');
  else {
    const names = new Set<string>();
    for (const check of checks) {
      if (
        !check?.name ||
        names.has(check.name) ||
        check.state !== 'SUCCESS' ||
        check.bucket !== 'pass'
      ) {
        reasons.push('required checks are missing, duplicated or not successful');
      }
      names.add(check?.name);
    }
  }
  const pr = evidence?.pr ?? {};
  if (pr.headRefOid !== head || pr.state !== 'OPEN') reasons.push('PR is not open at current HEAD');
  if (pr.mergeable !== 'MERGEABLE' || pr.mergeStateStatus !== 'CLEAN') {
    reasons.push('PR mergeability is not confirmed clean');
  }
  // A review records findings and who found them; it never grants the merge.
  if (review.head !== head) reasons.push('review does not cover current HEAD');
  reasons.push(...reviewProblems(review));
  return { allowed: !reasons.length, reasons, head };
}

type OpenPr = { number: number; head: string; base: string; sameRepo: boolean };

/**
 * Open PRs in the PR's repository, as number, head branch, base branch and whether the head branch
 * lives in that repository (a fork's branch can share a name with one here). Null when unreadable.
 */
function openPrs(repo: string, pr: string): OpenPr[] | null {
  const api = prApi(pr);
  try {
    const pages = gh(repo, [
      'api',
      ...api.host,
      `${api.repoPath}/pulls?state=open&per_page=100`,
      '--paginate',
      '--slurp',
    ]);
    if (!Array.isArray(pages)) return null;
    return pages
      .flatMap((page: Json) => (Array.isArray(page) ? page : [page]))
      .filter((item: Json) => item?.number && item.head?.ref && item.base?.ref)
      .map((item: Json) => ({
        number: item.number,
        head: item.head.ref,
        base: item.base.ref,
        sameRepo:
          Boolean(item.head.repo?.full_name) &&
          item.head.repo.full_name === item.base.repo?.full_name,
      }));
  } catch {
    return null;
  }
}

/** Where the PR head is checked out, when it isn't here: the fix for a HEAD mismatch. */
function headElsewhere(repo: string, pr: string, head: string, prHead: string): string {
  const mismatch = `HEAD here is ${head.slice(0, 12)}, not PR ${pr}'s head ${prHead.slice(0, 12)}`;
  const there = worktrees(repo).find((tree) => tree.head === prHead && !tree.current);
  return there
    ? `${mismatch}; it is checked out in ${there.path}: run the merge from there (--repo ${JSON.stringify(there.path)})`
    : `${mismatch}; check out the PR head, or run from the worktree that has it (--repo <worktree>)`;
}

/**
 * Merges only when every requirement holds, and lists every one that doesn't in a single
 * refusal. `problems` are the caller's own blockers, such as missing permission; with any, the
 * provider isn't touched and the refusal names what can be known locally.
 */
export function merge(
  store: Store,
  pr: string,
  authorized: boolean,
  review: Review,
  method = 'squash',
  require: string[] = [],
  problems: string[] = [],
  baseBranch?: string,
) {
  if (!(MERGE_METHODS as readonly string[]).includes(method)) {
    throw new WorkflowError('Merge method must be squash, merge or rebase');
  }
  return store.writer(() => {
    const data = store.load();
    const actual = inventory(store.repo);
    if (finished(data)) {
      // An earlier merge under this record is done; its stale snapshot isn't this merge's risk.
      Object.assign(data, { end_state: 'merged', snapshot: actual });
    }
    if (
      unstartedMerge(data) &&
      (data.end_state === 'needs_reconciliation' ||
        data.snapshot.fingerprint !== actual.fingerprint)
    ) {
      // An earlier merge here was refused before it began, so nothing ran under this record.
      data.reconciliations.push({
        at: now(),
        resolution: 'superseded',
        note: `${data.goal} never started; this record now serves PR ${pr}`,
      });
      Object.assign(data, { goal: `Merge PR ${pr}`, end_state: 'in_progress', snapshot: actual });
    }
    if (
      data.end_state === 'needs_reconciliation' ||
      Object.values(data.actions).some((a) => a.status === 'started' || a.status === 'uncertain')
    ) {
      throw new WorkflowError('Reconcile uncertain work before delivery');
    }
    if (data.snapshot.fingerprint !== actual.fingerprint) {
      throw new WorkflowError('Working state changed; resume and reconcile before delivery');
    }
    const reasons = [...problems];
    if (actual.status.length) {
      const shown = actual.status.slice(0, 3).join(', ');
      const more = actual.status.length > 3 ? ` and ${actual.status.length - 3} more` : '';
      reasons.push(
        `Delivery worktree must be clean (${shown}${more}); preserve user work separately`,
      );
    }
    if (problems.length) {
      reasons.push(
        ...reviewProblems(review),
        "the PR's checks and head are read once these are fixed",
      );
      throw new WorkflowError(`Merge blocked: ${reasons.join('; ')}`);
    }
    let evidence: ReturnType<typeof collectChecks>;
    try {
      evidence = collectChecks(store.repo, pr, require);
    } catch (error) {
      if (!reasons.length) throw error;
      reasons.push(`couldn't read the PR's checks: ${(error as Error).message}`);
      throw new WorkflowError(`Merge blocked: ${reasons.join('; ')}`);
    }
    // Judge the PR at its own head, so a checkout elsewhere is one reason, not three.
    if (evidence.head !== actual.head)
      reasons.push(headElsewhere(store.repo, pr, actual.head, evidence.head));
    // Commits pushed after the review, such as a fix, need their own review before merging.
    const unreviewed = review.head
      ? commitsAfter(store.repo, review.head, evidence.head)
      : undefined;
    const judged = gate(evidence.head, evidence, authorized, review).reasons;
    reasons.push(
      ...(unreviewed === undefined
        ? judged
        : [
            unreviewedCommits(review.head as string, unreviewed, evidence.head),
            ...judged.filter((reason) => reason !== 'review does not cover current HEAD'),
          ]),
    );
    // A stacked PR merges into the branch below it, not the base: merge the stack bottom up.
    // Without base_branch, the clone's own record of the remote default; no network under the lock.
    const base =
      baseBranch ||
      gitRun(store.repo, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
        .stdout.trim()
        .replace(/^origin\//, '');
    const prBase = evidence.pr?.baseRefName as string | undefined;
    if (base && prBase && prBase !== base) {
      const below = openPrs(store.repo, pr)?.find((item) => item.sameRepo && item.head === prBase);
      if (below)
        reasons.push(
          `PR ${pr} is stacked on PR ${below.number} (${prBase}): merge PR ${below.number} first, then retarget this one to ${base} and review its new head`,
        );
    }
    if (reasons.length) throw new WorkflowError(`Merge blocked: ${reasons.join('; ')}`);
    // Host protection rules remain authoritative; no admin/auto/force switches.
    const intent: MergeIntent = {
      pr,
      head: actual.head,
      reviewer: review.reviewer as string,
      status: 'started',
      at: now(),
    };
    const prior = data.merge_intent;
    if (prior?.status === 'verified') {
      // Saved by an older helper that kept verified merges in place; it is history.
      data.merge_history = [...(data.merge_history ?? []), prior];
      delete data.merge_intent;
    } else if (prior) {
      throw new WorkflowError('Prior merge intent exists; query provider before any repeat');
    }
    data.merge_intent = intent;
    store.save(data);
    let failure: string | null = null;
    try {
      const api = prApi(pr);
      // `sha` makes GitHub refuse the merge if the PR head moved since the checks were read.
      const completed = spawn(
        [
          'gh',
          'api',
          ...api.host,
          '--method',
          'PUT',
          `${api.prPath}/merge`,
          '-f',
          `merge_method=${method}`,
          '-f',
          `sha=${actual.head}`,
        ],
        store.repo,
        undefined,
        120_000,
      );
      if (completed.code)
        failure = completed.stderr.trim().slice(-2000) || `exit ${completed.code}`;
    } catch (error) {
      failure = (error as Error).message;
    }
    if (failure !== null) {
      // The provider may or may not have merged: require inspection, then `reconcile`.
      Object.assign(intent, { status: 'uncertain', error: failure });
      Object.assign(data, { end_state: 'needs_reconciliation', updated_at: now() });
      store.save(data);
      throw new WorkflowError(
        'Merge did not confirm success; inspect the provider, then reconcile before retry',
      );
    }
    let after: Json;
    try {
      after = viewPr(store.repo, pr);
      if (after?.state !== 'MERGED' || !after.mergeCommit || after.headRefOid !== actual.head) {
        throw new WorkflowError('Post-merge state unconfirmed; do not claim delivery');
      }
    } catch (error) {
      Object.assign(intent, { status: 'uncertain', error: (error as Error).message.slice(-2000) });
      Object.assign(data, { end_state: 'needs_reconciliation', updated_at: now() });
      store.save(data);
      throw new WorkflowError(
        'Post-merge state unconfirmed; inspect the provider, then reconcile before retry',
      );
    }
    Object.assign(intent, { status: 'verified', after });
    // The merge is the review record's proof of use; keep one for this head either way.
    // The saved record says what this merge relied on, even if an older one was there.
    try {
      saveReview(store.repo, review, Number.POSITIVE_INFINITY, undefined, false);
    } catch {}
    // A verified merge is finished history; only started/uncertain intents block a new merge.
    data.merge_history = [...(data.merge_history ?? []), intent];
    delete data.merge_intent;
    data.evidence.push(evidence);
    Object.assign(data, { end_state: 'merged', updated_at: now() });
    store.save(data);
    // PRs stacked on the merged branch now point at a branch that is done; name each next step.
    const headRef = evidence.pr?.headRefName as string | undefined;
    const fromHere =
      Boolean(evidence.pr?.headRepo) && evidence.pr.headRepo === evidence.pr.baseRepo;
    const open = headRef && fromHere ? openPrs(store.repo, pr) : null;
    const stacked =
      headRef && open
        ? open
            .filter((item) => item.base === headRef)
            .map((item) => ({
              pr: item.number,
              next: `retarget PR ${item.number} to ${prBase}, merge ${prBase} into its branch (no rebase or force-push), then review and check its new head before \`solo merge ${item.number}\``,
              retarget: `gh api -X PATCH ${prApi(pr).repoPath}/pulls/${item.number} -f base=${prBase}`,
            }))
        : [];
    return stacked.length ? { ...after, stacked_prs: stacked } : after;
  });
}

const BRANCH_NAME = /^[A-Za-z0-9][\w./-]*$/;

/** The remote's default branch: the local `<remote>/HEAD` symref a clone keeps, else asked. */
function defaultBranch(repo: string, remote: string): string {
  const local = gitRun(repo, ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]);
  if (!local.code) return local.stdout.trim().slice(remote.length + 1);
  const listed = spawn(
    ['git', '-C', repo, 'ls-remote', '--symref', remote, 'HEAD'],
    undefined,
    undefined,
    60_000,
  );
  return /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m.exec(listed.stdout)?.[1] ?? '';
}

/**
 * Push HEAD to the current branch's upstream by that branch's own name, so a worktree branch named
 * differently from the remote branch it tracks still lands there (a bare `git push` is refused in
 * that case under push.default=simple, and the refusal is easy to miss in hook output). Never
 * forces, never pushes the base branch, and says `pushed` only once the remote tip reads back as
 * HEAD, whatever the push's exit code was.
 */
export function push(
  repo: string,
  baseBranch?: string,
  options: { to?: string; remote?: string } = {},
) {
  const head = git(repo, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const local = git(repo, ['branch', '--show-current']);
  const config = (key: string) => gitRun(repo, ['config', '--get', key]).stdout.trim();
  const trackedRemote = local ? config(`branch.${local}.remote`) : '';
  const trackedRef = local ? config(`branch.${local}.merge`) : '';
  const tracked =
    Boolean(trackedRemote) && trackedRemote !== '.' && trackedRef.startsWith('refs/heads/');
  const remote = options.remote ?? (tracked ? trackedRemote : 'origin');
  const branch = options.to ?? (tracked ? trackedRef.slice('refs/heads/'.length) : local);
  if (!branch) throw new WorkflowError('Detached HEAD: name the remote branch with --to');
  if (
    !BRANCH_NAME.test(branch) ||
    gitRun(repo, ['check-ref-format', `refs/heads/${branch}`]).code
  ) {
    throw new WorkflowError(`Not a usable branch name: ${JSON.stringify(branch)}`);
  }
  if (!git(repo, ['remote']).split('\n').includes(remote)) {
    throw new WorkflowError(`No remote named ${JSON.stringify(remote)}`);
  }
  const base = baseBranch ?? defaultBranch(repo, remote);
  if (base && branch === base) {
    throw new WorkflowError(
      `Refusing to push ${branch}: it is the base branch, which changes only through a merged PR`,
    );
  }
  const tip = (): string | null => {
    const listed = spawn(
      ['git', '-C', repo, 'ls-remote', '--heads', remote, `refs/heads/${branch}`],
      undefined,
      undefined,
      60_000,
    );
    if (listed.code) {
      throw new WorkflowError(`Remote ${remote} unreachable: ${listed.stderr.trim()}`);
    }
    return listed.stdout.split(/\s+/)[0] || null;
  };
  const before = tip();
  const setUpstream = Boolean(local) && !tracked;
  const result = { remote, branch, head, before, after: before, status: 'up-to-date' };
  if (before === head) return result;
  let pushed: ReturnType<typeof spawn>;
  try {
    // Hooks such as a pre-push check run inside this call, so give them time.
    pushed = spawn(
      [
        'git',
        '-C',
        repo,
        'push',
        ...(setUpstream ? ['--set-upstream'] : []),
        remote,
        `HEAD:refs/heads/${branch}`,
      ],
      undefined,
      undefined,
      600_000,
    );
  } catch (error) {
    throw new WorkflowError(
      `${(error as Error).message}; the remote may or may not have moved. Run push again: it reads the remote first`,
    );
  }
  if (pushed.code) {
    // Git passes a pre-push hook's stdout through on its own stdout, so keep a tail of each stream:
    // the hook's lines say why, Git's last line only says that the push failed. Redact before
    // trimming, so a cut can't split a token or path out of the pattern that hides it.
    const tail = (text: string) =>
      safeText(text.trim()).split('\n').slice(-20).join('\n').slice(-1000);
    const detail = [pushed.stdout, pushed.stderr].map(tail).filter(Boolean).join('\n');
    throw new WorkflowError(`Push refused (exit ${pushed.code}):\n${detail}`);
  }
  const after = tip();
  if (after !== head) {
    throw new WorkflowError(
      `Push unconfirmed: ${remote}/${branch} is at ${after ?? 'no such branch'}, HEAD is ${head}`,
    );
  }
  return { ...result, after, status: 'pushed', upstream_set: setUpstream };
}

export function createWorktree(store: Store, destination: string, ref: string): OwnedWorktree {
  const path = resolve(destination);
  if (existsSync(path)) throw new WorkflowError('Task worktree destination must not exist');
  return store.writer(() => {
    const data = store.load();
    const oid = git(store.repo, ['rev-parse', '--verify', `${ref}^{commit}`]);
    const record: OwnedWorktree = {
      path,
      created_from: oid,
      status: 'creating',
      at: now(),
      creation_token: crypto.randomUUID().replaceAll('-', ''),
    };
    data.owned_worktrees.push(record);
    store.save(data);
    git(store.repo, ['worktree', 'add', '--detach', path, oid]);
    record.path = realpathSync(path);
    const admin = git(record.path, ['rev-parse', '--path-format=absolute', '--git-dir']);
    writeFileSync(join(admin, 'solo-workflow-owner'), record.creation_token, 'ascii');
    record.status = 'created';
    // The task now works in its worktree; later commands run with --repo pointing there.
    Object.assign(data, { snapshot: inventory(record.path), updated_at: now() });
    store.save(data);
    return record;
  });
}

export function cleanupWorktree(
  store: Store,
  destination: string,
  preservedRef: string,
): OwnedWorktree {
  const path = existsSync(destination) ? realpathSync(destination) : resolve(destination);
  return store.writer(() => {
    const data = store.load();
    const owned = data.owned_worktrees.find(
      (item) => item.path === path && item.status === 'created',
    );
    if (
      !owned ||
      path === store.repo ||
      lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()
    ) {
      throw new WorkflowError("Cleanup limited to this task's recorded worktrees");
    }
    const before = inventory(path);
    if (!owns(owned))
      throw new WorkflowError('Worktree creation identity changed; preserve replacement worktree');
    // Includes ignored files: they may contain valuable local artifacts.
    if (git(path, ['status', '--porcelain', '--untracked-files=all', '--ignored'])) {
      throw new WorkflowError('Worktree has tracked, untracked or ignored work; preserve first');
    }
    const durableRef = git(store.repo, ['rev-parse', '--symbolic-full-name', preservedRef]);
    if (!durableRef.startsWith('refs/heads/') && !durableRef.startsWith('refs/tags/')) {
      throw new WorkflowError(
        'Preservation requires a named local branch or tag, not HEAD or a SHA',
      );
    }
    const target = git(store.repo, ['rev-parse', '--verify', `${durableRef}^{commit}`]);
    if (gitRun(store.repo, ['merge-base', '--is-ancestor', before.head, target]).code) {
      throw new WorkflowError(
        `Worktree HEAD ${before.head} is not contained in ${durableRef}; anchor its commits before cleanup`,
      );
    }
    git(store.repo, ['worktree', 'remove', path]);
    const listing = git(store.repo, ['worktree', 'list', '--porcelain']);
    // Match whole `worktree <path>` lines under either spelling of the path, so a sibling such as
    // <path>-2 never trips the check.
    const slash = (item: string) => item.replaceAll('\\', '/');
    const spellings = new Set([path, resolve(destination)].map(slash));
    const listed = listing.split('\n').map((line) => slash(line.replace(/^worktree /, '')));
    if (existsSync(path) || listed.some((item) => spellings.has(item))) {
      throw new WorkflowError('Cleanup postcondition failed');
    }
    if (git(store.repo, ['rev-parse', `${durableRef}^{commit}`]) !== target) {
      throw new WorkflowError(
        'Preservation reference changed during cleanup; investigate immediately',
      );
    }
    Object.assign(owned, { status: 'removed', preserved_at: target, removed_at: now() });
    store.save(data);
    return owned;
  });
}
