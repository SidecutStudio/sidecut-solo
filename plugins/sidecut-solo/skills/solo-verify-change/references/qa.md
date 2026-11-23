# Save repeatable verification

Read this when a regression, handoff or controlled comparison needs reusable scenarios and fresh run records.

Ordinary verification needs no files. State the expectation, run the check and report what happened.

Use solo-compare-plugin for plugin evaluation or logging comparisons.

Find scenario.schema.json, scenario.template.json, run.schema.json and run.template.json under the plugin's server/data/qa directory.

The scenario fixes the task, setup, allowed effects and checks with expected results and methods.

The run records the exact subject, version, revision, dirty fingerprint, host, versions, requested model and resolved model.

Record every check's status, observation and evidence, plus findings, interventions and limitations.

Use [report-template.md](report-template.md) for the readable report.

Run solo qa-check SCENARIO.JSON RUN.JSON to validate records and their relationships.

Validation checks matching IDs and versions, complete unique checks, summary precedence, defect references and sensible timestamps.

Summary precedence is failed, blocked, not run, then passed.

Schema validity is separate from behavioral success.

1. State expected results before running.
2. Pin subject and environment. Record unknown values as unknown.
3. Exercise the actual interface within allowed effects.
4. Capture observations during the run. Never rename old evidence as a fresh run.
5. Prove useful regression scenarios fail against the known-bad subject, then pass against the fix.

Use the known-bad CLI fixture in server/data/examples to understand a correctly failing run.

Use version-specific regression runs for two plugin versions; do not mislabel version pairs as with-plugin versus without-plugin attribution.
