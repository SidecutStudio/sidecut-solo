---
name: solo-compare-plugin
description: "Compares plugin sessions and controlled runs from recorded evidence. Use when asked to dogfood a plugin or compare versions or presence. Not for product QA (use solo-test-behavior)."
argument-hint: "[session or comparison]"
allowed-tools:
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" config *)
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" qa-check *)
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" qa-compare *)
  - mcp__plugin_sidecut-solo_solo__get_settings
---

# Compare plugin

Before project work, run `solo config` for the target checkout. If `setup_needed` is true, pause and invoke `solo-configure-project` for first-run setup. Follow `server/data/settings.md` from the loaded plugin root.

Record what a plugin actually contributed and limit conclusions to observed evidence. Keep version comparisons distinct from comparisons with no plugin.

## Steps

1. Establish whether the request concerns one session, two plugin versions or plugin presence. Freeze outcome checks before controlled runs.
2. Record skill activations from the transcript: name, installed version and explicit, automatic or unknown invocation. Include other plugins that materially contributed. List helper commands, MCP tools or hooks that ran without a skill under `tools`, never as skills.
3. Treat optional usage exports as supporting evidence. A desktop slash command can appear proactive; the transcript decides how it started.
4. Record each check's status, observation and evidence. Note helpful steps, unused guidance, user interventions, friction and all limitations.
5. Use the installed templates under `server/data/qa`. Save one scenario and run record per tested plugin in the source repository's existing dogfood location.
6. Use `kind: "session"` for retrospective observations. Validate with the helper's `solo qa-check`; schema validity does not establish success or attribution.
7. For plugin-presence comparisons, freeze the same subject, prompt, host, model, tools and starting files. Run fresh with-plugin and without-plugin sessions.
8. Confirm the plugin is absent from the without-plugin session. Record `kind: "dogfood"`, matching pair identifiers and the actual comparison arms.
9. Run `solo qa-compare` only for that supported with-plugin and without-plugin contract. Report sample counts and observed differences, not universal causal claims.
10. For version comparisons, run each populated plugin version separately with matching scenario, host, model and starting tree. Label both versions accurately.
11. Record version runs as `kind: "regression"` without a comparison block. Validate each through `qa-check` and compare their checks in an external paired report.
12. Preserve authorized logging and redact secrets from saved evidence. Keep run logs, exact versions, command results, failures and cost or session counts.
13. Use `server/data/visual-reports.md` from the loaded plugin root when a paired report benefits from visible comparisons, keeping saved-record validation and attribution limits intact.

## Rules

Never label a baseline plugin version without-plugin. The existing `qa-compare` command does not compare two plugin versions.

One retrospective session cannot establish what the plugin caused. Log useful observations while stating that attribution remains inconclusive.

Obtain a bounded allowance before new paid runs. Reuse the user's existing allowance and stop before exceeding it.

Use throwaway fixtures for repeated runs. Do not replay production writes, payments, DNS changes or releases to create a pair.

## Done when

Validated records and retained logs show which skills ran, what helped and what was skipped. The report identifies sample counts, controls, costs and limits accurately.
