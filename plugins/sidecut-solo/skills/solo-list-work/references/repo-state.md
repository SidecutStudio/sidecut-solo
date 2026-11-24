# Repository state

Read this when inspecting unfinished work and deciding whether content survives elsewhere.

## Inspect state

The helper's `inventory` command shows branches, head, dirty files, worktrees and upstream counts without fetching. Counts reflect the last fetch.

The helper's `merged --into <ref>` command checks local branches, including squash merges. Verify provider PR and CI state separately on the exact head.

Use GitHub REST endpoints through `gh api` when GraphQL is unavailable. Name the repository in every provider command, with `--repo OWNER/REPO` or a `repos/OWNER/REPO/` path. If the provider cannot be reached, report provider state unverified.

A fetch updates remote references. Disclose an authorized fetch; a read-only investigator must never fetch.

## Check content survival

An ancestor proves historical merging, not that later commits kept the behavior. Inspect the current files when deciding whether a feature survives.

Use merge-base diffs to identify the branch's changes and compare those files against the proposed surviving branch. Do not infer equivalence from branch names.

## Classify risk

| Category | Examples | Treatment |
| --- | --- | --- |
| The user's | Uncommitted changes, untracked notes, stashes and user-created branches | Preserve |
| This task's | Task-created branches and worktrees | Confirm contents before cleanup |
| Only known copy | Local-only commits or unpushed tags | Preserve until content survives elsewhere |
| Unknown | Work without attributable ownership | Treat as the user's |

Show what task-owned, unique and unknown work contains before recommending deletion. A dirty worktree elsewhere may contain someone's only copy.
