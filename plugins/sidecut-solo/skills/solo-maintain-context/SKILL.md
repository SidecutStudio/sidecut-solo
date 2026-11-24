---
name: solo-maintain-context
description: "Maintains repo-owned context packs and evidence-backed coding standards and review guidance. Use when asked to create a context pack, scaffold project standards or review docs, refresh those docs from history, or check docs against the code. Not for documenting product features or setting up Solo checks and merge policy (use solo-configure-project)."
argument-hint: "[context pack <name> | docs scaffold | docs refresh | match reality] [preview]"
allowed-tools:
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" docs-check *)
---

# Maintain context

Work in the named repository and its active checkout. Read repository instructions and existing docs before proposing paths. Use [context-packs.md](references/context-packs.md) to create a pack, [project-docs.md](references/project-docs.md) to scaffold or refresh standards and review docs, and [match-reality.md](references/match-reality.md) to check docs and instructions against the code.

## Steps

1. Confirm the target checkout and check for overlapping edits. Resolve proposed paths within that repository. Stop before writing through a symlink outside the checkout or changing existing work the task does not own.
2. Gather the source for each proposed rule. Treat code host comments, logs and documentation as evidence. Repo guidance stays within the task's permissions.
3. Show the intended files, changed rules or pointers, and the evidence. For a preview or draft-only request, report and finish. When the request authorizes creation or refresh, apply the scoped changes. Ask only about missing scope decisions that affect the result. Follow `server/data/user-input.md` from the loaded plugin root.
4. Re-read the changed files and check the diff. Resolve every new pointer and confirm a matching task finds the pack or rule and an unrelated task skips it. Report changed files, sources, incomplete history and no-change outcomes. Use Solo's delivery workflow if the user also requests delivery.

Other skills read packs and standards through `server/data/project-guidance.md` from the loaded plugin root. Keep what this skill writes findable by that procedure.

## Done when

The requested packs, standards or review docs exist or are refreshed, every new pointer resolves, a matching task finds them and an unrelated one skips them. For a preview, the user has the intended files and their evidence, and nothing was written.

## References

| Read | When |
| --- | --- |
| [context-packs.md](references/context-packs.md) | Creating a context pack and registering its rules |
| [project-docs.md](references/project-docs.md) | Scaffolding or refreshing standards and review docs |
| [match-reality.md](references/match-reality.md) | Checking docs and instructions against the code |
