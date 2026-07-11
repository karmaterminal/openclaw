# WORKORDER — #1108 continuation tool callback wiring

## 1. Mission

Fix `karmaterminal/openclaw#1108` on the current assembly base. A real Discord/main runner logs:

```text
continuation.enabled=true but neither continueWorkOpts nor requestCompactionOpts were supplied — only continue_delegate will register
```

The required contract is that an enabled live runner exposes all three continuation tools with real callbacks: `continue_work`, `continue_delegate`, and `request_compaction`. An inventory/catalog-only path may expose the full surface only through the honest stub path (`buildInventoryContinuationToolOpts`), but must not silently masquerade as a live runner.

## 2. Scope and branch contract

- Worktree: `/tmp/silas-issue-1108`
- Branch: `silas/issue-1108-continuation-tool-callbacks-20260711`
- Base and PR target: `scribe/20260709/1172-status-row-assembly` at the worktree's fetched head.
- Tracker: <https://github.com/karmaterminal/openclaw/issues/1108>
- Do not fold/rebase upstream drift or touch the separate #1172 status-row/CI repair surface.

## 3. First investigation

1. Wait for / use the GitNexus index in this worktree. Query the callback/tool-construction flow before guessing.
2. Trace the real flow from runner parameters/tool names/effective tools into `createOpenClawTools`, including all `continueWorkOpts`, `requestCompactionOpts`, and inventory-stub call sites.
3. Inspect the historic stale candidate only as source evidence if useful; do not merge or replay it blindly.
4. Distinguish live runner behavior from catalog/inventory/dispatch construction by bytes, not warning suppression.

## 4. Implementation rules

- Repair the actual missing callback propagation for the live path, or apply `buildInventoryContinuationToolOpts` only where the path is genuinely inventory/catalog-only.
- Do not weaken/suppress the warning.
- Preserve existing continuation semantics and maintenance-disable distinctions.
- Make the smallest coherent patch and add a focused regression that proves the full enabled live surface and/or the honest inventory surface.

## 5. Required checks

Run the narrow relevant tests and `git diff --check`. Include the exact commands/results in the journal/final summary. If feasible, run the closest full config/shard after focused coverage.

## 6. Deliverables

- Commit(s) on the branch.
- A PR **into** `scribe/20260709/1172-status-row-assembly` referencing `Fixes #1108` only after direct review confirms the diff is scoped.
- Report: GitNexus route findings, root cause, changed files, tests, PR URL, and any unresolved risk.

## 7. Boundaries

- Do not push to `openclaw/openclaw` upstream.
- Do not touch gateway configs/services or #1172's active assembly repair.
- Stop and report if the existing assembly base moves materially before creating the PR.
