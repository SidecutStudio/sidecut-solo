---
name: solo-improve-workflow
description: "Removes the cause of a recurring project mistake. Use when the same wrong command, missed check or instruction conflict keeps happening. Not for a single unexplained failure (use solo-diagnose-problem)."
argument-hint: "[recurring problem]"
---

# Improve workflow

Fix one repeated problem at its cause and demonstrate the result. Prefer a check or setting that makes the correct action easy.

## Steps

1. Find at least two real instances in the conversation, Git history, task records or relevant usage evidence. Do not turn one mistake into an invented pattern.
2. Read the affected guidance, scripts and settings. Separate a bad rule, conflicting instructions, missing information and a check that is difficult to run.
3. Prefer removing harmful guidance, then an enforcing script or check, then a project setting. Use `solo-configure-project` for settings.
4. Add a short scoped rule only when structure cannot prevent repetition. Read [learning.md](references/learning.md) before saving a lesson.
5. Implement through `solo-build-change` within this task. Remove contradictory material within scope instead of appending another warning.
6. Repeat the triggering task on safe fixtures and show that the mistake is prevented. Run the affected repository checks.
7. Handle additional recurring problems separately. Keep each cause, change and proof distinct; use separate PRs when the repository workflow requires them.

## Rules

Do not mine unrelated conversations, file tickets or create a backlog without authorization. Shared skills, global guidance and other repositories require scope the user actually granted.

Reuse permission already given for this task. Report changes outside that scope as recommendations until authorized.

## Done when

The report names the repeated behavior, cause, concrete change and rerun evidence. It distinguishes suggested changes from changes actually made.

## References

| Read | When |
| --- | --- |
| [learning.md](references/learning.md) | Deciding whether a lesson needs durable guidance |
