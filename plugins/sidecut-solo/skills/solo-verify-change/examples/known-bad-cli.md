# Detect a known CLI failure

## Request

Verify that the fixture adds two numbers and returns the expected result.

## What the agent does

Run the executable fixture from server/data/examples using its saved scenario.

The implementation subtracts instead of adding, so the expected sum check fails.

Keep the raw capture, scenario and run together, then run solo qa-check against the scenario and run records.

## Result

The report names the failed arithmetic check, its expected sum and its observed difference.

A valid failing run proves the scenario detects the defect. It does not claim the fixture works.

Find fixture.ts, fixture.scenario.json, fixture.run.json and fixture.capture.json in server/data/examples.
