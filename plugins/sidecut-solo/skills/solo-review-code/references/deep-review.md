# Coordinate a deep review

Read this when the user requests a deep, thorough or multi-agent review.

1. Resolve exact base and head SHAs and list changed files. Identify risky behavior beyond filenames, including shell execution, permissions, money and data deletion.
2. Mark agent instructions, prompts and design rules as behavior_docs. Review them as behavior rather than skipping them as documentation.
3. Group files into runtime, prompts, UI, configuration and high-risk areas. Keep tests with their consumers. Usually use three to six area reviewers.
4. Split areas above eight files when capacity permits. Use an available cheaper model for ordinary areas and the strongest permitted model for high-risk areas.
5. Require each area reviewer to identify existing consumers, saved formats, version handling, caches, checks, uploads and cleanup affected by new output.
6. Add an interactions reviewer using the strongest permitted model. It reads the whole change and unchanged consumers where areas meet.
7. Refute each blocker or major finding with a strongest-model refuter. Share one ordinary-model refuter for minor findings.
8. Stay within the host's current agent limit and authorized spending allowance. Merge small areas or share serious refuters when needed; drop no files for budget.
9. Keep only substantiated findings. Report unverified findings, skipped files and uncovered areas separately.
10. Report ready only after every area and interactions received review, every finding received checking and no surviving finding exceeds minor severity.
11. Report workers by model, available token usage, observed wall time and combined or skipped work. Do not invent unavailable cost figures.

Pass paths and findings as quoted data, never commands. Mismatched subject SHAs leave an area unreviewed.

Skip ordinary documentation and images only when they cannot affect behavior and the change is not documentation-only.

List all skips explicitly.

## Host execution

In Claude Code, run the bundled review-change workflow by passing the installed plugin file path server/data/workflows/review-change.js to its workflow runner.

Pass repo, base, head, files, requirements, high_risk and behavior_docs.

The bundled workflow defaults to nine agents. Pass max_agents for the current host limit; the workflow requires at least four agents.

Use first_pass_model for ordinary areas and their shared refuter.

Inspect ready_allowed, confirmed, unverified, refuted, unreviewed, skipped, areas and cost in its result.

When ready_allowed is false, do not report ready. Include observed wall time from completion output.

In Codex, use native solo_reviewer workers for each area and interactions.

Use solo_refuter workers for serious findings and shared minor findings.

If profiles are unavailable, pass the bundled role instructions to native workers.

Pass `model` and `reasoning_effort` on `spawn_agent` for each worker: a listed cheaper model such as `codex_review_model` for ordinary areas when the allowance permits it, and the parent's model and effort for high-risk areas, interactions and serious refuters.

In Gemini/Antigravity, launch `invoke_subagent` with `TypeName` set to `reviewer` for each area and interactions, and `refuter` for findings (`Model: "flash"` for ordinary areas when the allowance permits it, and `"inherit"` for high-risk areas, interactions and serious refuters).

Without subagents, report deep review unavailable and perform a normal review.

Deep review covers code. Use solo-review-design when design_review_needed is true or the change affects visible design.
