---
name: solo-show-usage
description: "Shows which skills, tools and agents ran, what they cost and whether usage is still being recorded. Use when the user asks about usage, telemetry, cost or which skills and plugins get used. Not for fixing a repeated mistake (use solo-improve-workflow)."
argument-hint: "[days]"
---

# Show usage

Show the user what ran on their machine and what it cost, then explain it in plain words. Everything comes from local logs, and nothing is sent anywhere.

## Steps

1. Run the helper's `solo usage --days <n>`, seven days unless the user names a period. The receiver export covers Claude Code and Codex. For a host with nothing in the export it reads the plugin's own skill log instead, so no run counts twice; that log is on unless `SIDECUT_SKILL_LOG=0`, `DO_NOT_TRACK=1` or CI turns it off. Use `get_usage` only in a host that draws its dashboard; as text, its result is too long to read whole.
2. When Codex shows no export, tell the user the one block that sends it to the receiver, for their own `~/.codex/config.toml`, and that a new Codex session picks it up. Don't edit their config yourself:

   ```toml
   [otel]
   exporter = { otlp-http = { endpoint = "http://127.0.0.1:4318/v1/logs", protocol = "json" } }
   ```

3. Read the report's first line. When it says recording may have stopped, find out why before using the numbers: check the receiver's address, `http://127.0.0.1:4318/` unless `CLAUDE_USAGE_PORT` changes it, and whatever starts the receiver on this machine, such as a background service that points at a folder that has moved. Name the cause and the fix. Restarting a background service needs the user's yes.
4. Show the dashboard where the user already is. While the receiver runs, open its address in the host's browser view: the built-in browser in Claude Code's desktop app, the in-app browser in Codex. Otherwise save `solo usage --html <file>` outside the repository and open that file there. A terminal with no browser view gets the address or path.
5. Keep usage off hosted pages and shared links unless the user asks. It names repositories and costs.
6. Explain it in a few short lines: sessions, hours and estimated cost per host, tokens by model, the skills and plugins used most, the ones that never started, how they started (asked for or picked up by the agent), refusals and any gap in recording.
7. Name the one thing most worth acting on, such as a skill that never starts, one the user always has to ask for, or one that costs far more than the rest.
8. When the user wants to share how they use Solo, give them `solo usage --share`'s one line to paste where they choose. It holds the version, the period and runs per skill. Never send or post it yourself.
9. Answer follow-ups from the same report. Run it again only for a different period.

## Rules

Read only: don't change settings, logs, the receiver or host configuration. Call cost an estimate. Cost comes from Claude Code only; Codex sends tokens, so never price its tokens yourself. The logs hold no prompts or commands, so the answer can't include them.

## Done when

The user has seen the dashboard or the saved page, and the answer gives the period, the totals, what stands out and whether recording works.
