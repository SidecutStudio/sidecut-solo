---
name: solo-list-work
description: "Shows unfinished work and what could be lost. Use when the user asks about branches, project copies, open PRs or cleanup safety. Not for cleanup itself (use solo-deliver-change)."
argument-hint: "[branch, PR or question]"
allowed-tools:
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" config *)
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" inventory *)
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" merged *)
  - mcp__plugin_sidecut-solo_solo__get_settings
  - mcp__plugin_sidecut-solo_solo__get_work_state
  - mcp__plugin_sidecut-solo_solo__list_merged_branches
---

# List work

Before project work, run `solo config` for the target checkout. If `setup_needed` is true, pause and invoke `solo-configure-project` for first-run setup. Follow `server/data/settings.md` from the loaded plugin root.

Inspect the project's current work without changing it. Explain ownership, unfinished outcomes and cleanup risks in plain words.

## Steps

1. Read [repo-state.md](references/repo-state.md). Inventory the branch, head, worktrees, dirty and untracked files, branches, upstreams and open PRs.
2. Use `get_work_state` and `list_merged_branches`, or the helper's `solo inventory` and `solo merged` commands. Confirm provider checks on the current PR head.
3. Distinguish local evidence from provider state. State when remote references are stale; disclose any authorized fetch because it updates Git state.
4. Classify work as the user's, this task's, the only known copy or unknown. Treat unknown ownership as the user's.
5. Check handoff notes and dated plans against the code and Git history. Identify stale claims without deleting the notes.
6. Call something safe to remove only with proof its contents survive elsewhere. A merged ancestor does not prove later commits preserved its behavior.
7. Recommend the next action. Route authorized cleanup or completion to `solo-deliver-change`.

## Rules

Do not commit, checkout, stash, delete or change branches and worktrees. Do not mistake an unavailable provider for a confirmed absence of work.

Missing, queued, skipped, cancelled and failed checks are not passes. Preserve every potentially unique copy.

## Done when

The answer states what is unfinished, who is waiting and what could be lost. A short table explains each branch or worktree's ownership and cleanup evidence.

## References

| Read | When |
| --- | --- |
| [repo-state.md](references/repo-state.md) | Inspecting ownership, remote state and content survival |
