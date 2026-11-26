# Helper probes

Free, offline regression tests for Sidecut Solo's helper and merge guard, from the dogfood records. Each test is one probe of one build, in a throwaway git repo with a local bare remote and a scripted `gh`: no model, no network, no real GitHub. A full run takes a few seconds.

- `probe.sh`: runs one probe on the plugin folder in `SOLO_PLUGIN` (default: this repo's `plugins/sidecut-solo`) and prints `exit=<status>`, the output, then what the remote holds. Its header lists every probe.
- `helper.yaml`: every finding a probe can show, as a definition for the maintainer's eval runner (`evalbench`) with `before` and `after` command variants.
- `fake-gh.mjs`: the scripted `gh` that `probe.sh` and the helper tests' `fakeGh()` put first on `PATH`.

`npm test` runs every probe on this checkout through `tests/helpers/probes.test.ts`, so CI does too: a `fixed` test must pass, and an `open` one must still fail until its fix lands.

## Compare two builds

Point `before` and `after` at two plugin folders and run from this folder with `--no-cache` (the cache keys on the prompt and command, not on the plugin's files):

```sh
SOLO_BEFORE=<0.37.0>/plugins/sidecut-solo SOLO_AFTER=<0.39.0>/plugins/sidecut-solo \
  evalbench run --config helper.yaml --no-cache
```

An installed or copied plugin folder works too: it needs `server/data/helper/solo.mjs` and `hooks/`. `--filter-metadata status=open` runs only the open work.

## Add a probe from a finding

1. Add a probe kind to `probe.sh` if none fits, and list it in the header.
2. Add a test to `helper.yaml` under its session date, with `metadata` `session`, `finding` (the run record's finding id), `status` and `kind`, asserting what the fix must make true. Use `contains`, `icontains`, `regex` and their `not-` forms, which `probes.test.ts` knows.
3. Add one `control` beside it that passes today, so a probe that breaks for another reason shows.
4. When the fix lands, set `status: fixed`.
