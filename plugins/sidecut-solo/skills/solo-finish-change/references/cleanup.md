# Clean up task resources

Read this when delivery is complete and deciding which worktrees and branches can be removed.

Create task worktrees with solo worktree ABSOLUTE_PATH --task ID --ref REF.

Use the resulting worktree as --repo for subsequent task commands.

Run cleanup from the original checkout using solo cleanup PATH --task ID --preserved-ref BRANCH_OR_TAG. Remove the session's own host worktree as its section below says.

Require all cleanup conditions:

- The task owns the worktree: its Solo ownership marker still matches, or it is the worktree the host created for this session.
- No tracked, untracked or ignored files would be lost.
- A named branch or tag preserves every commit.

Never force removal. After a squash merge, preserve the original commits on a branch or keep the worktree.

Resume and reconcile from the original checkout before continuing there.

Leave user-owned or other-task worktrees alone. A worktree with no session open in it can still belong to a running task.

Use solo merged --into REF to inspect branch evidence without mutations.

Its categories include ancestor, squash-merged, content-in-target, pr-merged and unproven.

Delete branches only when the user requested that cleanup.

Use solo delete-merged --into REF BRANCHES to prove every requested branch before deleting any.

The helper refuses checked-out branches and the target branch, then prints restoration commands for successful deletions.

Keep unproven branches unless the user decides otherwise.

## The session's own host worktree

A worktree Claude Code created for this session, under `.claude/worktrees/`, belongs to it without a Solo marker. Claude Code keeps it while its branch has commits missing from the remote, which is the usual state after a squash merge deletes that branch. Remove it after the provider confirms the merge and `solo merged` proves the branch. Keep the branch:

1. Run `git status --porcelain --ignored` in the worktree. Keep the worktree if any ignored file outside dependencies and build output, such as `.env.local`, differs from the original checkout's copy or is missing there. Git removes ignored files without asking.
2. Call `ExitWorktree` with `keep`. Its `remove` action also deletes the branch.
3. From the original checkout, run `git worktree remove PATH`, with no option that discards changes.

If `ExitWorktree` is unavailable or refuses, or git refuses for any reason, keep the worktree. Name it in the final report as left for the user to remove. Do the same in hosts without a way to leave the session's worktree, such as Claude Desktop, Codex and Gemini/Antigravity.
