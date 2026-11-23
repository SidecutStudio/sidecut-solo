# Keep a lesson

Read this when deciding whether a recurring problem needs durable guidance.

Save a lesson only when someone reading the resulting code, tests and documentation would probably repeat the mistake or investigation. Effort spent does not justify another document.

Use accepted review fixes, corrective commits and existing solution notes to confirm a lesson. Count repeated comments on one PR as one incident. Check whether the same cause could recur before promoting guidance.

## Steps

1. Prefer an enforcing test, script, lint rule, type or setting.
2. Otherwise explain the trap beside its code or in the existing folder documentation.
3. Use one short line in existing repository guidance only when the earlier locations cannot solve it.
4. Replace incorrect guidance and remove obsolete instructions within scope. Do not stack caveats on stale rules.
5. Do not change global instructions, shared skills or other repositories without authorization covering those changes.

[Compound Engineering project guidance](https://github.com/EveryInc/compound-engineering-plugin/blob/main/skills/ce-setup/references/project-docs.md)
