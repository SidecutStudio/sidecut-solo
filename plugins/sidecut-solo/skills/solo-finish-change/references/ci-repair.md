# Repair a failed check

Read this when a required check fails on the PR head you pushed.

A round is one fix pushed and checked. Stop after two rounds, or sooner when a stop rule below applies.

1. Read the failing job's log for the exact head, for example `gh run view RUN --log-failed`. A CI diagnostics skill or tool, if one is installed, can read runners and hosted minutes.
2. Decide which kind of failure it is:
   - **Caused by this change:** a test, type, lint or build error in code the task touched. Fix it.
   - **Flaky or infrastructure:** a timeout, network error, runner loss or exhausted minutes. Rerun the failed jobs once. If it fails again the same way, stop and report it.
   - **Pre-existing or unrelated:** it fails on the base branch too, or in code the task didn't touch. Stop and report it. Never fix it inside this change.
3. Fix through solo-build-change within the task's scope. Reproduce the failure locally when you can, and never weaken an assertion, skip a test or change a check's configuration to get green.
4. Commit, push through `solo push`, and confirm the PR head moved to the new commit.
5. Review the new head as solo-review-change's after-fixes rules say, then run `solo checks PR --reviewed-head SHA` again.

Stop and report a blocker when two rounds haven't produced green, when the fix needs a change outside the task, or when the failure needs access, secrets or spending you don't have. Name the failing check, its log, what you tried and the next step.
