# Known-bad addition CLI report

The scenario is cli-addition version 1. The saved run is `fixture.run.json` and raw evidence is `fixture.capture.json`.

The result is fail. `bun fixture.ts 2 3` exited successfully and printed `-1`, while the expected output was `5`.

The fixture deliberately subtracts instead of adding. Its saved run records the fixture SHA-256, Bun version, timestamps and captured output.

A successful process exit does not prove correct arithmetic. Schema validation through `qa-check` does not turn this failed behavior into a pass.

## Reproduce and rerun

Copy `fixture.ts` into an isolated directory and run `bun fixture.ts 2 3`.

To test the correction, change subtraction to addition only in that disposable copy. Capture a fresh hash and output.

Save a new run with the same scenario ID and version. Preserve the known-bad record as the detection example.

## Limitations

The fixture ran directly with Bun on macOS. It exercised no installed plugin, model or browser.

These observations do not establish skill discovery, instruction following or plugin effectiveness.
