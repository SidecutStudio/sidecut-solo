# Sidecut Solo

Hand your coding agent a whole change and get back a reviewed, merged pull request that followed your repo's rules.

## What it does

Say "fix signup and get it merged" and it finds the cause, makes the fix, gets it reviewed and merges it once the checks pass, stopping only when a decision is yours. It works across Claude Code, Codex and Gemini/Antigravity.

The hard part isn't writing the code. It's everything an agent tends to skip after that: calling a queued check a pass, merging a commit nobody reviewed, losing uncommitted work while cleaning up, or saying "shipped" when only the merge happened. Solo moves those steps out of the agent's judgment and into a helper that checks them:

- **Merges only what was reviewed.** The helper merges a pull request at the exact commit that was reviewed, and only once every required check passed on that commit. A missing, skipped, queued or cancelled check is never a pass.
- **A second pair of eyes, sized to the risk.** A typo gets a careful pass from the agent itself. An ordinary fix goes to an independent reviewer agent that reads the exact diff cold, and the agent then checks the reviewer's claims against the code. Sign-in, payments, CI or hooks get a deep review, and a refuter agent challenges any surprising serious finding before you see it.
- **Work survives the session.** Each task keeps a record of what's been pushed and merged, so the next session resumes from what's really on disk and on GitHub instead of what an old message claimed.
- **Nothing lost in cleanup.** Branches and worktrees are deleted only once the helper proves their commits are already in the target branch.
- **Your rules, per repo.** One small settings file per project says when the agent may merge and which checks and files it must respect.

The `solo` skill routes each request to the right step, or you can name one:

| Skill | Does |
| --- | --- |
| `solo` | Coordinates project work through the appropriate Solo skills. |
| `solo-build-change` | Implements a requested change and checks its behavior. |
| `solo-choose-approach` | Compares workable approaches for a grounded recommendation. |
| `solo-compare-plugin` | Compares plugin sessions and controlled runs from recorded evidence. |
| `solo-configure-project` | Maintains Solo settings and repository instruction wiring. |
| `solo-diagnose-problem` | Investigates a failure or performance problem using evidence. |
| `solo-finish-change` | Completes checks, delivery and cleanup under repository rules. |
| `solo-list-work` | Shows unfinished work and what could be lost. |
| `solo-maintain-context` | Maintains repo-owned context packs and evidence-backed coding standards and review guidance. |
| `solo-plan-change` | Turns a settled change into ordered steps with checks. |
| `solo-prevent-mistake` | Removes the cause of a recurring project mistake. |
| `solo-research-topic` | Finds outside facts with current sources. |
| `solo-review-change` | Reviews a change for demonstrated defects and delivery risks. |
| `solo-review-design` | Reviews rendered screens for concrete design improvements. |
| `solo-show-usage` | Shows which skills, tools and agents ran, what they cost and whether usage is still being recorded. |
| `solo-verify-change` | Exercises real user behavior and reports observed results. |
| `solo-write-copy` | Writes words people read so they're specific, sound like their author and carry no AI-writing tells. |

## Install

You need Git, Node.js 24 or newer, and, to deliver through GitHub, the GitHub CLI (`gh`) signed in.

In Claude Code, add this repo's marketplace, then install the plugin:

```text
/plugin marketplace add SidecutStudio/sidecut-solo
/plugin install sidecut-solo@sidecut-solo
```

In Codex, run:

```bash
codex plugin marketplace add SidecutStudio/sidecut-solo
codex plugin add sidecut-solo@sidecut-solo
```

In Antigravity, from a clone of this repo:

```bash
agy plugin install ./plugins/sidecut-solo
```

Install it at user level rather than in a repository's own settings, so every worktree uses the same current copy.

## Use

Open a project and ask in plain words:

- "Set up Solo for this repo."
- "Fix signup and get it merged."
- "Why is checkout slow? Find the cause before changing anything."
- "Review this change and test whether saved settings survive a refresh."
- "What's unfinished here, and is anything at risk of being lost?"

## Settings

Ask Solo to set up a project and it writes `solo-workflow.toml` at the repo root from what it finds in your manifests, CI and branch protection. It asks only about policy it can't observe. A typical file:

```toml
base_branch = "main"
merge = "ask"                    # ask | when-green | never
required_checks = ["test", "lint"]
worktrees = "when-overlapping"   # always | when-overlapping | never
review = "auto"                  # auto | deep | light
protected_paths = ["dist/"]

[checks]
test = "npm test"
lint = "npm run lint"
```

`merge = "ask"` is the default: the agent prepares everything and waits for your yes. `when-green` lets it merge on its own once the required checks pass on the reviewed commit. Personal overrides go in `solo-workflow.local.toml`, which stays out of Git. The file name comes from the plugin's earlier name and stays as it is so existing projects keep working.

To teach the agent your codebase, ask `solo-maintain-context` to scaffold context packs and review guidance from your history. A `VOICE.md` at the root sets the voice for anything people read. To change Solo itself, fork this repo, edit the skills under `plugins/sidecut-solo/skills/`, and add your fork as the marketplace instead.

## Privacy

Solo is mostly instructions. The parts that execute are:

- **The helper**, `server/data/helper/solo`: a small shell launcher that runs the bundled Node.js file (`solo.mjs`) with no dependencies to install. It reads Git and GitHub with your existing sign-in and does the pushes, merges and deletions the skills ask for, after its own checks.
- **A read-only MCP server** with views of settings, work state, PR checks, merged branches, user-facing changes and usage.
- **Two hooks.** A merge guard refuses `gh pr merge --admin` in projects that have Solo settings; it guards against mistakes and isn't a security boundary. The other writes the skill log below.

Codex runs hooks only after you trust them.

Nothing is sent anywhere. These records stay in files on your machine:

| Record | File | Holds | Turn off |
| --- | --- | --- | --- |
| Skill log, on by default | `~/.sidecut/skill-log.jsonl` | Time, plugin, skill and host for each Solo skill run | `SIDECUT_SKILL_LOG=0` or `DO_NOT_TRACK=1`; off in CI |
| Helper refusals | `~/.local/state/solo-workflow/helper.jsonl` | Time, Solo version, command name and a short reason with arguments, names and paths removed | `SOLO_HELPER_LOG=off`, or set it to another path |
| Usage receiver, off unless you start it | `~/.local/state/claude-usage/usage.jsonl` | Allowlisted Claude Code and Codex telemetry fields | Don't run it |

`tests/skill-log.test.ts` fails if the skill log ever stores an argument, output or path. Ask "show my Solo usage" and the `solo-show-usage` skill summarizes these files. Its helper command, `sh <plugin folder>/server/data/helper/solo usage --share`, prints one line of version and run counts for you to paste wherever you like.

The optional receiver adds a local dashboard of what ran and what it cost. Run it from a checkout of this repo:

```bash
node scripts/usage.ts serve
```

Then point Claude Code's telemetry at it in your own `~/.claude/settings.json` and start a new session:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:4318",
    "OTEL_LOG_TOOL_DETAILS": "1"
  }
}
```

For Codex, add this to your own `~/.codex/config.toml`:

```toml
[otel]
exporter = { otlp-http = { endpoint = "http://127.0.0.1:4318/v1/logs", protocol = "json" } }
```

The dashboard is at `http://127.0.0.1:4318/`. The receiver keeps event names, session IDs, the repository's name, skill, plugin, marketplace, tool, MCP server and agent names and versions, models, effort, durations, outcomes and error types, token counts and Claude Code's cost. It drops prompts, commands, tool inputs and outputs, emails and account IDs on arrival, before anything is written. `CLAUDE_USAGE_PORT` changes its port from `4318`. Codex reports tokens but no cost, so cost covers Claude Code only. If the receiver isn't running, sessions carry on without recording.

## Develop

The commands and repo rules are in [AGENTS.md](https://github.com/SidecutStudio/sidecut-solo/blob/main/AGENTS.md). [CONTRIBUTING.md](https://github.com/SidecutStudio/sidecut-solo/blob/main/.github/CONTRIBUTING.md) covers pull requests, and [SECURITY.md](https://github.com/SidecutStudio/sidecut-solo/blob/main/SECURITY.md) covers reporting a vulnerability. The full product contract ships with the plugin in [`server/data/specification.md`](https://github.com/SidecutStudio/sidecut-solo/blob/main/plugins/sidecut-solo/server/data/specification.md).

## License

MIT. See [LICENSE](LICENSE).
