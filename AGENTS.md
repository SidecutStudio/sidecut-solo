# sidecut-solo

Sidecut Solo is an engineering workflow plugin for AI coding agents. Preserve its product contract, host parity and repository integrations.

## Commands

| Command | Does |
| --- | --- |
| `npm run fix` | Format files and apply safe lint fixes. |
| `npm run test` | Run helper, package, evidence and release tests. |
| `npm run types` | Check TypeScript types. |
| `npm run package` | Build the local installable archive without publishing. |
| `npm run check` | Run formatting, types, style, tests, package and generated-output checks. |
| `npm run build` | Build the MCP server, dashboard and role profiles. |
| `npm run style` | Check the Sidecut plugin standard. |
| `npm run eval` | Run behavioural evals with Claude Code (explicit, may use model credits). |

## Layout

```text
.github/workflows/
plugins/sidecut-solo/
  agents/
  codex/
  hooks/
  server/
  skills/
scripts/
evals/
tests/
docs/specification.md
dogfood/            scrubbed example records; the full history is in the private sidecut-solo-dogfood repo
```

## Rules

<!-- sidecut:start house-style -->
- Run `npm run build` after changing anything in a plugin's `server/src/` or `agents/`, and commit what it writes.
- Any change under `plugins/` bumps the version in both manifests and `package.json` and adds a CHANGELOG entry.
- Blocks marked `sidecut:start` and the files sidecut-agentskills owns come from its templates. Change them there, then run `npm exec --no -- sidecut-sync` here; list a deliberate difference under `sidecut.keep` in `package.json` with the reason.
- A bundled registered connector uses `.app.json` and the Codex manifest's `apps` field; any direct MCP fallback uses the same declaration name and stays remote. Verify the connector id and endpoint from its registration.
<!-- sidecut:end house-style -->

- Read `docs/specification.md` and the affected skill before changing behavior. The full contract ships in the plugin's `server/data/specification.md`.
- Use Node.js 24 and npm; preserve the pinned tools. Keep `package-lock.json` as the only package lockfile.
- Keep runtime source under `plugins/sidecut-solo/server/src/`. The installed helper launcher is `server/data/helper/solo` and has no runtime dependencies.
- Resolve installed files from the loaded plugin root. Keep MCP operations read-only, with fixed argument arrays and existing tool outputs.
- When renaming a skill, add the old name to `SOLO_SKILL_ALIASES` in `server/src/helper/lib/usage.ts`; when renaming the plugin, its repository or the helper path, add the old one to `server/src/helper/lib/names.ts`. `solo retired-names` then reports them in every project.
- Keep skill procedures in their owning folders. Name other skills instead of linking across their supporting files.
- Change specialist instructions in `plugins/sidecut-solo/agents/`, then regenerate packaged and project Codex profiles. Never hand-edit protected generated TOML.
- Rebuild bundles, notices, dashboard output and profiles after changing their sources. Commit generated output with its source change.
- Add release notes to the root CHANGELOG and run `npm exec --no -- sidecut-version <version>` to generate the package and host versions. Keep the copied README and LICENSE aligned for installed-content changes.
- Preserve all required checks in `solo-workflow.toml`. Every check must pass on the exact reviewed current PR head before merging.
- Use solo-finish-change for delivery. Missing, skipped, cancelled, queued or failed checks never count as success.
- Preserve unrelated work, unique commits and files. Remove only task-created resources whose content is proven preserved.
- Reuse current-task permission. After `check` and `secrets` pass on main, Release publishes the manifest version if it has no release yet, so a merge of a version bump has publication effect `automatic`. You give standing permission for that release with merge permission here: pass `--publication-authorized`.
- Confirm requested merges, tags, releases, archives, checksums, deployments and installed updates separately before claiming completion.
- Keep the cloud-only dependency bootstrap. It is a repository integration rather than an installed plugin file.
- CI runs `check` and `secrets` on GitHub-hosted Linux, and `gate` is the required check. Keep actions and downloaded tools pinned.
- Keep usage logging, the local dashboard and helper refusal reporting available.
- Never store prompts, commands, secret values or account credentials in usage logs. Check the receiver's allowlist before changing recorded fields.
- Historical dogfood and session records live in the private `SidecutStudio/sidecut-solo-dogfood` repo; keep them unchanged there. `dogfood/` here holds only scrubbed examples with placeholder names. Save new records only when requested, in the private repo, and distinguish observations from attribution.
- Keep personal overrides in ignored `solo-workflow.local.toml`. Never write global host configuration through project setup.
- Install Claude plugins through account-synced marketplaces or user scope. Do not enable repository plugin overrides.
- Keep current guidance here and product facts in the specification. Replace stale text rather than adding status ledgers or migration archives.
- Use Sidecut Studio attribution and `https://sidecut.dev`. After publication, reconcile the shared marketplace bundle as described in `RELEASING.md`.

<!-- solo-workflow:start -->
## Sidecut Solo

Follow `solo-workflow.toml`. Use the relevant Solo skill, or `solo` to route the request.
<!-- solo-workflow:end -->
