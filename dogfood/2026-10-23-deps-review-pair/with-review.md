**Verdict: needs fixes before merge.** The command works as a convenience, but it adds the lab's first container with network access, and the checks around it are weaker than its own comment says. AGENTS.md says the isolation rules are the product, and this change loosens them without a test or a note.

This review covers the staged, uncommitted diff on top of `3b45e13`. Once you commit it, that commit needs its own review before merge.

## Findings

**1. Major: the build folder can download anything, including the original product.** (`scripts/lib/deps.ts:29-56`)
The builder container writes `build/`, so the builder controls `build/package.json` and `package-lock.json`. If you then run `lab deps build/...`, npm installs whatever those files list, with network on. That can include the reference's own published package or a git repo of it, and the files land in `build/node_modules`, where the builder can read them. The roles stay offline, but this gives the builder a way to get outside content through you. Nothing is shown to you before the install runs.
**Fix:** before installing, print the dependency list (direct dependencies plus every `resolved` host in the lockfile) and require an explicit `--reviewed` flag, the same pattern `promote` uses.

**2. Major: the `.npmrc` check doesn't stop what its comment says it stops.** (`deps.ts:24-25`)
The comment says the check exists because an `.npmrc` "can point npm at another registry". But the folder can already choose its download hosts in two other ways:
- `resolved` URLs in `package-lock.json`, which `npm ci` fetches as written;
- `https://…tgz` or `github:` specs in `package.json`.

The container runs on Docker's default bridge network, so those fetches can also reach services on your Mac or local network (the verify probe treats `192.168.139.1` as off-limits for the roles).
**Fix:** fold this into the review step from finding 1 or reject non-registry hosts, and consider a dedicated network or egress limits. At minimum, correct the comment so it doesn't promise a protection it lacks.

**3. Major: nothing stops `deps` from running while the lab is up.** (`scripts/lab.ts:72-77`)
`promote` refuses to run while the lab is up (`isRunning`); `deps` doesn't check. A running builder has `build/` mounted read-write, so between the host-side checks (`deps.ts:18-25`) and `docker run` it can:
- plant an `.npmrc`. `--ignore-scripts` on the command line still wins, but `registry=` and other settings don't have a command-line override here;
- swap a folder in the path for a symlink after `realpathSync`, so a different host folder gets mounted into the networked container.

**Fix:** require the lab to be stopped, as `promote` does.

**4. Major: a timeout doesn't stop the install.** (`deps.ts:34`, `deps.ts:55`, `lib/docker.ts:19-22`)
On timeout, `docker()` kills the local `docker` client with SIGKILL. Killing a `docker run` client doesn't stop the container, so npm keeps running with network on and keeps writing into the folder after you've been told it timed out. Because the container name is fixed (`<project>-deps`), the next `deps` run then fails with a name conflict.
**Fix:** on timeout, run `docker --context orbstack kill <name>`. Also add a Compose project label or a unique suffix so `stop` and cleanup can find the container.

**5. Minor issues, grouped:**
- The container has no `--pids-limit` or `--memory`, and its tmpfs is 4 GB without `nosuid,nodev`. The role containers get 256 PIDs, 2 GB, and `nosuid,nodev` (`lab/compose.yaml:11-16`).
- Log names can collide and overwrite each other: `build/a-b` and `build/a/b` both write `reports/deps-build-a-b.log` (`deps.ts:58`).
- A folder that doesn't exist fails with a raw `ENOENT` from `realpathSync` instead of a clear message (`deps.ts:21`).
- The command list in `lab.ts:6-7` doesn't mention `deps`.
- There are no tests. The path checks (absolute paths, `..`, symlinks, `.npmrc`, wrong top-level folder) are easy to cover in `tests/`, as `promote.test.ts` does for `promote`, and AGENTS.md asks for a test with any boundary change.

## What holds up

- Folder names are checked properly: only `sources/` or `build/`, no `..`, no absolute paths, no symlinks anywhere in the path, plus a `realpath` check that the folder stays inside the state folder.
- The container is otherwise locked down: read-only root, `--cap-drop ALL`, `no-new-privileges`, your own UID rather than root, and only the one folder mounted.
- Every Docker call goes through `docker()`, which names the `orbstack` context, and the container name starts with the `example-app-*` project.

## Not covered or not run

- **No checks ran.** Shell commands were denied in this session, so I didn't run `bun run check`, the tests, or a real install. Finding 4 rests on how Docker normally behaves and the code path, not on a reproduction.
- **I didn't confirm whether `--ignore-scripts` also skips `prepare` scripts for git dependencies** in the image's npm version. If it doesn't, packages from git can run code during the install.
- **This was a single review by me, not an independent one.** For a change this close to the isolation boundary, an independent review of the next version would be worthwhile.