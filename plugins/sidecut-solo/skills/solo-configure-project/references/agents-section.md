# Maintain repository instruction wiring

Read this when adding or refreshing the Solo section in project instructions.

Replace only the existing solo-workflow marker block. Preserve every other instruction.

If AGENTS.md does not exist, create it containing the block.

Ensure CLAUDE.md imports AGENTS.md through its @AGENTS.md line.

Create a missing CLAUDE.md with only that line, or add it above existing content without replacing anything.

If both names refer to the same file through a symlink, write once and avoid a self-import.

Show the proposed instruction change in the configuration comparison table.

Use this exact marker block:

```markdown
<!-- solo-workflow:start -->
## Sidecut Solo

Follow `solo-workflow.toml`. Use the relevant Solo skill, or `solo` to route the request.
<!-- solo-workflow:end -->
```
