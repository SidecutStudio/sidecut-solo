# Review levels

Read this when choosing how much review a change gets.

`solo user-facing` suggests a level in its `review` field, from the changed paths and line count. Raise it when the diff shows more risk than its paths do, such as a weakened safety rule, a changed permission check or a new shell command. Never go below the suggested level.

| Level | When | Who reviews |
| --- | --- | --- |
| light | Only prose docs, lockfiles with their `package.json`, licences and images, or 10 changed lines or fewer in one source file; never instructions for agents, specifications or deep areas | A careful same-agent pass, recorded as same-agent. No worker. |
| standard | Ordinary features and fixes, and changes to skills, references, agent instructions or specifications | One independent reviewer on the review model and effort below, then a same-agent check of its claims |
| deep | Sign-in, accounts, secrets, tokens, encryption, payments, stored data, CI and release machinery, hooks, host settings, the merge policy, code owners, or over 40 files or 1,500 lines | One reviewer on the parent model. Use the refuter only on surprising blocker or major findings |

The deep level is one reviewer. The multi-agent review in [deep-review.md](deep-review.md) runs only when the user asks for it.

The `review` setting changes the default. `auto` uses the table. `deep` makes every change deep, as before levels existed. `light` makes every change below deep same-agent, agent instructions included; a deep area stays deep.

Brief a worker with the repository, base and head SHAs, the intended behavior, what is already checked and the level. Ask for blocker and major findings with evidence, and minor ones only when they're cheap to fix. Don't ask for a general opinion.

## Model and effort

Read `review_model`, `codex_review_model` and `review_effort` from `solo config` (or `get_settings`), which merges `solo-workflow.toml` with the personal override and fills defaults.
Set them when starting the reviewer; leaving them out runs it on the parent's model and effort.

- **Standard in Claude Code:** pass `model: <review_model>` (default `sonnet`) and `effort: <review_effort>` to the Agent tool.
- **Standard in Codex:** pass `reasoning_effort: <review_effort>` to `spawn_agent`, plus `model: <codex_review_model>` when it is set to a model the host lists. Unset, the reviewer keeps the parent's model.
- **Deep, both hosts:** pass no model and no effort, so the reviewer runs on the parent's model and effort.
- **Refuter:** on a standard review, the standard model and effort; on a deep review, no override.

Say which model and effort ran in the review record.

## After fixes

Follow [re-review.md](re-review.md) to decide whether a scoped review covers the new head.

- **After a light or standard review:** review the fix diff alone. Its level is what `solo user-facing --base <reviewed-head> --head <new-head>` suggests. That is still never below what the fix diff itself calls for.
- **After a deep review:** review the full change again at deep. A deep review is never followed by a lighter one before merge.
