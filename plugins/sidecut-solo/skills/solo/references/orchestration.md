# Orchestration

Read this when an outcome needs several skills or independent workers.

## Choose the chain

For a new change, use `solo-choose-approach` only while the approach is unsettled. Use `solo-research-topic` when outside facts decide it.

For an unexplained bug, use `solo-diagnose-problem` until the cause and reproduction are demonstrated. Plan substantial or risky work through `solo-plan-change`.

Continue through `solo-build-change`, real behavior checks through `solo-test-behavior` and code review through `solo-review-code`.

Visible changes also need `solo-review-design`. Open Critical design findings block delivery alongside blocker or major code findings.

Return findings to build, then verify and review the changed head. An earlier review does not automatically cover later commits.

Use `solo-deliver-change` for authorized completion and merging. Required checks must pass on the current PR head.

For unfinished work, start with `solo-list-work` to establish ownership and prevent loss, then finish what is authorized.

For release inspection, check status and review outgoing changes without editing unless fixes are requested.

## Carry context

Preserve the goal, exclusions, decisions, permission, task record and evidence across every handoff. Attach checks and reviews to their exact head or dirty-tree fingerprint.

An instruction to fix and merge authorizes that task's merge. `merge = "when-green"` also permits it; `never` remains a veto.

With `merge = "ask"`, ask once when ready unless the user already requested merging. A generic shipping request does not prove every publication surface completed.

Use the finish skill's authorization method for release outputs. Keep merge, tag, release, deployment and installed-plugin update distinct.

When a research, planning or read-only brief turns into build work, say so before building and offer it as its own session. Build here only once the user says to.

## Split independent work

Split only when pieces need neither each other's files nor results and delegation is allowed. A small change stays with one agent.

1. Give workers one shared brief in scratch space for substantial parallel work. A single read-only worker can receive its brief directly.
2. Include the goal, granted permissions, verified facts, interfaces, repository rules, checks, ownership and stopping conditions. Say whether proposing or making follow-ups is in scope. For a worker that delivers, paste the paragraph `solo brief` prints for its repo.
3. Give editing workers separate branches and worktrees. Do not share files, branches or task records.
4. If repository settings forbid worktrees, run editing pieces sequentially. Native workers inherit the host's actual sandbox and approval constraints.
5. Keep an independent piece for the parent. Send corrections to the existing worker instead of duplicating its work.
6. Review each piece through solo-review-code, at the level it picks, before delivery. A worker reviewing its own implementation is same-agent.
7. Verify worker PRs, exact heads, required checks, merges and required post-merge checks on the provider.

Quiet or stopped workers are unfinished. Report each piece's verified end state and unresolved findings.

## Recover and report

Use one task record when work spans interruptions or requires helper-managed merging. Continue the same record across skill changes.

The recovery method belongs to `solo-deliver-change`. Do not create a second record merely because implementation reached review.

Missing, queued, skipped, cancelled and failed checks are not passes. Missing CI blocks delivery, not independent diagnosis and repair.

End with what changed, what ran, material decisions or skipped work and what remains. Claim a completed external outcome only after observing it.
