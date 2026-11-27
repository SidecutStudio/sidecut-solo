---
type: regex
target: last_message
pattern: '^(?=[\s\S]*\b(setup|set up|configure)\b)(?=[\s\S]*\b(branch|main)\b)(?=[\s\S]*\b(checks?|tests?)\b)(?=[\s\S]*\bmerg\w*\b)(?=[\s\S]*\breview\b)(?=[\s\S]*\bworktrees?\b)(?=[\s\S]*\b(voice|writing)\b)(?=[\s\S]*\b(integrations?|tracker|task board|CI)\b)(?=[\s\S]*\b(skip|defaults?)\b)'
flags: i
---
