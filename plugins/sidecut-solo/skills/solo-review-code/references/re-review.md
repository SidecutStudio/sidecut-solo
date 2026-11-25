# Review a changed head

Read this when fixes, a rebase or a target-branch merge change the head.

Every new head needs its own review.

Use a scoped review only when the original review covered a committed head and was not a deep-level or multi-agent review.

Require the reviewed commit to remain an ancestor of the new head, and require the merge base with the target to remain unchanged.

Confirm ancestry with git merge-base --is-ancestor REVIEWED NEW.

When all conditions hold, inspect git diff REVIEWED..NEW.

Check finding closure, nearby behavior and new risks introduced by fixes.

Give an independent reviewer the old head, new head and prior findings so it checks closure. Pick the level as the after-fixes rules in [review-levels.md](review-levels.md) describe.

Otherwise review the full change against its current base.

After a rebase, use git range-diff as supporting evidence, then examine conflict resolutions and behavior against the new base.

Return to full review when fixes rewrite much of the change or touch previously uncovered code.

After fixes to a deep-level or multi-agent review, require another review at that depth or a full review before reporting ready.
