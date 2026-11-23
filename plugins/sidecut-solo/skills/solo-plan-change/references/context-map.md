# Map the affected context

Keep a short, read-only map in the existing plan or task record.

1. Start with the nearest repository instructions and the relevant acceptance criteria. Find the normal entry point and one comparable implementation.
2. Trace direct callers and downstream consumers. Check public exports, shared types, schemas, routes, migrations or settings where they form part of the contract.
3. Name the tests or user journeys that cover these paths. Mark unverified consumers and missing coverage, then put risky unknowns early in the plan.
4. Record paths and why they matter. Open additional files when a consumer, failure or requirement calls for them. Keep full logs and unrelated source out of the plan.

A changed public route can affect inbound links, an authentication redirect and the cold-start journey. Trace those paths before deciding what to edit.

[Context Map](https://github.com/github/awesome-copilot/blob/main/skills/context-map/SKILL.md) · [Context Engineering](https://github.com/addyosmani/agent-skills/blob/main/skills/context-engineering/SKILL.md)
