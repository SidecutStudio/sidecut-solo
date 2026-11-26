# Record delivery review

Read this when a review will feed the merge gate.

Provide the full current head SHA, reviewer kind, blocking finding count and concise notes describing scope and results.

Reviewer kind is same-agent, independent or user. Name only independent workers that actually ran against that head.

Notes name the model and effort each independent worker ran on.

Count unresolved blocker and major findings, Critical design findings and any minor findings designated blocking.

Include whether design was reviewed and the reason when it was unavailable.

Save it with `solo review`, which solo-deliver-change's merge reads. Inline arguments or a JSON file outside the repository worktree also work.

JSON fields are head, reviewer, blocking_findings and notes.

A dirty-work review does not cover a later committed head.

Any later change requires another review under the re-review rules.
