# Preserve existing work

Read this when choosing a checkout, editing occupied files or committing changes.

Inspect Git status and both staged and unstaged diffs. Preserve every change this task did not create.

Never unstage someone else's prepared changes, reset their index or clean their untracked files.

For separate files, stage your files and commit with git commit --only -- YOUR_FILES when other work is staged.

For mixed files, stage only your hunks with git add -p. Ask before committing a mixed file.

Ask before editing lines where ownership overlaps. Leave unrelated branches and worktrees alone.

Follow the configured worktrees policy:

- With always, start a named task and create its worktree using solo worktree ABSOLUTE_PATH --task ID --ref BASE.
- With when-overlapping, work in place unless concurrent work touches the same files. Use a task worktree for overlap.
- With never, work in place. Ask when overlap prevents preserving other work safely.

A helper-created worktree starts detached. Create a task branch before building so cleanup can preserve its commits.

If the desired branch is checked out elsewhere, create another branch tracking its remote branch.

Push through solo push because the local branch and upstream can have different names.

Cleanup requires task ownership and commits preserved on a named branch or tag.
