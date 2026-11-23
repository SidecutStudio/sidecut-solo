# Premise checks

Read this when a recommendation depends on an assumption that could defeat it.

## Steps

1. State the weakest necessary premise. Choose the cheapest observation that could make it false.
2. Check the relevant evidence rather than assuming the project already supports the idea.
3. Mark an unaffordable or unavailable check unverified. Make it the recommended experiment's first action.

| Premise | Smallest useful check |
| --- | --- |
| Existing code supports the feature | Follow the complete code path and find a working caller |
| A provider supports the operation | Read current official documentation and make one authorized scratch call |
| Required data exists | Run a read-only query and inspect counts and representative values |
| People need the feature | Inspect existing analytics or support evidence, or propose a small manual trial |
| A library fits | Check documentation and issues for the project's version, then a temporary spike |
| The operation is allowed | Check ownership, account permission and plan limits |
| The operation is cheap | Measure one unit and calculate the expected total |

Keep measured facts separate from estimates. A recommendation must not turn its untested premise into a fact.
