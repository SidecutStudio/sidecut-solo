# Plan size

Read this when choosing between a short chat plan and a saved plan.

Use the lightest form that lets the implementer begin without guessing. A file is not the default.

| Form | Use when | Contents | Location |
| --- | --- | --- | --- |
| Direct | One pass with no unresolved decision or material risk | Change, location and check | A few sentences in chat |
| Brief | Bounded work with at most one real decision | Ordered steps, files, checks and decision | Chat |
| Saved | The user requests a file or work must survive interruption or handoff | Goal, decisions, checked steps, risks and open questions | Existing repository plan location |

Large changes involving authentication, money, migrations or public contracts usually need a saved plan. A small risky change can remain brief with its risk stated.

Prefer the repository's existing plans location. Without one, use `docs/plans/` for a necessary saved plan and explain the location.

Do not keep duplicate plans in task lists. Before the target repository exists, use the task record's next step or ask for a temporary location.

Move that plan into the new repository when a natural location exists. Remove the original only when this task owns it and no other repository tracks it.

## Saved contents

1. Define the goal and observable completion checks.
2. Record settled choices, rejected alternatives and reasons.
3. List changes, locations, dependencies and checks for each step.
4. Name material risks and how the plan contains them.
5. List only decisions requiring the user, with the step each blocks.
