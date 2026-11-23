# Contributing

Bug reports, fixes and ideas are welcome. For anything bigger than a small fix, open an issue first so we can agree on the shape before you build it.

## Set up

Use Node.js 24 and npm:

```bash
npm ci
```

```bash
npm run check
```

`npm run check` is what CI runs: formatting, types, tests, the package check and the generated-output checks. Everything else, including the repo layout and its rules, is in [AGENTS.md](../AGENTS.md). Agents and people follow the same file.

## Make a change

- Read `plugins/sidecut-solo/server/data/specification.md` and the skill you're changing first. Skills keep their own procedures in their own folders.
- After editing `plugins/sidecut-solo/server/src/` or `plugins/sidecut-solo/agents/`, run `npm run build` and commit what it writes.
- A change under `plugins/` needs a version bump and a CHANGELOG entry: add the entry to the root `CHANGELOG.md`, then run `npm exec --no -- sidecut-version <version>`.
- `tests/portability.test.ts` fails if a file names a private repo, a personal path or someone's email. Use `example-org/example-app` and `me@example.com` style placeholders.
- `npm run eval` runs behavioural evals through Claude Code and can spend model credits, so it isn't part of the check. Run it when you change when a skill should trigger.

## Pull requests

Keep one change per pull request and say what it changes for someone using Solo. The `gate` check must pass. A maintainer reviews it and squash-merges it, and the version bump releases it.

## Security

Report vulnerabilities privately, as [SECURITY.md](../SECURITY.md) describes, not in an issue.
