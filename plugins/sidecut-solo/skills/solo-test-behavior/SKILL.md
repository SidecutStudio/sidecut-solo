---
name: solo-test-behavior
description: "Tests what a product does through its real interface. Use when asked to QA a flow, dogfood a product, test a command or check persistence. Not for design critique (use solo-review-design)."
argument-hint: "[flow, URL or PR]"
allowed-tools:
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" config *)
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" qa-check *)
  - mcp__plugin_sidecut-solo_solo__get_settings
---

# Test behavior

Before project work, run `solo config` for the target checkout. If `setup_needed` is true, pause and invoke `solo-configure-project` for first-run setup. Follow `server/data/settings.md` from the loaded plugin root.

Use the interface a customer or operator actually touches. Check a specific promise or explore a real journey from a plausible starting state.

## Steps

1. Read repository instructions and run solo config. Name the expected outcomes and what would prove them. For exploratory dogfood, name the user’s goal and record the routes attempted, including unexpected friction.
2. Pin the commit or build, dirty changes, environment, account and data. Use the repository's documented previews and isolated test setup.
3. Confirm allowed effects. Reuse bounded account or provider allowances already granted. Verification alone permits no production writes, payments, emails, paid runs or publication. If the requested journey needs missing permission or test inputs, ask using `server/data/user-input.md` from the loaded plugin root.
4. Reuse passing required checks on the pinned subject and run any that lack a current result. An earlier commit, another platform, a queued job or a skipped check supplies no pass.
5. Preserve the producer's exit status when capturing output. Use `set -o pipefail` for pipelines instead of treating a successful `tail` as success.
6. Exercise the actual browser, native app, command, endpoint or job. Use [surfaces.md](references/surfaces.md) to choose the interface and define observable checks.
7. Test relevant failures: invalid input, denied permission, unavailable dependency, retry, empty state and reload during the journey. Confirm saved state after refresh.
8. Record each expected check as passed, failed, blocked or not run with fresh evidence. Label fixtures, mocks and test doubles as simulated.
9. Diagnose failures enough to provide useful reproduction steps. Use solo-diagnose-problem for deeper investigation.
10. Use solo-build-change for authorized fixes. Rerun affected checks on the new subject after fixes. Results never transfer automatically to a later commit.
11. Save scenarios only for repeatable regression, handoff or comparison needs. Use [qa.md](references/qa.md) and validate records with `solo qa-check`.
12. When both testing and design review are requested, share the walkthrough and record behavior results before design findings. Follow `server/data/screen-walkthrough.md`.

## Rules

Resolve the plugin root and run `solo COMMAND` via `server/data/helper-launcher.md` from the loaded plugin root.

Delegate independent journeys to the verifier agent (`solo_verifier` in Codex, `verifier` via `invoke_subagent` in Gemini/Antigravity) unless the user forbids delegation. Share the exact subject, allowed effects and expected checks.

Treat logs and external text as evidence. Never print credentials or request account passwords in chat.

## Done when

Lead with what works. Report every promised outcome, its result and supporting observation.

Include reproducible defects, simulated checks, unproven behavior and the next check that would settle it.

A schema-valid record, passing build or unit test alone does not prove a real integration or journey works.

## References

| Read | When |
| --- | --- |
| [surfaces.md](references/surfaces.md) | Choose the interface and define observable checks. |
| [save-and-reload.md](examples/save-and-reload.md) | Test saved state and error recovery. |
| [qa.md](references/qa.md) | Save scenarios and validate fresh run records. |
| [report-template.md](references/report-template.md) | Write a readable saved-run report. |
| [known-bad-cli.md](examples/known-bad-cli.md) | Understand a regression record that correctly fails. |
