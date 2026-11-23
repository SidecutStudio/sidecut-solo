I wouldn't merge this yet. It's the first container in the lab that has network access and mounts lab data, so under AGENTS.md it loosens the isolation boundary. That means it needs a test and a note in the PR saying what was loosened and why, and the change has neither. Beyond that, there's one real race condition and a few hardening gaps.

I couldn't run `bun run check` because Bash was denied in this session, so this review comes from reading the code only.

## Blocking

**1. It loosens the boundary without saying so** (`scripts/lib/deps.ts:29-56`)
- The role containers are `network_mode: none`, and `guard.ts:31` fails any container that has a network. `deps` runs on Docker's default bridge network with full internet access and mounts the target folder writable. For `sources/…`, that's a writable mount of the reference, which every role container only gets read-only.
- For `build/…`, the input comes from the builder, which is supposed to be confined and offline. The builder writes `package.json` and `package-lock.json`, and this command then fetches whatever they name. It could list the original reference package from npm, a git URL or a tarball URL as a dependency and receive the real code. That defeats the clean-room setup, even though the builder never touches the network itself.
- The `.npmrc` check doesn't cover this. Lockfile `resolved` URLs and `git+https:`/`https:` specifiers in `package.json` point npm at any host without an `.npmrc`. The comment's idea that "an .npmrc can point npm at another registry" only covers one of several routes.
- **Fix:** add tests and the PR note. Also do at least one of these: require a reviewed flag (like `promote --reviewed`), or reject non-registry specifiers and lockfile `resolved` hosts other than `registry.npmjs.org`.

**2. A race lets a running builder redirect the mount** (`deps.ts:18-22` → `docker run`)
- The symlink check and `realpathSync` run first, and Docker resolves the bind-mount path later. If the lab is running, the builder can replace a folder under `build/` with a relative symlink such as `../../sources` in between. Docker follows it on the host and mounts `sources/` writable into a networked container.
- **Fix:** refuse while the lab is running, the same way `promote` does with `running: await isRunning(lab)`. Once no role can write, the check holds.

## Should fix

3. **A timeout doesn't stop the container.** `docker()` SIGKILLs the docker CLI process, not the container, so a timed-out install keeps running with network access. Because of the fixed `--name ${lab.project}-deps`, every later run then fails with a name conflict. Run `docker rm -f <name>` when it times out.
4. **It may pull the image from Docker Hub.** Compose sets `pull_policy: never`, but `docker run` will try to pull if the local image is missing. Add `--pull never`.
5. **The limits don't match the role containers:**
   - No `--pids-limit` or `--memory`.
   - `--tmpfs /tmp:rw,size=4g` drops `nosuid,nodev`, which compose sets.
   - The network is implicit. Pass `--network bridge` so it's visible and so the boundary check has something to review.
6. **The uid/gid can become `"undefined"`.** `${process.getuid?.()}` produces `"undefined:undefined"` if the call isn't available. `compose()` uses `?? ''`; do the same here or fail outright.

## Minor

- The comment at `deps.ts:25` says "read it, then remove it", but the code only refuses. Reword it so it matches what happens.
- Log names can collide: `sources/a-b` and `sources/a/b` both write `deps-sources-a-b.log`.
- The usage header at `lab.ts:6-7` doesn't list `deps`.
- If the folder doesn't exist, `realpathSync` throws a raw ENOENT instead of a readable message.

The path checks themselves are sound: they reject absolute paths, `..`, symlinks along the path, and anything whose real path leaves `sources/` or `build/`. Keeping the log under `reports/` is also right, since no container mounts that folder.