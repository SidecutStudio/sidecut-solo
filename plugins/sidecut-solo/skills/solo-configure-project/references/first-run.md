# Offer setup once

Before proposing choices, inspect the target checkout and its instructions, base branch, manifests and existing CI. Prefer the remote's default branch, or a verified local base when there is no remote. Suggest checks supported by the project. Leave unknown required check names unset. This discovery is read-only and does not run checks or start the requested work.

Follow `server/data/user-input.md` from the loaded plugin root. Present one short setup offer with the suggested answers together. Reuse choices already supplied. Invite the user to accept the suggestions, change any answer or continue with defaults. Keep provider names out unless already selected for this project by its instructions or the user.

1. **Project and merge** — confirm the base branch and detected checks. Recommend asking before a merge. The user can choose to merge when all gates pass or stop at a ready pull request.
2. **Review** — recommend choosing the review level based on risk. The user can select light or deep review for this project.
3. **Worktrees** — recommend using separate worktrees when work overlaps. The user can choose always or never.
4. **Writing voice** — offer to start a short guide using their own examples, adapt Solo's general guidance, or use a guide they point to. If there is an established project guide, include it in the suggested answers.
5. **Integrations** — ask whether they use an issue tracker, task board or external CI, and what to use for each. Leave these unset by default.

If there is no eligible question tool, end the turn with the grouped offer in chat and wait for an answer. Explicit hands-off instructions that already rule out a setup question count as a skip for the current task. Resume the original work once the user accepts or declines. Keep the answer in the task context so the remaining skills do not ask again.

With consent, save project choices in `solo-workflow.toml`. Save personal choices in ignored `solo-workflow.local.toml`, or in `~/.config/solo/preferences.toml` if the user explicitly wants them across projects. Use `voice_guide` for a chosen path and `[integrations]` for the services they named. Use an absolute path for a guide shared across projects. Start or adapt a guide only if the user asked for it. Keep personal guides out of tracked files and shared settings. Keep existing files and comments and verify that repo-local personal files are ignored before writing them. Add the ignore rule to this checkout's Git exclude file when the repo has no matching ignore rule.

If the user chooses to keep defaults for this project, offer that as a saved choice in the same question. Save a comment-only `solo-workflow.local.toml` when they explicitly choose to remember it. If they skip for now, write nothing and use the neutral defaults for the rest of the task. Unanswered offers grant no permission to write or merge.

Run `solo config` again after saving. Say in one line where settings live and use them when resuming the task. The first-run offer does not authorize instruction wiring, project profiles, commits or hosted changes.
