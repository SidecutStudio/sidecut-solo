# Hands-off

Read this when the user asks Solo to run a change without them: "lfg", "hands off", "run it end to end", "don't stop to ask", or an outcome that spans several Solo skills.

Hands-off decides who answers the questions along the way. The project's `merge` setting still decides whether the agent may merge. Hands-off never changes that setting or works around it.

## Start

Ask once, before the first step, using [user-input.md](user-input.md) beside this file. A request that already says "hands off" or "lfg" counts as the answer to the first question.

1. **How involved?** Offer "Hands off (Recommended)": take my recommended option at each decision, say what I chose, and stop only at the limits below. Also offer "Check in at decisions", which is the normal flow.
2. **Merge?** Ask this only when `solo config` shows `merge = "ask"` and the user hasn't already said to merge. Offer "Stop at a ready PR (Recommended)" and "Merge when the required checks pass on the reviewed head". With `when-green`, say that it will merge on green. With `never`, say that it stops at a ready PR. Either way, say that publishing is still asked separately.

Record both answers in the task record. They hold for this task only, never for the next one, and neither is saved to `solo-workflow.toml`. With no answer to the first question, run the normal flow. With no answer to the second, or "Stop at a ready PR", end at the ready PR and report it without asking again.

## While running

- Take the option you would have marked Recommended. Prefer the reversible, smaller choice when two are close.
- Follow-up offers at the end, such as fixing findings, saving a lesson or publishing, are still asked. Never pick one for the user.
- Keep a short "Decided for you" list: each decision, what you chose and how to reverse it.
- Run the same chain, checks and review levels as a supervised task. Hands-off removes the questions and leaves every gate in place.
- On a failed required check, use solo-finish-change's CI repair, which has its own limit.

## Stop and ask

Hands-off covers decisions inside the task. Stop and ask, using [user-input.md](user-input.md), for anything outside it:

- Publishing, releasing, deploying, spending, or sending anything to people.
- Deleting or rewriting work the task doesn't own, a force push, or history rewrites.
- Widening the scope beyond the request, or a requirement whose answer would change what gets built and has no reversible default.
- Missing credentials or access, or a host permission prompt. A host gate always wins.
- Any merge the merge answer above doesn't cover.

While a question waits, continue the independent work.

## Done when

Report the result as usual. Then give the "Decided for you" list, what ran, what was skipped, and where it stopped and why.
