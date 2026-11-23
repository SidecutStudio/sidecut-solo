# Install project Codex profiles

Read this when the user requests project-specific independent Codex roles.

Run solo codex-agents to inspect installed and missing profiles.

Run solo codex-agents --install only when installation is requested.

The helper copies missing profiles into this project's .codex/agents directory and never overwrites existing files.

Show differences for existing modified profiles and let the user decide whether to update them.

Never edit global Codex configuration or ~/.codex for this operation.

Profiles are solo_reviewer, solo_refuter, solo_investigator and solo_verifier.

Use matching bundled role instructions for native subagents when project profiles are unavailable.

Check current host documentation before claiming a plugin or host cannot register a role or enforce permissions.

A role's prose instructions alone do not create a sandbox boundary.
