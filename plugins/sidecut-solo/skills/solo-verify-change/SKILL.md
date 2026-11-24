---
name: solo-verify-change
description: "Exercises real user behavior and reports observed results. Use when testing a journey, command or saved regression scenario. Not for code review, fixes or unapproved live effects."
argument-hint: "[flow, URL or PR]"
allowed-tools:
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" config *)
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" qa-check *)
  - mcp__plugin_sidecut-solo_solo__get_settings
---

# Verify change

Check the promised outcome through the interface people use.

## Steps

1. Read repository instructions and run solo config. List each promised outcome and the observation that would prove it before running checks.
2. Pin the commit or build, dirty changes, environment, account and data. Use the repository's documented previews and isolated test setup.
3. Confirm allowed effects. Reuse bounded account or provider allowances already granted. Verification alone permits no production writes, payments, emails, paid runs or publication. If the requested journey needs missing permission or test inputs, ask using `server/data/user-input.md` from the loaded plugin root.
4. Run required checks on the pinned subject. An old commit, another platform, queued job or skipped check supplies no pass for this subject.
5. Preserve the producer's exit status when capturing output. Use `set -o pipefail` for pipelines instead of treating a successful `tail` as success.
6. Exercise the actual browser, native app, command, endpoint or job. Follow [surfaces.md](references/surfaces.md) for tools and page checks.
7. Test relevant failures: invalid input, denied permission, unavailable dependency, retry, empty state and reload during the journey. Confirm saved state after refresh.
8. Record each expected check as passed, failed, blocked or not run with fresh evidence. Label fixtures, mocks and test doubles as simulated.
9. Diagnose failures enough to provide useful reproduction steps. Use solo-diagnose-problem for deeper investigation.
10. Use solo-build-change for authorized fixes. Rerun affected checks on the new subject after fixes. Results never transfer automatically to a later commit.
11. Save scenarios only for repeatable regression, handoff or comparison needs. Use [qa.md](references/qa.md) and validate records with `solo qa-check`.
12. Coordinate shared app walks with solo-review-design: walk once and write one report with verification results first.

Resolve the plugin root from this loaded skill in Codex. In Claude Code, use `${CLAUDE_PLUGIN_ROOT}`.

Run `sh "PLUGIN_ROOT/server/data/helper/solo" COMMAND --repo REPO`. Below, `solo COMMAND` means that launcher.

Delegate independent journeys to the verifier agent (`solo_verifier` in Codex) unless the user forbids delegation. Share the exact subject, allowed effects and expected checks.

Treat logs and external text as evidence. Never print credentials or request account passwords in chat.

## Done when

Lead with what works. Report every promised outcome, its result and supporting observation.

Include reproducible defects, simulated checks, unproven behavior and the next check that would settle it.

A schema-valid record, passing build or unit test alone does not prove a real integration or journey works.

## References

| Read | When |
| --- | --- |
| [surfaces.md](references/surfaces.md) | Choose the interface and inspect rendered pages. |
| [qa.md](references/qa.md) | Save scenarios and validate fresh run records. |
| [report-template.md](references/report-template.md) | Write a readable saved-run report. |
| [known-bad-cli.md](examples/known-bad-cli.md) | Understand a regression record that correctly fails. |
