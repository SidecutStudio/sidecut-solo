---
tags: [trigger]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Is this safe to merge? It is the whole diff:

```diff
-  if (user.plan === "pro") return limit * 2;
+  if (user.plan == "pro") return limit * 2;
```
