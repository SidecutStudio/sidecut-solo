# Changelog

## [0.42.3] - 2026-11-27

### Changed

- `solo-test-behavior` now says to test a web app on loopback with disposable data and sample responses at paid or external boundaries, and to keep provider and hosting checks apart from that offline suite. This was Sidecut Cookbook's app-testing recipe, which moved here when Cookbook joined Sidecut Home.

## [0.42.2] - 2026-11-27

### Fixed

- The turn guard reads inline code in one pass over a line's backtick runs. A pasted line of about a megabyte with many different run lengths took over three seconds against the prompt hook's five-second limit; it now takes a few milliseconds, and what counts as code is unchanged.

## [0.42.1] - 2026-11-27

### Fixed

- The turn guard now holds a session only to Solo skills the user asks for with an exact `/sidecut-solo:solo-x` slash command, and names each one that never loaded once, at the end of a turn, so the session can load it or say in one line why it didn't apply. Prose names no longer count, and neither do slash commands in quoted lines, code, another session's message, an agent message, a side-session event, a task notification, a CI event, pasted text or a prompt the host made itself. A slash command that opens a Claude Code prompt, or a `$` mention in Codex, is loaded by the host and counts as loaded. An orchestrating session was told it hadn't loaded `solo-test-behavior` because a peer's report quoted it, and a session was raised about a skill its brief kept for a later step.

## [0.42.0] - 2026-11-27

### Added

- `solo automerge PR` hands a PR to GitHub auto-merge, or to a merge label with `--label automerge`, and then waits for the merge. It refuses until the PR head has a clean saved review and the merge is allowed. It also refuses while any required check has failed or never reported, while the PR is stacked on another open PR, and when GitHub would merge at once, or hasn't yet worked out whether it would, or when a check Solo requires but branch protection doesn't hasn't passed yet, (then `solo merge` is the way). It also records the handoff, so the turn guard knows exactly what this worktree is waiting on. If a commit lands on the PR after the handoff, the wait takes the PR off automerge instead of letting the unreviewed head merge. If it merged before the wait saw the push, the wait says so and names the commits to review.
- A hard cap on deep review rounds. `solo review` now takes `--level light|standard|deep`, and `--scope fix-diff` for a review of only the fix. It counts the deep reviews of the whole change saved on the PR's branch and refuses one past `deep_review_rounds` (default 3, set it in `solo-workflow.toml`). The session then stops and gives the owner two choices: rethink the design, or accept the remaining minor findings. A fix-diff review is refused unless the review before it left no blocker or major findings.
- Antigravity now runs the merge guard and the turn guard's Stop hook, the same as Claude Code and Codex.

### Changed

- The guards no longer try to read shell commands. The turn guard decides from the `solo automerge` record and from GitHub's view of the branch's PR. A merge label or auto-merge set by hand, with no record, still holds the turn and sends the session to `solo automerge`. A PR that merged, closed or left automerge clears its record. The merge guard is now a word check: any shell command that names a gh merge is refused and sent to `solo merge` or `solo automerge`. A commit message that mentions one goes in a file instead. Turning auto-merge off is still allowed.
- A running `solo wait-merge` counts as the watcher until shortly after the end of the wait it announced. A loop that runs it again right away stays covered, and a waiter that died stops counting. The process-table scan from 0.41.4 is gone.
- The hooks are about 690 lines shorter, and their tests 270. Each review of #22, #24 and #28 had found another shell form the parser missed, so the fixes never converged.

## [0.41.4] - 2026-11-27

### Fixed

- The turn guard no longer re-prompts a session that is already waiting on its automerged PR. A watcher now counts while any of your processes runs `solo wait-merge` for that PR in the repo, including a background shell that sleeps or loops around it, so the gaps before and between runs no longer look like nobody is waiting. A waiter left behind by a dead `wait-merge`, even one whose process ID the system has handed to something else, no longer silences the hold, and neither does a watcher for another PR or repo, or an agent whose prompt only mentions `solo wait-merge`. A Builder session running `sleep 60; for ...; do solo wait-merge 469; done` in the background was told to start `solo wait-merge 469` on every turn and had to answer "already running" each time.

## [0.41.3] - 2026-11-26

### Fixed

- A session that hands its PR to automerge (a merge label or GitHub auto-merge) can no longer end its turn and sit idle when the PR merges. In Claude Code and Codex, a new turn-guard hook refuses to end the turn until `solo wait-merge` is waiting on the PR. `solo wait-merge` returns when the PR merges, closes, loses its label and auto-merge, or fails a required check, and says what comes next. Opening the PR with the label, `gh issue edit` and commands run through `bash -lc`, `timeout` or `env` count as handoffs too. A Builder session had waited on the desktop app's CI watcher, which speaks up only on failures, and its production checks, staging journey and release sat undone for about two and a half hours.
- Solo skills a brief names are now held to: the turn guard notes them and, when one never loaded, raises it once at the end of a turn. Orchestration says each named skill runs at its step. The same session loaded only the first of the three it was given.

## [0.41.2] - 2026-11-26

### Fixed

- `solo merge --reviewed-head SHA` with no other review flags uses the review `solo review` saved for that commit, instead of asking for all four review fields again.

## [0.41.1] - 2026-11-26

### Changed

- After a deep review that found only minor issues, the fixes get a review of the fix diff alone, at the level the helper suggests for it, instead of another full deep pass. Blocker or major findings still send the whole change back to deep review. One change gets at most three full deep rounds; a fourth needs the user's OK, and minors left after that go in the report as known gaps or follow-ups. A merge-guard rewrite had gone through six full deep reviews, the last one only for small fixes to minor edge cases.

## [0.41.0] - 2026-11-26

### Changed

- The merge guard now refuses any merge run outside the helper in a Solo repo, not only an admin merge, unless it is `gh pr merge --match-head-commit SHA` at a head with a clean saved review. It also follows a `cd` earlier in the same command. Agents and sub-agents had merged with plain `gh pr merge` and left no review behind.
- `solo review` saves the review of one commit. `solo merge` reads it for the head, so the review no longer has to be retyped, and every merge leaves one behind.
- `solo merge` refuses commits made after the reviewed head and names them, such as a fix pushed after the review.
- `solo merge` refuses a PR stacked on another open PR until that one merges, and after a merge lists the PRs stacked on it with the command to retarget each. `solo-deliver-change` gives the order for merging a stack.
- `solo brief` prints the paragraph a parent pastes into a sub-agent's brief so its delivery goes through the helper.
- `solo-deliver-change` keeps waiting on a merge or release until it is confirmed, reruns a flaky job once per delivery rather than once per round, never skips Git hooks, and says when putting back a state the user approved earlier needs a fresh OK.
- Orchestration briefs say whether follow-ups are in scope, and a research or read-only task that turns into build work is offered as its own session.

## [0.40.5] - 2026-11-26

### Fixed

- A session record can list the plugin's helper commands, MCP tools or hooks that ran without one of its skills under `tools`, so a session that only ran `solo qa-check` or a hook no longer has to pass them off as skills. A session record still needs at least one skill or tool.

## [0.40.4] - 2026-11-26

### Fixed

- The `reviewer` and `refuter` agents can use WebFetch and WebSearch, so a finding that turns on a library, API or service's behavior is checked against its current docs and cited, or marked unverified. Before, they could only read the repository.

## [0.40.3] - 2026-11-26

### Changed

- Moved onto sidecut-agentskills v2.7.0. Its checker now flags a skill that names one of its own plugin's read-only tools without listing it in `allowed-tools`, and Solo already passes it.
- The usage-log hook now reads skill files through symlinks, so Antigravity on a Mac is logged when it opens a skill by a linked path.
- `npm run eval` now trusts the staged copy of this plugin, so a background or CI run no longer stops at the trust prompt.

## [0.40.2] - 2026-11-26

### Changed

- `solo-maintain-context` scaffolded standards and review docs at `docs/coding-standards.md` and `docs/review.md` in a repo whose checks limit its top-level files, such as a plugin repo checked by `sidecut-check`, and its drift check pointed to the helper launcher.
- `solo-show-usage` listed `get_usage` in `allowed-tools`, since it reads it.

### Fixed

- `solo docs-check` reported a backticked path to a file or folder that a commit deleted from a top-level folder no longer in the repo. It had skipped any path whose first folder wasn't in the repo, so docs pointing into a removed folder passed. A same-named path that was never here, and a line that tells the history (removed, moved, renamed and the like), stay unreported.

## [0.40.1] - 2026-11-25

### Fixed

- Clarified in `server/data/user-input.md` and `solo-choose-approach` that Gemini/Antigravity runs `ask_question` before rendering the turn's message, so new options, comparisons, drafts, reports, and end-of-turn follow-ups must be shown in a completed chat turn before invoking `ask_question`.

## [0.40.0] - 2026-11-25

### Changed

- Renamed Verify Change to Test Behavior, Review Change to Review Code, and Finish Change to Deliver Change. Usage summaries and `solo retired-names` recognize the previous names.
- Gave functional QA, rendered design review and plugin dogfooding clearer entry points. A shared walkthrough covers screen setup and reporting, with examples for persistence, mobile layout and combined reviews.

## [0.39.2] - 2026-11-25

### Fixed

- Added Gemini/Antigravity subagent notes to steps 7–8 of `solo-review-change`.
- Extracted `hostCost` in `server/src/helper/lib/usage.ts` and used it in `server/src/helper/dashboard/summary.ts` so non-Claude hosts without cost events report `no cost sent` instead of `$0.00`.

## [0.39.1] - 2026-11-25

### Changed

- Synced `sidecut-agentskills` to `v2.6.2` (`VOICE.md` and `package.json`).
- Aligned `README.md` with the Install source layout and added `agy plugin install ./plugins/sidecut-solo` for Antigravity.
- Added Antigravity parity in `server/data/visual-reports.md`, `server/data/user-input.md`, `server/data/helper-launcher.md`, `solo-diagnose-problem`, `solo-verify-change`, `solo-show-usage`, `solo-review-change/references/deep-review.md`, and `server/src/helper/lib/usage.ts` (`antigravity` host display name and `solo-maintain-context` in `SOLO_SKILLS`).
- Added an explicit `tools` allowlist to `agents/verifier.md`, standardized `## Rules` across specialist skills, moved repeated launcher text into `server/data/helper-launcher.md`, and integrated `visual-reports.md` steps in `solo-review-change` and `solo-compare-plugin`.
- Set `SIDECUT_SKILL_LOG=0` in `tests/setup.ts` and added tests enforcing `SOLO_SKILLS`, `antigravity` host naming, and explicit agent `tools` allowlists.

## [0.39.0] - 2026-11-24

### Added

- Hands-off runs. Say "lfg", "hands off" or "run it end to end" and Solo asks one start question, then takes its recommended option at each decision and lists what it chose in the final report. With `merge = "ask"` it also asks once whether to merge on green or stop at a ready PR. The answers last for that task only. They never change `solo-workflow.toml`, and publishing, spending, scope changes and host gates still stop for you. See `server/data/hands-off.md`.
- solo-finish-change repairs a failed required check for up to two rounds (`references/ci-repair.md`): it fixes failures this change caused, reruns flaky jobs once, and reports anything pre-existing or out of scope.
- solo-build-change simplifies its own diff before the full checks and review (`references/simplify.md`).
- solo-diagnose-problem offers to save one lesson when the cause would probably trap the next reader.
- `tests/description-overlap.test.ts` fails when two skill descriptions score 0.4 or more on TF-IDF similarity, so they could compete for one request, and when a skill has no trigger eval. Five new evals cover a pasted diff, three near misses (list-work, prevent-mistake and review-change) and the hands-off trigger.

## [0.38.0] - 2026-11-24

### Changed

- Two skills have clearer names. `solo-check-status` is now `solo-list-work`, because elsewhere in the marketplace `*-check-status` means "is the MCP server running". `solo-improve-workflow` is now `solo-prevent-mistake`, matching its router row. The skill log and `solo retired-names` both still recognize the old names.
- Solo follows Sidecut Agentskills 2.6.1. The question guide is now `server/data/user-input.md` and adds Offer follow-ups. The plugin ships Antigravity's `.antigravity-plugin/plugin.json`, `mcp_config.json` and `hooks.json`. The skill-log hook also counts Antigravity skill reads.
- How to read context packs and standards before planning, building or reviewing now lives in `server/data/project-guidance.md`, and plan-change, build-change and review-change point to it. `solo-maintain-context` is back to one Steps list and has a Done when.
- `solo-write-copy` has a Done when and a shorter description. `solo-review-change` now also fires on a diff pasted inline or a "safe to merge?" question. `solo-compare-plugin`'s description now leads with the verb in its name: "Compares plugin sessions and controlled runs from recorded evidence."

## [0.37.3] - 2026-11-24

### Changed

- Refreshed `README.md`, `AGENTS.md`, `SECURITY.md`, `lefthook.yml`, and `server/data/specification.md` to match current behavior (Node.js/npm hooks in `lefthook.yml`, on-by-default skill log, `solo.mjs` launcher wording, skill-log hook in `SECURITY.md`, and Gemini/Antigravity support).

## [0.37.2] - 2026-11-24

### Changed

- `solo`, `solo-review-change`, and `solo-finish-change` references document Gemini/Antigravity compatibility: resolving the plugin root from symlinked `skills/`, delegating via `invoke_subagent` (`TypeName`, `Model`), and worktree cleanup behavior.

## [0.37.1] - 2026-11-23

### Changed

- Sidecut Solo is public. Its source moved to a fresh repository at the same address, starting from this version; the changelog below keeps the full history.

## [0.37.0] - 2026-11-23

### Added

- `tests/portability.test.ts` fails the build when a shipped or contributor file names a private Sidecut repo or product, Sidecut's CI runners, a personal path, a real email address or the maintainer, and checks that the helper's setup commands print none of them in a stranger's repo.
- A contributing guide, issue and pull request templates.

### Changed

- The README is written for someone finding Solo for the first time: what it does, how to install it in Claude Code or Codex, how to make the settings yours, and exactly what it records on your machine.
- The plugin's one-line description says what you get from it.
- Visual reports and the usage dashboard describe their own design instead of pointing at Sidecut's private design files.

### Fixed

- The merge guard's refusal points to the Solo helper's merge command instead of the retired `solo.ts merge`.
- The README's Claude Code telemetry example puts its variables under `env`, where Claude Code's settings read them.

## [0.36.1] - 2026-11-23

### Changed

- `solo-write-copy` edits a repo's agent docs after `solo-maintain-context` checks their facts: it cuts dated notes and rules repeated in other words. Its scan takes `--docs`, which stops flagging lists of three and menu paths like "Settings → People".

## [0.36.0] - 2026-11-23

### Added

- `solo docs-check` checks a project's instructions and docs against the repository. It reports backticked paths that don't exist, relative links and `#anchors` that don't resolve, `run <script>` commands missing from `package.json` and retired Solo names, as JSON with file and line, and exits 1 when it finds any. `--one-sentence-per-line` also reports prose lines with more than one sentence.
- `solo-maintain-context` has a match reality mode. It runs `docs-check`, then checks what a script can't: status claims, lists that claim to be complete, facts copied from the repo that owns them and facts repeated in two places. It points to Claude Code's `/doctor prompt-audit` for instruction files.

### Changed

- Project setup offers `docs-check` as a `[checks]` entry, and finishing a change runs it and fixes the problems the change caused.

## [0.35.4] - 2026-11-23

### Added

- `solo retired-names` finds project instructions, the Codex marketplace file, hooks and Solo setup scripts that still name a retired Solo plugin, repository, helper path or skill, and gives the current name for each. Project setup runs it and replaces what it finds.

## [0.35.3] - 2026-11-23

### Added

- Scaffold reusable project context packs and draft or refresh coding standards and review guidance with repository evidence. Plan, build and review load the guidance that applies to the task.

### Changed

- Plans map affected consumers and checks when work crosses a boundary. Resumed work keeps the current diff, next action and verification evidence in the existing record.
- Project setup checks the checkout and capabilities before edits. Build guidance covers local shadcn/ui composition and Expo Router navigation checks when those frameworks apply.

## [0.35.2] - 2026-11-21

### Changed

- Skills and references describe the merge and clean-up safety rules in plain words instead of quoting the unsafe commands they forbid.

## [0.35.1] - 2026-11-20

### Changed

- Solo installs from its own marketplace: `/plugin marketplace add SidecutStudio/sidecut-solo`, and the same repo in Codex.
- Skills, the specification and the merge guard say "the user" where they said "the owner", and `solo-write-copy` writes so copy sounds like its author.
- Examples and the review workflow no longer name private Sidecut projects.

### Removed

- The notes for Sidecut's own task queue, which applied to no one else.

## [0.35.0] - 2026-11-19

### Changed

- `solo-write-copy` is about a tenth of its old length: eight steps, three rules and one `lessons.md` of your past corrections. The generic writing catalogue is linked upstream to read live instead of copied, and the scan table it duplicated from `scan-copy.mjs` is gone. In eval runs on three writing tasks, the short version matched the old one (7 of 9 passed each) at lower cost.

### Removed

- `solo-write-copy`'s `craft.md` and `tells.md` references.

## [0.34.1] - 2026-11-19

### Removed

- `solo-choose-approach` no longer estimates effort or separates agent time from waiting time. Those guesses were nearly always wrong and padded answers with hedging. It still says what each option asks of you.

## [0.34.0] - 2026-11-19

### Changed

- Reviews set the reviewer's model and effort in both hosts. `review_model` stays the Claude Code model, the new `codex_review_model` names the Codex one (unset keeps the parent's), and `review_effort` (low, medium or high; default medium) applies to both. Standard reviews pass them; deep reviews keep the parent's model and effort, and the review record says which ran.
- Usage covers Codex. The receiver marks each record with its host and keeps only allowlisted Codex fields, never email, account IDs, tool arguments or output. The report and dashboard show Codex sessions, skill runs, MCP tools, tokens by model and per-host totals; cost stays Claude Code only. Hook-log runs count only for a host the export doesn't cover.

## [0.33.4] - 2026-11-18

- Finishing a change in a Claude Code worktree session removes that worktree once the merge is proven and keeps its branch. Other hosts name the worktree in the final report.

## [0.33.3] - 2026-11-18

- Use host-native questions for material owner choices in planning, review and delivery. Keep permission gates separate and continue safe work when a reply is pending.

## [0.33.2] - 2026-11-18

### Changed

- Publish through the shared Sidecut plugin release workflow.

## [0.33.1] - 2026-11-18

### Changed

- Describe Solo by its engineering workflows rather than its audience. Simplify usage guidance.

## [0.33.0] - 2026-11-18

### Changed

- Move behavioural evals out of the installed plugin and run them explicitly from the development repository.
- Simplify the Sidecut Solo project instruction.

## [0.32.0] - 2026-11-18

- Migrated development and the installed helper to Node.js and npm.
- Simplified skill authoring and verification guidance.

## [0.31.1] - 2026-11-18

### Fixed

- `qa-check` and `qa-compare` run without Bun. When the launcher finds no Bun 1.4 or newer, it runs them on Node.js 22.18 or newer through its type stripping, so a sandbox with Node.js and no Bun, such as Cowork's, validates session records the supported way. With neither, it says in one line what it looked for and what it found. Every other helper command still needs Bun.
- The session run template carries one example finding with every required field (`id`, `kind`, `severity`, `check_id`, `summary`, `evidence`, `reproduce`), so the shape shows before `qa-check` does.

Why: in an 18 Nov dogfood session in Cowork, the helper couldn't start without Bun, so the record was checked with a different validator, and the first `run.json` named a finding's `kind` as `type`.

## [0.31.0] - 2026-11-17

### Changed

- `solo-review-design` starts from what is already known about the surface: earlier review findings, open issues, roadmap or plan items and user reports, including notes kept outside the repository. The report gives each one's status (fixed, still open or not reached) instead of dropping it.
- It opens cards, accordions and menus beside closed neighbors and checks the space around them, not only what's inside.
- Before the challenge, a read-only verifier takes a cold second look: it walks the same surfaces, widths and themes with only the URL and the known-items list, never the reviewer's findings. What it finds stands until disproved. Without delegation, a separate same-agent pass in a different order stands in, labelled as such.
- The report and handoff record the known-items list and the cold look, and mark each finding with who found it.

Why: on 17 Nov a library page review skipped this skill's method. Its verifier, handed the reviewer's findings to confirm, also missed a card-grid gap that the user's screenshots had already flagged on 30 Oct.

## [0.30.0] - 2026-11-17

### Changed

- The standard skill hook is on by default, from Sidecut Agentskills 0.12.0. It still records only `time`, `plugin`, `skill` and `host` locally and sends nothing. `SIDECUT_SKILL_LOG=0`, `DO_NOT_TRACK=1` or a CI environment turns it off.
- `solo usage`, `solo-show-usage` and the README say the same, and `tests/skill-log.test.ts` proves the new default and every off switch.

## [0.29.0] - 2026-11-17

### Added

- `solo usage` reads the plugin's own skill log (`SIDECUT_SKILL_LOG=1`) when there is no receiver export: runs per skill and host, and the skills that never started. Skill counts no longer need the source repository's receiver.
- `solo usage --share` prints one line, the version and runs per skill over the period, for the user to paste wherever they choose. It holds no repositories, costs, timestamps or hosts, and sends nothing. `solo-show-usage` offers it when the user wants to share how they use Solo.
- `tests/skill-log.test.ts` proves the skill hook stores only `time`, `plugin`, `skill` and `host`, never arguments, output or paths; stays off by default, with `DO_NOT_TRACK` and in CI; ignores other plugins' skills; and never fails the session.

## [0.28.0] - 2026-11-17

### Changed

- `solo-write-copy` no longer stops for your approval of a brief or a first item. It writes the brief for itself and delivers the whole result at once, then takes your notes in one round.
- For a page, `solo-write-copy` decides the page before the sentences: it can restructure, merge or cut sections, and it says what it changed.
- `solo-write-copy` starts each item's pitch from what you have said is impressive, ahead of what is easiest to cite in code.
- A project's style rules guide `solo-write-copy` rather than bind it. When one fights how the page reads, it makes the call and names it.
- Hard limits still bind: privacy, secrets, legal and employer rules, required notices and never inventing. Your own words still win.
- Technical facts on a product page can sit one tap away in a clearly named disclosure, not only in plain view.
- When each round fixes the last note and breaks something else, `solo-write-copy` rereads every note and redoes the page as one whole.

## [0.27.0] - 2026-11-16

### Changed

- `solo-write-copy` starts with a brief: each reader the words must win and what each should leave with. For every item it names why someone would want it and the part they'd show a friend, read from the repo that owns the item.
- Activity counts and safety checks back a claim in `solo-write-copy`; they are never the pitch.
- For a new page, or when you say the copy doesn't sell, `solo-write-copy` can show you the brief before any copy.
- For products, projects or roles shown side by side, `solo-write-copy` can get your yes on one item before writing the rest.
- A new side-by-side step reads items of one kind together and rewrites them until they no longer read as one template. Changelog entries, buttons and labels keep their set pattern.
- The `solo-write-copy` craft guide covers several items of one kind and pages with a general and a technical reader.

## [0.26.5] - 2026-11-16

Still open in the `solo-write-copy` scan:
- A sentence that starts with a link's or button's text followed by a comma, bracket or dash and at most 40 more characters isn't checked for `repeat`, such as "Trip Planner, the travel app" beside a "Trip Planner" link.
- Two links or buttons with nothing between them are read as two labels, even when one sentence runs across them.
- On a page with more than 5,888 tags holding alt, title, aria-label or meta text, the tags past that count take the section of the last one before them, so their alt text can be compared with the wrong section.

### Fixed

- An HTML heading without a closing tag no longer swallows the text after it. It ends at the next block-level tag, a new heading included, or at a blank line, whichever comes first, in HTML and in Markdown alike. A heading with its closing tag still runs to that tag.
- A private-use character written as an entity, such as an icon font's `&#xE100;` or `&#xE000;`, reads as an unknown character, so it can't move alt text into another section or pose as a heading.
- Section names collapse runs of spaces, so `<h3>01<br>Discovery</h3>` is named "01 Discovery", and drop a heading's closing hashes, so `## Title ##` is named "Title".

## [0.26.4] - 2026-11-16

Still open in the `solo-write-copy` scan: a sentence that starts with a link's or button's text followed by a comma, bracket or dash and at most 40 more characters, such as "Trip Planner, the travel app" beside a "Trip Planner" link, isn't checked for `repeat`; and two links or buttons with nothing between them are read as two labels, even when one sentence runs across them.

### Fixed

- The `solo-write-copy` scan decides what is a heading in one place, so placing alt text and building sections can't disagree. Each of these now starts exactly one section, in HTML and in Markdown:
  - a heading split by a line break or blocks inside it, such as a README's logo, `<br>` and name, or `<h3>01<br>Discovery</h3>`;
  - a numbered heading, such as `<h3>1. Discovery</h3>` or `## 1. Discovery`;
  - an HTML heading that is only a link address;
  - each HTML heading on a Markdown line that holds several.
- `#` and Setext headings are read only in Markdown and plain text, so a paragraph starting with `# ` on a built page stays a paragraph.
- A private-use character in the input, such as an icon-font glyph, is read as an unknown character and never as one of the scan's own marks.
- An alt flag on a long Markdown line names the heading it falls under, as it does on a built page.

## [0.26.3] - 2026-11-16

### Fixed

- The `solo-write-copy` scan compares only alt text with its section for `repeat`, so a `title`, `aria-label` or page description that restates the text beside it, such as an `og:title` matching the page title, isn't flagged.
- In HTML, a heading that starts with a short number, such as `<h3>1. Discovery</h3>`, starts a section for alt text too, and HTML headings sharing one line of a Markdown file each start their own.
- A placeholder such as `<area code>` stays in the text instead of being read as a tag.

## [0.26.2] - 2026-11-16

### Fixed

- The `solo-write-copy` scan reads alt text apart from the page's text again, so a picture no longer splits a sentence or turns a heading that starts with an icon into body text, and a long alt no longer counts toward rhythm, triads or fragments.
- Alt text is decoded once, so `&amp;mdash;` stays as written, and alt on `input type="image"` and `area` is scanned again.
- Alt text still joins the section it sits in for `repeat`, and a label followed by a screen-reader note, or two lowercase labels side by side, isn't counted as a repeat.

## [0.26.1] - 2026-11-16

### Fixed

- The `solo-write-copy` scan decodes numeric entities such as React's `&#x27;`, so a built page's contractions are checked and `repeat` no longer reports pieces like `x27 s`.
- A heading built from elements side by side, such as a number or icon beside its title, stays one heading, and a Setext heading starts a new section.
- Inline elements side by side, such as a link followed by a screen-reader note, stay in one sentence; only labels are read apart.
- Alt text is read where the picture sits, so it's compared with its section for repeats, and alt and title flags on a long built line name their heading.
- The same link or button label on every card isn't flagged as a repeat.

## [0.26.0] - 2026-11-16

### Added

- The `solo-write-copy` scan reads alt text, `title` and `aria-label` attributes, the page description and social titles, so a built page is scanned in full.
- The scan flags a phrase said twice in one section (`repeat`), and its editing pass asks whether another field of the same item already makes the claim.

### Changed

- On a built page whose text sits on a few long lines, each flag names the heading it falls under, and labels in neighbouring elements are read apart instead of run together.
- `solo-write-copy` says a clean scan proves little, gets a cold read for reports and recommendations as well as published words, gives the reader the lines you already approved, and saves verdicts on a report in the voice guide of the project it's about.

## [0.25.0] - 2026-11-16

### Added

- `solo-write-copy` writes and rewrites words people read, such as pages, READMEs, release notes, PR descriptions, emails and posts. It starts from the reader and the real specifics, edits in one-question passes, scans for AI-writing tells with its own script and saves your picked and rejected lines in the project's voice guide.

### Changed

- The `solo` router sends writing and rewriting words people read to `solo-write-copy`.
- `solo-choose-approach` writes a new page's words with `solo-write-copy`, and `solo-review-design` hands rewriting a screen's words to it.

### Fixed

- The `solo` router's trigger eval looked for the router's old `solo-workflow` name, so it failed on every run; it now checks for `solo`.

## [0.24.0] - 2026-11-16

### Added

- `solo-show-usage` shows which skills, tools and agents ran, what they cost and whether usage is still being recorded. It opens the dashboard in the host's own browser view and keeps usage off hosted pages.
- `solo usage` and `get_usage` now open with when usage was last recorded, and warn after a day without events, so a stopped receiver no longer looks like a quiet week.
- `solo-choose-approach` gained a visual directions guide: research real sites, write the words for the actual reader, then show two or three rendered directions before anything is built.

### Changed

- The `solo` router sends a new page, site or visual identity to `solo-choose-approach`, and `solo-build-change` sends it there when no direction has been picked.
- Visual reports open where the user already is: an Artifact or the built-in browser in Claude Code, the in-app browser in Codex. They are no longer handed over as files to download.

## [0.23.1] - 2026-11-16

### Fixed

- `solo user-facing` and the deep-review workflow no longer asked for a design review for code generators' templates of code, settings or Markdown, such as a plugin scaffold's `SKILL.md.tmpl` or `.gitignore.tmpl`. Templates in folders people see (`emails/`, `public/`, `content/`, `locales/` and the like), markup templates (`page.html.tmpl`) and files under `templates/` without a `.tmpl` suffix still count.
- A `solo merge` refused before it began left its task record open, and that record then blocked every later merge in the checkout through its stale snapshot. A merge record that never started now gives way to the next merge, which notes it as superseded; a record with any recorded work still blocks.

## [0.23.0] - 2026-11-15

### Added

- Added shared HTML report guidance and an adaptable layout using Sidecut's design tokens and editorial voice.

### Changed

- Design comparisons, blind bakeoffs and design reviews defaulted to visual reports. Research and other explanations used them when useful.

## [0.22.2] - 2026-11-14

### Changed

- Delivery and status guidance names the repository in every provider command, and counts a release or tag only when its repository, version and commit all match the merged head.

## [0.22.1] - 2026-11-14

### Changed

- The GitHub repository and both host manifests now use `SidecutStudio/sidecut-solo`. Repository checks use the matching name directly. Existing Solo settings filenames and saved state remain compatible.

## [0.22.0] - 2026-11-14

### Changed

- Breaking: renamed the plugin to Sidecut Solo (`sidecut-solo`), the router to `solo`, and action skills from `solo-workflow-*` to `solo-*`. Reinstall it from its marketplace and use the new skill names. MCP connections and Codex role profiles now use `solo`; existing settings, task records and usage history remain readable.

## [0.21.1] - 2026-11-13

### Changed

- Releases use the release workflow and script every Sidecut plugin repo shares, from sidecut-agentskills 0.5.0. The release ZIP is now named `sidecut-solo-workflow-<version>.zip`.

## [0.21.0] - 2026-11-13

### Added

- `review` setting in `solo-workflow.toml`: `auto` (default), `deep` (every change deep, as before) or `light` (keep standard changes same-agent; deep areas stay deep). `review_model` picks the model for standard reviews.

### Changed

- Review is sized to the change. `solo user-facing` suggests a level from the changed files and line count. Light (prose docs, dependency bumps, images, or up to 10 lines in one source file) is a careful same-agent pass with no extra agent. Standard (ordinary work) is one independent reviewer on a cheaper model, `sonnet` by default. Deep (sign-in, secrets, payments, stored data, CI and release machinery, hooks, host settings, or a large change) uses your own model, plus the refuter for surprising findings. Skills, references and specifications are never light.
- After a light or standard review, the re-review covers the fix diff alone, at the level that diff calls for. After a deep review, the next one is deep again.
- Reviewer briefs ask for blocker and major findings with evidence, not a general opinion.

## [0.20.0] - 2026-11-13

### Added

- Added fresh-session trigger evaluations for every skill.
- Added the standard opt-in local skill hook while retaining requested usage logging, refusal reports and dashboard support.

### Changed

- Breaking: the plugin installs as `sidecut-solo-workflow` and every skill has a new name (for example `solo-status` is now `solo-workflow-check-status`). Reinstall it from its marketplace; the `solo-workflow` skill keeps its name.
- Migrated the install ID and package path to `sidecut-solo-workflow` while preserving the Solo Workflow product name and helper data identifiers.
- Rewrote the skills with the `solo-workflow` prefix, focused procedures and local supporting references.
- Moved installed helper source, QA data, examples and the deep-review workflow into `server/` while preserving their responsibilities.
- Aligned Codex role profiles, host hook registration, manifests and copied package documentation with the current layout.

### Fixed

- The merge guard also catches the admin merge flag when it's written with shell backslashes.
- Kept current-head review, required-check gates, delivery permission, recovery and task ownership explicit throughout the rebuilt guidance.
- Kept version-pair regression comparisons separate from with-plugin and without-plugin attribution records.

## [0.19.1] - 2026-11-13

### Changed

- A new icon: a white branch-merge mark on a near-black tile with an orange full stop. Codex shows it for the plugin and each of its skills.
- The brand colour is orange, `#FF6B00`.

## [0.19.0] - 2026-11-13

### Changed

- Solo now has a read-only MCP server for Claude Code and Codex with six tools: `get_settings`, `get_work_state`, `get_pr_checks`, `list_merged_branches`, `get_user_facing_changes` and `get_usage`. Each one calls a read-only helper command, so agents can check where things stand without asking you to approve shell commands. Nothing on it merges, pushes or deletes. It needs Node.js 20 or newer.
- `get_usage` shows the usage dashboard right in the chat in hosts that draw MCP Apps, such as the Codex desktop app. Claude Code and the Codex CLI get the same report as text.
- Each skill that pre-approves a read-only helper command now also pre-approves the matching tool.
- `solo.ts usage --json` prints the report and the dashboard's numbers as JSON.
- The dashboard shows costs from $1,000 to $9,999 as whole dollars instead of with three decimals.

## [0.18.0] - 2026-11-13

### Changed

- Every skill's name now starts with `solo-`: `solo-build`, `solo-finish`, `solo-review` and so on. The router keeps `solo-workflow`. Installed plugins share one list of skill names, so a bare `build` or `review` could clash with another plugin's, and Codex's `$name` has no plugin prefix. Start one by name with `/solo-workflow:solo-review` in Claude Code or `$solo-review` in Codex. The old names don't work any more, and the `explore` and `investigate` aliases are gone.
- The merge guard now runs in Codex too, from one `hooks/hooks.json` both hosts read. Codex runs it only after you trust it in `/hooks` (or Review hooks in the desktop app). To make that work, the Codex manifest moved to `.codex-plugin/plugin.json`: Codex doesn't load hooks from a plugin with the newer root `plugin.json` yet (openai/codex#47925).
- Each skill has Codex metadata (`agents/openai.yaml`): a display name, a short description, a starter prompt and Solo's colour. Dogfood only starts in Codex when asked for.
- In Claude Code, each skill pre-approves the read-only helper commands it uses (such as `inventory`, `checks` and `config`), so those no longer ask for permission. Commands that change something, such as `push`, `merge`, `run` and `cleanup`, still ask every time.
- `remote-state` refuses a `--remote` that starts with `-`, which git would otherwise read as one of its own options.

## [0.17.1] - 2026-11-13

### Changed

- Setup's Solo section in `AGENTS.md` is now a two-line pointer: load the Solo skill that fits, or the `solo-workflow` skill when it's unclear which. The skill list it used to carry went stale in every repo whenever a skill was added or renamed; the skills' own descriptions and the `solo-workflow` router already carry that map, and a test keeps the router listing every skill. Run Setup again to replace the old list.

## [0.17.0] - 2026-11-12

### Changed

- Skills that did two jobs are split into one skill per job. `explore` becomes `decide` (choosing between options, ranking drafts blind) and `research` (looking things up from docs and other sources, with links). `investigate` becomes `troubleshoot` (why something is broken or slow) and `status` (where the work stands and what's safe to remove).
- `explore` and `investigate` still work: each is a short skill that passes the request to the one that fits, so old prompts and the AGENTS.md section written by 0.16.0's Setup keep working. Run Setup again to refresh that section with the new names.
- All 16 descriptions together are shorter than 0.16.0's 12 (3,401 characters, down from 3,645), and a test keeps them under that limit.

## [0.16.1] - 2026-11-12

### Changed

- A task record whose merge already went through no longer blocks the next `solo.ts merge` in the same checkout. Before, merging a second PR there refused with "Working state changed", and after a `resume` with "still has uncertain work", until the old record was reconciled by hand. An unconfirmed merge, push or other uncertain action still blocks, and `resume` still asks for `reconcile` before more steps under the old record.

## [0.16.0] - 2026-11-12

### Changed

- Skill descriptions are about half as long (about 3,500 characters in all, down from 7,100) and lead with the job in plain words. Claude Code drops the descriptions of rarely used skills when the skill list runs out of room, and short descriptions keep Solo's skills findable.
- Setup adds a short Solo section to the project's `AGENTS.md` (and `@AGENTS.md` to `CLAUDE.md`) naming which skill fits which job. Claude Code and Codex both read it every session, so the agent picks Solo's skills without the user typing their names. Run Setup again in existing projects to add it.
- The README is rewritten for people who don't write code: what it does, a "Words you'll see" list, and example requests for each skill. Repo-only details (CI platform, usage receiver, release mechanics) moved out.
- Plain-words manifest description and Codex starter prompts.
- LICENSE names Sidecut Studio only.

## [0.15.0] - 2026-11-12

### Changed

- The merge guard hook no longer asks before `gh pr merge` or a `gh api` merge. Its "ask" stopped work even in Bypass permissions mode, matched merges inside long chained commands, and was approved every time it was answered (58 of 58). It now refuses only an admin merge, the kind that skips GitHub's required checks, and tells Claude why instead of prompting.
- Finish accepts `gh pr merge --match-head-commit <reviewed head>` (with `--auto` while checks run) where GitHub itself requires the checks, alongside `solo.ts merge`; never an admin merge.
- `solo.ts merge --blocking-findings none` counts as zero instead of refusing; agents wrote `none` 17 times across recent sessions and had to rerun each time.

## [0.14.2] - 2026-11-12

### Changed

- A refused `solo.ts merge` names every unmet requirement in one message (the review's count of blocking findings, a dirty worktree, publication permission, checks, the review's head) and points to Finish, instead of one refusal per run.
- When the local HEAD isn't the PR head, `merge` says which worktree has the PR head checked out and to rerun with `--repo` there, instead of three reasons about the wrong commit.
- Any merge goes through Finish: the router, Build and Review now say to load it before `solo.ts merge`, and Finish's description covers "review the fixes then merge".
- Design Review says to read its report template before writing, makes "consequential" concrete (a review that feeds a merge, a Build request or a fix decision, or a Critical finding) and says what to do when the host has no agents to challenge findings.
- Verify and Design Review on one walk of an app write one report: Verify's results first, the design findings by topic, and what wasn't tried kept apart.
- Verify says a pipe's exit 0 isn't a pass: `cmd | tail` reports `tail`'s status.

## [0.14.1] - 2026-11-10

### Changed

- Finish gives the helper's run line, `sh "${CLAUDE_PLUGIN_ROOT}/scripts/solo"`, with the path to use in Codex or from a plain file read, and its first steps say what to find out, with the helper as the shortcut.
- `checks <pr> --reviewed-head <sha>` fails when the PR head is no longer the commit you reviewed. Finish runs it right before adding a merge label and again after the repo's workflow merges.
- Without `--task`, each worktree gets its own default task record, so a `default` record another worktree left behind no longer blocks `merge` everywhere else. A `--task` you name that belongs to another worktree is still refused.

## [0.14.0] - 2026-11-10

### Changed

- Design Review is its own skill (`/solo-workflow:design-review`) for critiquing a screen, page, mockup or redesign. Its method moved out of Review unchanged.
- Review runs both a code review and a design review when a change touches what people see (components, styles, markup, copy, images, fonts, design rules, or a PR described as a design change), or opens with `Design not reviewed: <why>`. A visual PR no longer gets a code-only review in silence.
- `solo.ts user-facing` lists the changed files people would see and says whether the change needs a design review. Review, Build and Finish use it; the deep-review workflow flags visual files as not covered by its code review.
- The router, Build, Finish and the `reviewer` agent (Claude Code and Codex) send visual changes to Design Review; an open Critical design finding blocks a merge.

## [0.13.1] - 2026-11-10

### Changed

- A worktree Git says is "already used by worktree at …" belongs to another session: don't write, merge or push there; report it or work from a new branch.
- When the merged head isn't the one Finish reviewed, Finish compares it with the heads the task itself pushed and, if it isn't one of them, says another session or tool pushed it, instead of naming an author that every commit shares.

## [0.13.0] - 2026-11-10

### Changed

- Review critiques a screen, page or mockup's design: a wide look by topic (usability, layout, consistency, words, accessibility, what works) with severity labels and priority fixes in plain words, every point checked on the live page or in the code first, and a folded handoff for the agent making the fixes.
- Build can start from a design (a screenshot, mockup, Claude Design or artifact page, Builder look or Figma frame): map it onto the product's own components and design values, then compare the result with the design.
- Verify's page checks cover widths, light and dark, overflow, contrast (placeholders included), tap targets and before/after screenshots, using `agent-browser` when it's installed and the host's browser otherwise.
- Explore's bake-off ranking asks for a reply in chat, since a sent page may show as a still copy where its button can't run.

## [0.12.4] - 2026-11-10

### Changed

- When to ask now says how to ask: an offer the user can say yes to (what you'd do, what it changes, costs and how it's undone), then do it yourself with the session's tools instead of handing over commands or dashboard steps. A risky step gets an independent review before the offer.
- Overwriting a branch on GitHub, rewriting history or deleting unique commits is no longer handed to the user to run: explain what it would lose, recommend, and do it only after their explicit yes. Skipping a required check stays off limits.

## [0.12.3] - 2026-11-10

### Changed

- Finish says a review record names only the agents that actually ran on that head; a reread of a head that only merges main is a same-agent check, whatever format the repo's own record uses.
- Finish checks that the merged head is the one you reviewed after every merge, not only when the repo merges for you, and if it isn't, says who pushed it.
- Improve Workflow takes several named problems one after another, each with its own cause, proof and PR.
- Investigate's environment comparison includes which machine actually ran the job: the runner or host name, checked against the runner list, not a nickname.

## [0.12.2] - 2026-11-08

### Changed

- The merge guard also asks before `bash -c "gh pr merge …"`, `sh -c '…'` and `bash -lc '…'`, which it let through.
- With `SOLO_HELPER_LOG=off`, `solo.ts usage` no longer reads a file named `off`; it says the refusal log is off.
- The README, the `usage` output and Explore, Improve Workflow and Dogfood now say that skill-run data needs the usage receiver from the source repository, which the plugin doesn't install; without it, `usage` shows only the helper's refusals.
- Setup has an argument hint, the verifier says why it has no tool allowlist, and the Codex manifest and marketplace list the plugin under Developer Tools.

## [0.12.1] - 2026-11-05

### Changed

- The launcher skips a Bun older than 1.4 and keeps looking, so a stale one on PATH no longer wins over a current one in `~/.bun/bin` or Homebrew; when only old ones exist it names them and says how to upgrade.
- `--help` shows the launcher command, `sh scripts/solo`, instead of `bun solo.ts`.

## [0.12.0] - 2026-11-05

### Changed

- A usage dashboard: `solo.ts usage --html <file>` saves a self-contained page with the totals (sessions, cost, skill runs, active time, pull requests, commits), a daily chart for whichever you pick, and ranked lists of skills, run times, cost by skill and model, MCP tools with failures, subagents and helper refusals. It works offline, follows light or dark mode and fits a phone. The repo's usage receiver serves the same page live at `http://127.0.0.1:4318/`, and now only answers requests addressed to `127.0.0.1` or `localhost` with a real JSON type, so a web page can't read the dashboard or add records.
- The helper runs through a small launcher, `scripts/solo`, that finds Bun in `$BUN_INSTALL/bin`, `~/.bun/bin`, `/opt/homebrew/bin` or `/usr/local/bin` when the session's PATH leaves it out, as background workers and sandboxes often do, and says plainly when Bun isn't installed.

## [0.11.0] - 2026-11-05

### Changed

- `solo.ts usage` shows which Solo skills ran and how they started, which never did, sessions where only the router ran, and the helper's own refusals. It reads Claude Code's local usage export when you keep one, and a new local log of helper refusals (fixed wording only, with names, paths and values replaced; `SOLO_HELPER_LOG=off` turns it off). Skill run times now stop at a 30-minute idle gap instead of counting days.
- Every helper command takes `--help`, and an unknown option says where to look.
- `merge` starts a task record when there is none, takes its review inline (`--reviewed-head`, `--reviewer`, `--review-notes`), ignores the agent host's own untracked files (`.claude/worktrees/`, `settings.local.json`, `launch.json`), refuses while another task record has uncertain work, and says which worktree owns a task record started elsewhere.
- Dogfood no longer reads `claude-proactive` as automatic in the desktop app, which logs typed slash commands that way. Build, Finish and the router say to load Verify, Review and the routed skill.

## [0.10.0] - 2026-11-01

### Changed

- Explore can run a blind bake-off. You rank unlabelled drafts of one brief (a wordmark, a page, copy, one prompt across models) in a gallery page before seeing who made which or reading a sealed second opinion. Then the reveal shows each entry's time, cost and failures.

## [0.9.1] - 2026-11-01

### Changed

- When nobody may be watching (a background agent, a side session, a scheduled run), an agent sends its question to whoever started it or ends with it, instead of waiting on a prompt nobody sees.
- A single read-only helper gets its brief in the prompt; the shared brief file is for two or more workers.
- Explore points wide digging at the splitting guide, so it can run helper agents in parallel.

## [0.9.0] - 2026-11-01

### Changed

- Agents ask at the moments that matter, before acting: doing more or less than asked, an unsettled design or naming choice, going off an approved plan or skipping a check, new spend or access, and anything irreversible or public. They use the question tool, recommendation first. They stop asking about upkeep the settings cover, such as merging when `merge = "when-green"`, which had become one of the most common questions. Final reports now say what was decided without asking and what was skipped.
- Plan records each open question with a recommended answer and the step it blocks, so Build asks it before that step instead of deciding quietly.
- New guidance for splitting independent work across agents: one shared brief file, each writing agent in its own worktree with its own task record, the main agent on a separate piece, every agent's claimed PR, merge and main-branch run checked on GitHub before reporting, and the reviewer agent before risky merges.
- `solo.ts` accepts `--repo` and `--task` after the command name too (`start "goal" --task x`). Arguments after `--` in `run` are never read as these options.

## [0.8.3] - 2026-10-30

### Changed

- Explore gives effort as agent time (minutes or sessions) and your own time (reviews, approvals, waiting on CI) separately, never as developer-days, and names its basis: a measured run of similar work, or "a guess". Its estimates were out by about 50 to 100 times on 30 Oct: "half a day" for work that took under five minutes in one session.

## [0.8.2] - 2026-10-30

### Changed

- When a push is refused, `solo.ts push` now shows the last lines of Git's output, including what a failing pre-push hook printed, with tokens and private paths redacted. Before, it kept only Git's own "failed to push some refs" line.
- Build, Setup and the helpers reference say `protected_paths` are never edited by hand, but the repo's own generator may rewrite them when its instructions say to.

## [0.8.1] - 2026-10-30

### Changed

- Dogfood no longer points installed users at a usage receiver that only exists in Solo's source repo; it uses a Claude Code usage export only when there is one.
- The Codex setup reference no longer says every agent profile is read-only.
- Build links to Setup for a new repo's settings and to Finish for the task record and verified merge instead of restating their rules. Setup now holds the new-repo settings rule.
- The Codex agent profiles' closing note fits every role: any limit on what the agent may change is an instruction, not a sandbox.

## [0.8.0] - 2026-10-30

### Changed

- Claude Code gets a merge guard hook. In a repo with `solo-workflow.toml`, it asks you before Claude runs `gh pr merge` or a `gh api` merge call directly, since that skips the helper's reviewed-head, CI and merge-policy checks. It does nothing in other repos, needs only `sh`, and is declared only in the Claude Code manifest.
- Each skill except Setup shows an argument hint in Claude Code's `/` menu, such as `/solo-workflow:review [PR number, branch or base..head]`.
- The README lists every component with its Claude Code command, the deep-review workflow and the hook.
- Verify no longer claims "is this ready to ship?", which belongs to Review. The router's description lists its steps in the order it runs them.

## [0.7.3] - 2026-10-29

### Changed

- Dogfood can use the local Claude Code usage file, when it exists, to confirm which skills loaded in a session and whether each was started by name, picked automatically or loaded by another skill. The transcript stays the main source.

## [0.7.2] - 2026-10-27

### Changed

- The README now says the source repository runs CI on Linux x64, after the move off the retired ARM64 runner pool.

## [0.7.1] - 2026-10-27

### Changed

- Refresh the packaged README to match settings precedence, profile installation and host fallbacks. Clarify that source merges, GitHub Releases and installed cache updates are separate outcomes; describe helper networking and worker permissions without claiming host isolation or unverified platform coverage.

## [0.7.0] - 2026-10-27

### Changed

- Deep review costs what the change needs. The `review-change` workflow groups changed files into areas (runtime, prompts and rules, UI, config and CI, high-risk code) with one reviewer each, instead of one per file; tests go with their code, and docs-only files are skipped and listed. Area reviewers run on Sonnet; shell scripts, auth, money, deletion and migrations get Opus. Every reviewer traces what its files produce into the existing features that consume it, and one Opus reviewer reads across areas for where they meet. Each blocker or major finding gets its own Opus refuter, while minor findings share one refuter. The run stays under the host's agent guideline (9 by default), merging areas instead of dropping files, and the report ends with a Cost section: agents by model, output tokens when available, and what was merged or skipped. Two PRs in another repo had taken 46 Opus agents and 4.9M tokens.

## [0.6.1] - 2026-10-27

### Changed

- Deep review's `review-change` workflow works where the plugin's agents aren't loaded, such as a cloud session that cloned the plugin. `agent()` threw "not found" for `solo-workflow:reviewer`, and every file came back unreviewed. A missing role now runs as a general-purpose agent with that role's own instructions (the body of `agents/reviewer.md` or `agents/refuter.md`, kept equal by a test), and the run says so once.

## [0.6.0] - 2026-10-26

### Changed

- Finish delivers through the repo's own merge workflow when the repo's instructions name one (a label a workflow merges on, a merge queue), in place of `solo.ts merge`, keeping the same review, checks and permission, and confirms the merged head is the one it reviewed. One repo merges by an `automerge` label, and Finish had no way to know.
- Verify follows the repo's instructions for reaching previews behind host sign-in and for its test account, and counts an allowance for paid runs that the repo states. It never asks for a preview access secret or password in chat; with no documented way in, the check is blocked.

## [0.5.0] - 2026-10-23

### Changed

- `solo.ts push`: pushes HEAD to the branch's upstream by that branch's name, never forces, refuses the base branch, and says pushed only once the remote tip reads back as HEAD. A worktree can't check out a branch another checkout holds, so its branch is named differently from the remote one and a bare `git push` is refused there; one such refusal was lost in hook output and a PR was merged without its review fixes. Build and Finish now push with the helper and merge only through `solo.ts merge`, which refuses a PR whose head isn't the local HEAD.
- Plan: a repo with no plans folder gets `docs/plans/` instead of a question.

## [0.4.1] - 2026-10-23

### Changed

- The helper reads PRs, checks and merged PRs, and merges, through GitHub's REST API instead of `gh pr`, which needs GraphQL. `checks`, `gate`, `merge` and `delete-merged` now work in Claude Code on the web, where GraphQL is refused. Merges still go only at the checked head.

## [0.4.0] - 2026-10-23

### Changed

- Reads only `solo-workflow.toml` and `solo-workflow.local.toml`, and task records only under `solo-workflow/`. Sidecut Workflows and Ship Properly are retired and every repo has moved over, so their settings names, task records and migration notes are gone.

## [0.3.0] - 2026-10-23

### Changed

- Dogfood: a new skill for logging how a plugin did in real work. It records a finished session (which skills ran, whether each was named or picked automatically, what helped, what was skipped) as a single-arm record that `qa-check` marks attribution-inconclusive. It also covers setting up a with/without-plugin comparison. Verify now covers only whether things work.
- Run records gain a `session` kind, a per-skill `skills` list with versions, and a `mixed` invocation. `qa-check` requires the run's invocation to match its skills.

## [0.2.1] - 2026-10-22

### Changed

- Review: re-reviews after fixes check the fix commits and that each finding is closed, instead of redoing the whole review, when the branch wasn't rebased or merged with main since the review. Otherwise, and after a deep review, the whole change is reviewed again.
- Plan: a plan saved before its repo existed moves into that repo once it does.
- Build: a task that creates a repo writes its `solo-workflow.toml` in the first PR.

## [0.2.0] - 2026-10-22

### Changed

- Rebuilt to replace Sidecut Workflows: a router plus nine task skills (Explore, Plan, Build, Investigate, Review, Verify, Finish, Setup, Improve Workflow), specialist agents, and Bun helpers for settings, Git state, task recovery, CI checks, merging and cleanup. Reads existing `sidecut-workflows.toml` and `ship-properly.toml` settings.
