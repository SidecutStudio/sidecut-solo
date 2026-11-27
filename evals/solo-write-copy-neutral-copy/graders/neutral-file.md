---
type: regex
target: { source: file, path: README.md }
pattern: 'SidecutStudio|Sidecut[ -]CI|Pair[ -]Board|\bLinear\b'
flags: i
match: not_contains
---
