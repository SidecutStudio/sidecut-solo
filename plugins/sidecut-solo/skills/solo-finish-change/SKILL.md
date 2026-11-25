---
name: solo-finish-change
description: "Completes checks, delivery and cleanup under repository rules. Use when merging, shipping or recovering unfinished work. Not for skipping checks or publication permission."
argument-hint: "[PR number or branch]"
allowed-tools:
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" config *)
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" docs-check *)
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" inventory *)
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" user-facing *)
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" authorization *)
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" merged *)
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" checks *)
  - mcp__plugin_sidecut-solo_solo__get_settings
  - mcp__plugin_sidecut-solo_solo__get_work_state
  - mcp__plugin_sidecut-solo_solo__get_user_facing_changes
  - mcp__plugin_sidecut-solo_solo__list_merged_branches
  - mcp__plugin_sidecut-solo_solo__get_pr_checks
---

# Finish change

Bring the requested work to a verified end state while preserving everything the task does not own.

## Steps

1. Read repository instructions. Run solo config for the base branch, checks, merge policy and release process. Explain overlapping work before changing it.
2. Fetch current remote state. Use `solo remote-state`, adding `--version-path MANIFEST` for each versioned output. Check remote version collisions before delivery.
3. If remote access fails, report remote state as unverified. Do not claim the branch is current or ready.
4. Run `solo inventory`. Inspect every worktree, dirty file, untracked file, local-only commit and provider PR. Separate task-owned, user-owned, unique and unknown work.
5. Resume existing task records and reconcile uncertain actions against Git and the provider. Follow [recovery.md](references/recovery.md). Never repeat an uncertain commit or merge blindly.
6. Establish remaining work and its acceptance checks. Use solo-diagnose-problem, solo-plan-change or solo-build-change as needed within existing authorization.
7. Resolve conflicts while preserving unrelated edits. Rerun checks after resolutions. Ask before including unknown ownership or overlapping changes.
8. Review and verify the exact current head. Use solo-review-change at the level `solo user-facing` suggests, and solo-verify-change for user behavior.
9. Run `solo docs-check` on the head. Fix the problems this change caused, such as a doc it edited or a path or script it renamed or removed, and report the rest without blocking.
   Run `solo user-facing` and use solo-review-design when needed. Record unavailable design coverage and its reason. Open Critical design findings block delivery.
10. After fixes, review the new head as solo-review-change's after-fixes rules say. Name only workers that actually reviewed it. A same-agent reread remains same-agent, including heads that only merge main.
11. Push through `solo push` and confirm that the PR head matches. Run `solo checks PR --reviewed-head SHA` for that exact commit.
12. Require every configured check to pass. Missing, queued, skipped, cancelled, pending or failed checks block merge. Continue independent work while blocked. When a required check fails, repair it as [ci-repair.md](references/ci-repair.md) describes, at most two rounds.
13. Inspect automatic release, deployment and publication effects. Resolve existing merge, publication and host permission using `solo authorization`. Follow [delivery.md](references/delivery.md).
14. Merge through `solo merge` with the exact review record. If repository rules require another merge workflow, follow its equivalent head and check gates.
15. Confirm the provider reports merged and verify the merged head. Check every requested tag, release, asset, package, deployment and installed update separately.
16. Clean only task-owned resources using [cleanup.md](references/cleanup.md), including the session's own host worktree once the merge is proven. Preserve every unique commit and file. Never force cleanup or delete another task's work.

## Rules

Resolve the plugin root and run `solo COMMAND` via `server/data/helper-launcher.md` from the loaded plugin root.

Reuse permission already given. Ask only when delivery or publication permission remains missing, after preparing the concrete result. In a hands-off task under `merge = "ask"`, the merge answer recorded at its start (`server/data/hands-off.md`) is the merge permission. Follow `server/data/user-input.md` from the loaded plugin root.

Never skip a required check, whatever permission is given. Never overwrite a branch on GitHub or rewrite shared history without explicit permission covering the effect and possible loss.

## Done when

The provider confirms each requested delivery output, or the reviewable result has a specific remaining permission or blocker.

Report changes, checks, decisions, skipped work and the next action. State the verified merge commit when merged.

Describe local checks as local checks. A merge alone proves neither a release nor deployment.

## References

| Read | When |
| --- | --- |
| [delivery.md](references/delivery.md) | Apply permission, review and exact-head merge gates. |
| [recovery.md](references/recovery.md) | Recover uncertain work without repeating effects. |
| [cleanup.md](references/cleanup.md) | Remove only preserved task-owned resources. |
| [ci-repair.md](references/ci-repair.md) | Fix a failed required check within the task, with a limit. |
