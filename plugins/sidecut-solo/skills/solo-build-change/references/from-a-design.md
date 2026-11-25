# Build from a design

Read this when the requested change starts from a screenshot, mockup, artifact, captured design system or Figma frame.

Inspect the supplied design and note missing sizes, states and themes.

Read artifact source for exact values and copy. When a connected design tool holds the captured design system, read its tokens from there.

Access Figma through connected tools. If unavailable, request a screenshot.

Read the product's design rules, tokens, component library and nearest comparable screen.

Map every visible piece to an existing component, token or layout before building.

Use the product token when the reference value nearly matches it.

Add new tokens or components only through the product's established process.

Fill missing phone, dark, empty, error and long-content states from the nearest established screen.

Ask about unresolved design decisions the user would care about.

Build in working slices. Compare rendered screenshots at the reference sizes and themes.

Use screenshot differences when the reference is a screenshot at the same dimensions.

Use `solo-test-behavior` to exercise controls at affected widths. Use `solo-review-design` to compare the rendered layout, themes, contrast and touch targets.

Use solo-review-design before delivery.

Report intentional differences and their reasons, including product tokens and states the reference omitted.
