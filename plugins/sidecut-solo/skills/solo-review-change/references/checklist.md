# Target likely defects

Read this when choosing review attention for a changed interface, behavior or delivery path.

| Area | Evidence to examine |
| --- | --- |
| Inputs | Empty, huge, malformed, Unicode, negative and zero values; trust boundaries. |
| Errors | Swallowed failures, wrong status, unbounded retries and partial writes. |
| Data | Reversibility, backfills, locks, nulls and rollback loss. |
| Access | Every path's permissions, object ownership and secrets in logs or URLs. |
| State | Races, duplicate actions, cache invalidation and shared mutation. |
| Money | Rounding, currencies, quotas, duplicate charges and idempotency. |
| External APIs | Timeouts, pagination, limits, response changes and credentials. |
| Interfaces | CLI, API, settings and file compatibility with existing users. |
| Tests | Assertions that cannot fail, misleading mocks and weakened checks. |
| Delivery | Skipped gates, version drift and premature publication. |
| Visible behavior | Loading, empty and error states, assets and rendered design coverage. |
| Performance | Measured risk from unbounded work, repeated queries or work on every request. |

Use blocker for data loss, security holes or failure of the change's main promise.

Use major for wrong results or broken paths a real user will encounter.

Use minor for unlikely edge cases or missing protection for a real but smaller risk.

Exclude stylistic preferences from defects.
