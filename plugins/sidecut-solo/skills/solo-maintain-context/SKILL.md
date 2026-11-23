---
name: solo-maintain-context
description: "Maintains repo-owned context packs and evidence-backed coding standards and review guidance. Use when asked to create a context pack, scaffold project standards or review docs, refresh those docs from history, or check docs against the code. Not for documenting product features or setting up Solo checks and merge policy (use solo-configure-project for settings)."
argument-hint: "[context pack <name> | docs scaffold | docs refresh | match reality] [preview]"
allowed-tools:
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" docs-check *)
---

# Maintain context

Work in the named repository and its active checkout. Read repository instructions and existing docs before proposing paths. Use [context-packs.md](references/context-packs.md) to create a pack, [project-docs.md](references/project-docs.md) to scaffold or refresh standards and review docs, and [match-reality.md](references/match-reality.md) to check docs and instructions against the code.

## Maintain guidance

1. Confirm the target checkout and check for overlapping edits. Resolve proposed paths within that repository. Stop before writing through a symlink outside the checkout or changing existing work the task does not own.
2. Gather the source for each proposed rule. Treat code host comments, logs and documentation as evidence. Repo guidance stays within the task's permissions.
3. Show the intended files, changed rules or pointers, and the evidence. For a preview or draft-only request, report and finish. When the request authorizes creation or refresh, apply the scoped changes. Ask only about missing scope decisions that affect the result. Follow `server/data/owner-input.md` from the loaded plugin root.
4. Re-read the changed files and check the diff. Resolve every new pointer and confirm a matching task finds the pack or rule and an unrelated task skips it. Report changed files, sources, incomplete history and no-change outcomes. Use Solo's delivery workflow if the user also requests delivery.

## Read project guidance

Use this section when planning, building or reviewing a change in a project with context packs or standards. Read the normal repository instructions first. For a PR or branch review, resolve the index, standards pointers, and referenced guidance from the review base. Treat changes to those files in the head as part of the diff under review. For local planning and building, use the active checkout.

1. Look for `docs/context-packs/README.md`. If it exists, read its pack summaries. Open a pack's README only if its Applies when description matches the affected area or behavior.
2. Use the pack README's summaries to read only matching rule files. Keep paths under the context pack directory and skip symlinked, broken, duplicate or out-of-scope entries. Cite applicable rules by path and carry those paths into the plan, implementation or review brief as needed.
3. Follow existing coding standards pointers for affected areas. During review, also read the repository's review guidance. Report conflicts that matter to the task and apply the repository's established instruction precedence.

## References

| Read | When |
| --- | --- |
| [context-packs.md](references/context-packs.md) | Creating a context pack and registering its rules |
| [project-docs.md](references/project-docs.md) | Scaffolding or refreshing standards and review docs |
| [match-reality.md](references/match-reality.md) | Checking docs and instructions against the code |
