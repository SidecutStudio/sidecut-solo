# Recover interrupted work

Read this when resuming a task or when an action's outcome is uncertain.

Task records live under the Git common directory at solo-workflow/TASK/ and remain uncommitted.

Every merge needs a record. Other work needs one only for useful continuity, interruptions or repeatable runs.

Use the same --task ID for every related command. Without it, the helper uses default.

| Command | Purpose |
| --- | --- |
| start GOAL --constraint TEXT --budget NUMBER | Record the goal, limits and initial working state. |
| checkpoint PHASE --next TEXT --acceptance TEXT | Record a phase boundary after checking state. |
| run --key NAME --timeout SECONDS -- ARGV | Run once per key and preserve its result. |
| resume | Compare recorded and current state. |
| reconcile --found EVIDENCE | Record observed effects and preserved work after inspection. |

Reusing a run key returns the prior result. Use a fresh key for a fresh check.

Timeouts remain uncertain until Git, the provider or output establishes their effect.

Never retry a commit, push or merge before checking whether it already happened.

After direct edits, inspect the diff and run resume, then reconcile with changes, checks and preserved work.

Checkpoint review only after reconciliation. Reconciliation neither reviews the new head nor makes CI pass.

If two task records conflict, inspect both and resolve ownership rather than working around the refusal.

Remove a writer.lock only after confirming its owning process stopped.

An exhausted budget requires revisiting scope with the user.

Before checkpoint finish, confirm the reviewed head remains current, the worktree is clean and required CI passed for that head.

After verified merging, resume and reconcile from the original checkout preserve merged status, as does checkpoint finish.

Checkpoint build reopens the task. Merged status proves neither release nor deployment.
