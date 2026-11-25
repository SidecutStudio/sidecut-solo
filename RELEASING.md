# Releasing Solo

1. Add the dated version entry in the root CHANGELOG. Run `npm exec --no -- sidecut-version <version>` to update the npm package, lockfile, Claude Code, Codex and Antigravity manifests, and installed changelog.
2. Run `npm ci`, `npm run build` and `npm run check`. Inspect the local package and commit the generated files with their sources.
3. Merge through Sidecut Solo after the required `check` and `secrets` jobs pass. The Release workflow calls the pinned Agentskills publisher, which picks its runner from the repo's visibility: a public repo always gets GitHub-hosted Linux. Confirm the source tag, ZIP and SHA-256 in GitHub. If a draft was left behind, rerun Release on the latest checked main commit.
4. Maintainers only: in a fresh branch of Sidecut Studio's shared marketplace, run `bun scripts/reconcile.ts update sidecut-solo`, run its checks, and merge its PR. Verify the marketplace pin and the version loaded by the host separately.
