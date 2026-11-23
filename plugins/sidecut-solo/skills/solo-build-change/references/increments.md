# Build useful slices

Read this when dividing a change into parts that work and can be checked independently.

Choose an end-to-end behavior before completing every layer. For example, finish one waitlist signup before adding every table.

Define the contract first when components must agree on a schema or interface.

Test the riskiest unknown before building on it, including unfamiliar APIs, migrations and performance limits.

Repeat this sequence:

1. Make the smallest useful change using existing patterns.
2. Run its focused check and confirm the promised behavior.
3. Read the diff and commit if the repository uses incremental commits.
4. Continue using what the previous slice established.

Avoid premature abstraction. Keep refactors separate from behavior changes.

Keep checks passing. If a slice cannot stand alone, name the later step that restores the check.

Use existing feature flags for unfinished visible work. Preserve old behavior as the default for new options.

Prove regression tests fail on the old code before relying on their success after the fix.
