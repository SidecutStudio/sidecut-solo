# Deliver the reviewed head

Read this when preparing to push, merge or hand delivery to a repository workflow.

Use the repository's provider tools for the same guarantees if GitHub helpers are unavailable.

Missing tools, credentials, network access or required-check definitions block delivery.

## Push and checks

Use solo push with optional --to BRANCH and --remote NAME.

It pushes HEAD to the upstream's branch name, refuses the base branch and never forces.

Claim pushed only after reading back the matching remote tip. A failed hook, refusal or timeout remains an error.

Use solo checks PR --reviewed-head FULL_SHA for the exact reviewed commit.

The helper checks for head movement while reading results.

Required checks come from repository configuration and provider protection.

Repeat --require-check NAME to add requirements. Pass identical additions to merge; flags never replace configured checks.

Missing, queued, skipped, cancelled, pending or failed required checks block merge.

## Permission

Inspect workflows to determine publication-effect: none, automatic or unknown.

A draft release alone is distinct from published output. Classify actual triggered effects and requested outputs.

Inspect host-scope: allowed, approval_required or unknown. Unknown effects require inspection; unknown host scope requires the host's approval flow.

Use solo authorization with --publication-effect, --host-scope and existing permission flags.

Set --authorized only when the user already authorized merging. Set --publication-authorized only for publication already authorized.

These flags record permission; they cannot create it. A ready permission result does not prove checks or review passed.

Merge permission follows current task instructions and repository policy.

Merge it or when-green permits merging. Ship it or release it also permits the release outputs that merge triggers.

If merge is never, report the policy conflict and resolve it with the user before changing policy or merging.

Reuse permission throughout the task. Ask only when a prepared result still lacks necessary permission.

## Review record

Record the exact head, reviewer kind, blocking finding count and review notes.

Save it with solo review --reviewed-head SHA --reviewer SAME_AGENT|INDEPENDENT|USER --review-notes TEXT --blocking-findings NUMBER. solo merge then reads it for the head, and the merge guard accepts gh pr merge --match-head-commit SHA only for a head with a clean saved review.

The same four flags can also go on solo merge, or --reviewed-head SHA alone to use the review saved for that commit.

Alternatively pass --review FILE containing head, reviewer, blocking_findings and notes.

Keep review files outside the worktree so they cannot change its fingerprint.

Count unresolved blocker, major and Critical design findings, plus minor findings made blocking by the user or repository.

State whether rendered design was reviewed. Name only reviewers that actually ran on that head.

## Merge

Merge only in-scope changes with preserved unrelated work, completed checks, a current review, passing CI and provider rules satisfied.

Run solo merge PR from the PR branch's worktree with --task, the review record and permission arguments.

The helper creates a required merge record when needed, refuses uncertain prior work and rejects records belonging to another worktree.

It rechecks working-state freshness, permission, exact head and CI before merging.

Merge method follows --method, then merge_method, then squash.

After a timeout or failure, inspect the provider and reconcile before retrying.

When provider protection enforces the required checks, gh pr merge --match-head-commit REVIEWED_SHA can provide the same head guard.

Use --auto only under those provider-enforced checks. Never merge with an admin override or omit the matching head.

A repository-required label, merge queue or workflow can replace the helper merge, but cannot replace its permission, review or check gates.

Run checks --reviewed-head immediately before triggering it.

Then run solo wait-merge PR. It returns when the PR merges, closes or fails a required check, or at its timeout; run it again after a timeout. Where the host wakes the session when a background command exits, run it in the background and carry on with independent work. A CI watcher such as Auto-fix speaks up only on failures, so it never stands in for the wait.

Recheck the reviewed head after confirmation. Any new push needs fresh review and checks, and may require removing the trigger.

## Stacked PRs

Merge a stack bottom up, one PR at a time. solo merge refuses a PR whose base is another open PR's branch, and after a merge lists the PRs stacked on it with the retarget command.

1. Commit or set aside your own uncommitted edits first; never merge or check out over them.
2. Retarget the next PR to the base branch with the listed command.
3. Merge the base branch into its branch. Never rebase and force-push a shared branch.
4. Review the new head and save it with solo review. A merge of the base without conflicts needs only a check that it changed nothing else; a resolved conflict needs a real review.
5. Wait for its required checks on that head, then solo merge it.

## Confirm outputs

Confirm merged state and the merged head through the provider.

If another head merged, identify that another session or tool pushed it; shared Git identity does not establish ownership.

Use repository release scripts and CI. Verify requested tags, releases, assets, packages, deployments and installed updates independently.

Name the repository in every provider command, such as `gh release view TAG --repo OWNER/REPO` or a `repos/OWNER/REPO/` path in `gh api`; without it, `gh` uses whichever checkout it runs in. A release or tag counts only when its repository, version and commit all match the merged head. The same version in another repository, or on another commit, is not this release.

Report each output as observed or still unverified.
