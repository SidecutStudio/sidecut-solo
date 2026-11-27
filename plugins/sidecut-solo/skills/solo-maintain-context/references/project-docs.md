# Scaffold or refresh project guidance

## Find the current guidance

Find the repository's agent instructions, coding standards and review docs, including existing locations and scoped guidance. Check which reviewers the repository actually uses from their configuration or PR history. Read the relevant tests, lint rules and CI. Record the history range and any access or coverage limits.

## Build the case for each rule

Look at accepted review fixes, corrective commits, documented solutions and rules already present in repository instructions. Treat each PR or standalone change as one incident, regardless of repeated bot comments. Include a source link or commit for a proposed rule. Leave a proposed rule out when it has no evidence or a check already covers it. Draw review severity and findings to suppress from the team's demonstrated review decisions.

## Scaffold

Draft missing guidance at its existing documented location, or use root `CODING_STANDARDS.md` and `REVIEW.md` when the project has no established location. If its own checks limit top-level files, use `docs/coding-standards.md` and `docs/review.md`. Keep code conventions in the standards and review behavior in the review guidance. Leave existing docs intact during scaffolding. If there is too little evidence, report the gap instead of filling a template with generic rules.

In the repository's main instructions, add a short pointer saying when each new doc applies. Wire confirmed reviewer configs through their documented pointer or include mechanism when supported. Preserve existing instructions and skip unused reviewers. If instructions are generated, update their owning source only when that change is in scope.

## Refresh

Work in the existing files. Find the commits that last changed the rules and examine subsequent evidence. When no reliable boundary exists, use available history and say what it covers. Review old rules as well as candidates for new ones. A new check may supersede a rule, a feature removal may make it obsolete, and accepted fixes may show that it needs revision. Cite each proposed addition, revision or retirement. Incomplete history alone gives no grounds to retire a rule.

Show a short preview grouped by file with its changes and supporting evidence. Record no change when the existing guidance still fits. Verify final pointer targets and confirm unrelated instructions and uncovered sections were preserved.

[Compound Engineering project review docs](https://github.com/EveryInc/compound-engineering-plugin/blob/main/skills/ce-setup/references/project-docs.md)
