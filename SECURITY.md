# Security

<!-- sidecut:start house-style -->

## Reporting a vulnerability

Report it privately to Sidecut Studio through a GitHub security advisory on SidecutStudio/sidecut-solo, or through [sidecut.dev](https://sidecut.dev). Don't open a public issue or pull request for it. Include what you found, how to reproduce it and the plugin version.

<!-- sidecut:end house-style -->

## What the plugin runs

Sidecut Solo is mostly instructions for an agent. The parts that run on your machine are:

- **Node helper:** The bundled helper, server/data/helper/solo.mjs, runs on Node.js 24 or later through its launcher. It needs no dependency installation. It uses Git and authenticated GitHub CLI with your existing permissions. Its run command executes the requested command and records the result. The codex-agents --install command copies profiles into the project's .codex/agents/.
- **`gh`:** used for PR checks and merges, only when a skill asks for them.
- **Merge guard hook:** `plugins/sidecut-solo/hooks/pre-tool-use-merge-guard.mjs`, a Node.js script that Claude Code and Codex run before each shell command. In a repo with `solo-workflow.toml` it refuses `gh pr merge --admin` and never asks you; it never runs the command itself. Required checks are enforced by GitHub's ruleset or branch protection, not by the hook. It guards against mistakes and is not a security boundary.
