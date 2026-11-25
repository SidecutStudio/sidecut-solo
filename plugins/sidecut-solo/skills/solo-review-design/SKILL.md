---
name: solo-review-design
description: "Reviews rendered screens for concrete design improvements. Use when the user asks about layout, clarity or accessibility of a screen. Not for functional journey verification (use solo-test-behavior) or rewriting its words (use solo-write-copy)."
argument-hint: "[URL, PR, branch or mockup]"
allowed-tools:
  - Bash(sh "${CLAUDE_PLUGIN_ROOT}/server/data/helper/solo" user-facing *)
  - mcp__plugin_sidecut-solo_solo__get_user_facing_changes
---

# Review design

Review what people actually see and explain the most useful improvements. Report findings without editing the product.

## Steps

1. Identify the URL, commit, account and fixture data. Prefer a rendered preview or running page over screenshots and inspect the product's design guidance.
2. Gather what is already known about the surface: earlier review findings, open issues, roadmap or plan items and user reports, including notes kept outside the repository. Each one is re-checked and reported as fixed, still open or not reached, never dropped.
3. For a PR, use `get_user_facing_changes` or the helper's `solo user-facing` command to locate affected surfaces. Review them at the requested head.
4. Use `server/data/screen-walkthrough.md` for browser setup, viewport and captures. Inspect relevant themes and states. Open a disclosure beside closed neighbors to see how the full layout responds.
5. Keep production read-only. Open safe navigation and disclosure controls, but do not send, save, publish, pay, invite, delete or change settings.
6. Consider first impression, the main job, hierarchy, consistency, words and accessibility. Look beyond the main content to navigation, headers and small print.
7. Collect broad candidate findings before selecting them. Do not invent a quota when the surface is small.
8. Try to disprove every claim cheaply. Test hidden controls, inspect destination code, measure contrast and target sizes and compare neighboring screens.
9. Reload suspicious capture artifacts. Drop disproven claims, narrow partial claims and label consequential findings that cannot be checked.
10. Get a cold second look before the challenge. A read-only verifier walks the same surfaces, widths and themes with only the URL and the step 2 list, never your findings, and reports what it sees. Its findings stand until disproved. Without delegation, make a separate same-agent pass in a different order and label it.
11. Challenge surprising findings and findings feeding a merge or build. Use a refuter for code claims and a read-only verifier for rendered claims.
12. Pass exact head and file lines for code claims, or URL, width, theme and observation for rendered claims. Permit no new effects during challenge.
13. Without delegation, challenge them in a separate pass and label it same-agent. Classify confirmed findings as Critical, Moderate or Minor.
14. Write [report.md](references/report.md). Start with first impression and plain-language fixes, then provide implementation evidence separately. Use `server/data/visual-reports.md` from the loaded plugin root for the HTML report while preserving this skill's findings and handoff requirements.

## Rules

Critical findings prevent the page's main job or exclude users. Moderate findings confuse or slow people; Minor findings improve polish.

A screenshot cannot prove interaction behavior. With no rendered evidence, say why design was not reviewed instead of critiquing the diff.

Code review remains `solo-review-code`'s job. Name any missing code coverage when reviewing a PR. If requested follow-through depends on a design choice, show the relevant screens before asking. Follow `server/data/user-input.md` from the loaded plugin root.

When testing the same flow, follow the shared walkthrough and report from `server/data/screen-walkthrough.md`.

## Done when

The report gives first impression, checked findings, strengths and priority fixes. It gives each known item's status, names coverage limits, the cold look and challenge method, and any open Critical finding affecting delivery.

## References

| Read | When |
| --- | --- |
| [screen-criteria.md](references/screen-criteria.md) | Review the rendered layout, contrast and controls. |
| [report.md](references/report.md) | Write findings and the implementation handoff. |
| [mobile-layout.md](examples/mobile-layout.md) | Describe a phone layout finding using a rendered observation. |
