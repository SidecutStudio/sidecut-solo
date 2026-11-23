# Design review report

Read this when writing checked findings for the user and an implementation handoff.

Omit empty sections. Use plain language in the user's report and put measurements and code locations in the handoff.

## Owner report

1. Give the overall impression in one or two sentences.
2. Group findings by usability, layout, consistency, words and accessibility where relevant.
3. For each finding, state what people notice, why it matters, severity and the recommended fix.
4. Describe hierarchy, reading order and phone scrolling with familiar comparisons.
5. Name strengths to preserve and worries checked and ruled out.
6. List each already-known item with its status: fixed, still open or not reached, and say why for the last two.
7. Separate unchecked limitations from confirmed findings.
8. Finish with priority fixes and any open Critical finding.

Avoid token names, file paths and numeric contrast ratios in the user's explanation. Say too faint to read comfortably when that describes the measured result.

## Implementation handoff

Record URL, commit, account or fixture, widths, themes, the known-items list, the cold look and the challenge method. Mark each finding as found by the reviewer or by the cold look.

For every retained finding, provide its component and file line, current behavior or measurement and target behavior. Prefer existing design tokens and components.

Include affected hover, focus, touch, empty, loading and error states. Specify an observable completion check for every fix.

When sharing a functional verification walk, put its pass, fail, blocked and not-run results before this report. An untried journey is not checked and fine.
