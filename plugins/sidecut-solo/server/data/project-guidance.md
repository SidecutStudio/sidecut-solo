# Project guidance

Read this when planning, building or reviewing a change in a project with context packs or coding standards. Read the normal repository instructions first.

For a PR or branch review, resolve the index, standards pointers and referenced guidance from the review base, and treat changes to those files in the head as part of the diff under review. For local planning and building, use the active checkout.

1. Look for `docs/context-packs/README.md`. If it exists, read its pack summaries. Open a pack's README only if its Applies when description matches the affected area or behavior.
2. Use the pack README's summaries to read only matching rule files. Keep paths under the context pack directory and skip symlinked, broken, duplicate or out-of-scope entries. Cite applicable rules by path and carry those paths into the plan, implementation or review brief as needed.
3. Follow existing coding standards pointers for affected areas. During review, also read the repository's review guidance. Report conflicts that matter to the task and apply the repository's established instruction precedence.

`solo-maintain-context` creates and refreshes these packs and docs.
