---
name: solo-plan-change
description: "Turns a settled change into ordered steps with checks. Use when the user requests a plan or authorized work needs sequencing. Not for choosing an approach (use solo-choose-approach)."
argument-hint: "[change or existing plan]"
allowed-tools:
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" config *)
  - mcp__plugin_sidecut-solo_solo__get_settings
---

# Plan change

Before project work, run `solo config` for the target checkout. If `setup_needed` is true, pause and invoke `solo-configure-project` for first-run setup. Follow `server/data/settings.md` from the loaded plugin root.

Make the next action clear without making the user manage a process. Keep plans proportional to the decisions and risks they must carry.

## Steps

1. Recover the goal, settled decisions, permissions and existing work from the conversation, repository and current settings. Check old notes against code and Git history.
2. Read `solo-workflow.toml` and `solo-workflow.local.toml` when present. Use `get_settings` or the installed helper's `solo config` command when available.
3. Choose direct, brief or saved form using [sizing.md](references/sizing.md). A small change needs a few sentences, not a document.
4. Define done through observable behavior and important failure cases. Inspect files and interfaces before naming them in steps. When a change crosses a boundary or affects shared behavior, follow [context-map.md](references/context-map.md). If the project has a context pack index or standards pointers, follow `server/data/project-guidance.md` from the loaded plugin root.
5. Put the riskiest unknown first. Use [slicing.md](references/slicing.md) to deliver independently checkable outcomes rather than separate technical layers.
6. Give each step its changed files, dependencies and a check that can fail. Mark parallel steps only when their results and files are independent.
7. Ask about unresolved decisions that change the plan now. Attach later decisions to the steps they block, with a recommendation. Follow `server/data/user-input.md` from the loaded plugin root.
8. Check requirement coverage, consistent interfaces and specific failure cases. Remove details an implementer can safely determine without the user.
9. For resumed work, follow [resuming.md](references/resuming.md). Preserve completed work and constraints instead of replacing a still-useful plan.
10. Show the plan and first action. Continue into `solo-build-change` when implementation is already authorized, unless the user requested approval first or the host is still in Plan mode. If approval is required, use the user-input guidance and any native plan approval flow.

## Rules

A plan-only request changes no code or configuration. Edit a saved plan only within the requested planning scope.

Do not reopen a settled choice without evidence that it cannot work. Do not overwrite another task's unfinished plan.

## Done when

Every requirement has a step and every step has a check. The plan names its riskiest unknown, remaining decisions and saved location when applicable.

## References

| Read | When |
| --- | --- |
| [sizing.md](references/sizing.md) | Choosing chat or a saved plan |
| [slicing.md](references/slicing.md) | Ordering outcomes and checks |
| [context-map.md](references/context-map.md) | Mapping consumers, contracts and checks before a consequential edit |
| [resuming.md](references/resuming.md) | Continuing an existing plan |
| [small.md](examples/small.md) | Planning a small wording change |
| [substantial.md](examples/substantial.md) | Planning a feature across several layers |
| [resumed.md](examples/resumed.md) | Recovering from stale handoff notes |
