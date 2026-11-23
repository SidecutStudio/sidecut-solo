# Maintain project settings

## Request

Keep the repository's check command, merge rules and worktree policy accurate.

## What the agent does

Read the current repository and compare saved settings against manifests, CI, branch policy and settled user choices.

Find the complete representative TOML in server/data/examples/solo-workflow.toml within the plugin.

Update only facts and choices that the current repository supports. Preserve comments and unrelated values.

Leave uncertain check names unset until actual PR evidence establishes them.

## Result

The committed settings and instruction edits match observed repository behavior.

Personal overrides remain ignored and local. Validation reports the exact files read and each command's result.
