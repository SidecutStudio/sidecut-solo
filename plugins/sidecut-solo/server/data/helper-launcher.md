# Helper launcher

Resolve the installed plugin root (`PLUGIN_ROOT`) before running the bundled helper or skill scripts:

- **Claude Code:** use `${CLAUDE_PLUGIN_ROOT}`.
- **Codex and Gemini/Antigravity:** resolve two directories above the loaded skill file (following symlinks when `skills/` is symlinked).

```sh
sh "PLUGIN_ROOT/server/data/helper/solo" COMMAND --repo REPO
```

Below, `solo COMMAND` means that launcher.
