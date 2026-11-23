# Match reality

Read this when docs and instructions may have drifted from the code.

## Run the deterministic check

Run `solo docs-check`, adding `--one-sentence-per-line` when the project keeps one sentence per line. It reports backticked paths that don't exist, relative links and `#anchors` that don't resolve, `run <script>` commands missing from `package.json`, and retired Solo names, each with its file and line. Fix each one, or say why it stays.

A path can exist and still be the wrong one, such as `tests/capture.test.ts` in a section about `actor/`, so read each path in its context.

## Check what a script can't

Read AGENTS.md, CLAUDE.md, README and docs against the code, one claim at a time:

- Status claims such as "X is future work", "not built yet" or "planned". Search the code and recent merged PRs, and rewrite the claim to what is true now.
- Lists that claim to be complete, such as connectors, API routes, settings, callbacks or commands. Compare each against its source in the code and add what's missing or remove what's gone.
- Facts copied from the repository or service that owns them, such as runner names, versions, limits or another repo's settings. Replace them with a link to the owner.
- The same fact stated in two places. Keep it where it belongs and point to it from the other.

Cite the code, commit or PR behind each change, and leave a claim alone when the evidence is unclear.

## Audit instruction files

In Claude Code, `/doctor prompt-audit` also checks instruction files for outdated wording, missing files or commands, and contradictions. Use it as a second reading of AGENTS.md and CLAUDE.md.

[Audit your instruction files](https://code.claude.com/docs/en/memory#audit-your-instruction-files)
