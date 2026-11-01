# Review: Exact Local Session Route Proof

**Verdict: MAJOR findings; do not approve as a fail-closed local-route proof.**

## Named refs

| category | ref | full SHA | local/tracking/server equality |
|---|---|---|---|
| product/base | karmaterminal/openclaw #1509 PR head; PR base `main` | head `d65f66c740f655edb9563d694c1de28697eab08b`; base `5d6e5aa36376de50619a674791a953455cd95f0b` | head verified by `gh api`; local HEAD, lane branch, origin lane, and PR head equal |
| lane | `codeagent/review-openclaw-1509` | `d65f66c740f655edb9563d694c1de28697eab08b` | local and `origin/codeagent/review-openclaw-1509` equal before review commit; unchanged product head published |
| CI/workflow | N/A - focused-only lane | N/A | N/A |
| presentation | N/A | N/A | N/A |
| docs/proof | N/A | N/A | N/A |

## Findings

| severity | path:line | concrete failing scenario | confidence |
|---|---|---|---|
| MAJOR | `src/plugins/local-session-route.ts:90` | A plugin calls `resolveLocalSessionRoute("agent:main:subagent:child")` while that subagent is thread-bound to an external channel. The spawn with `thread: true` deliberately omits session-row `delivery` in `src/agents/subagents/spawn/subagent-spawn-child-plan.ts:260-265`, while `bindThreadForSubagentSpawn` separately binds `targetKind: "subagent"` to the external conversation in `src/agents/subagents/spawn/subagent-spawn-thread-binding.ts:13-44`. The persisted session row can therefore have `sessionId` and `lifecycleRevision` with no legacy route fields; `hasOffHostRoute` falls through to `false` and `onHost` becomes `true`. Wrong outcome: an external/thread-routed subagent is presented as host-local. | 0.96 |

## Per-property review

### Subagent sessions

- Exact key: `resolvePluginLocalSessionRoute` trims and canonicalizes the input, derives the agent store, and performs exact lookup in `src/plugins/local-session-route.ts:64-83`.
- Host-positive claim: `onHost` requires both `lifecycleRevision` and `!hasOffHostRoute(...)` in `src/plugins/local-session-route.ts:84-93`.
- **Finding:** thread-bound subagents are missing from this row-only route check. Their canonical external route owner is the conversation-binding service, and thread setup is reached after child-plan creation in `src/agents/subagents/spawn/subagent-spawn.ts:282-306`. The persisted target is `targetKind: "subagent"` in `src/agents/subagents/spawn/subagent-spawn-thread-binding.ts:35-44`, and the matrix restart test proves this binding persists outside plugin instance state in `src/plugins/conversation-binding.core-caller.matrix.test.ts:167-185`.

### Cron sessions

- Fail closed: every key whose rest is not an exact `subagent:*` prefix is treated off-host in `src/plugins/local-session-route.ts:22-52`; cron keys are explicitly covered in `src/plugins/local-session-route.test.ts:126-135`.
- **No finding** for cron locality: no positive `onHost` path exists for `agent:*:cron:*`.

### Hook sessions

- Fail closed: hook keys are not subagent keys and therefore return `onHost: false` in `src/plugins/local-session-route.ts:22-52`; the sibling test covers hook keys in `src/plugins/local-session-route.test.ts:126-135`.
- **No finding** for hook locality: no positive `onHost` path exists for `agent:*:hook:*`.

### Main sessions

- The exact canonical main key is an explicit off-host route in `hasOffHostRoute` at `src/plugins/local-session-route.ts:24-29`.
- The unit tests cover `agent:main:main` and global presence in `src/plugins/local-session-route.test.ts:48-68`.
- **No finding** for main-session positive locality.

### Unknown/absent sessions

- Empty keys, `"unknown"`, unreadable rows, missing session IDs, and read exceptions return `exists: false`, `onHost: false`, and null identity fields in `src/plugins/local-session-route.ts:59-105`.
- **No finding**: this path fails closed.

### Lifecycle reset/delete replay

- Normal reset of the live session service creates a fresh `randomUUID()` lifecycle revision in `src/gateway/session-reset-service.ts:829-830`.
- Reset/delete remove or replace the exact persisted row; the route reader always reloads the exact row rather than caching it in `src/plugins/local-session-route.ts:64-83`.
- The focused unit contract explicitly rereads a reset child and requires the replacement identity in `src/plugins/local-session-route.test.ts:88-104`.
- The worker test rechecks `before`/`after` lifecycle identities through the real session SQLite worker in `src/plugins/local-session-route.worker.test.ts:24-60`.
- **No finding** for normal reset/delete replay in the live session-reset service.

### Cross-session identity and key aliases

- The reader passes the normalized exact key to the worker; it does not scan/fold a session store in `src/plugins/local-session-route.ts:64-83`.
- The unit tests cover opaque peer/case-distinct key identity in `src/plugins/local-session-route.test.ts:117-124`.
- The API uses exact persisted lookup and no routing/sending side effect.
- **No finding** for alias or key-prefix cross-session selection, subject to the thread-binding finding above.

### Forgery and replay

- The API accepts only a session key; it does not accept caller-supplied `sessionId` or `lifecycleRevision` values.
- Both identity fields are returned from the persisted row only at `src/plugins/local-session-route.ts:56-57,84-102`.
- Retired plugin owners and config-publication drift return absent results in `src/plugins/api-lifecycle.ts:29-75` and `src/plugins/api-facades.ts:47-65`.
- **No finding** for caller forgery or stale config replay.

## Canonical structured review

Command:

`/home/figs/flesh_beast_best_beast/source/openclaw/.agents/skills/autoreview/scripts/autoreview --mode branch --base 5d6e5aa36376de50619a674791a953455cd95f0b --prompt <adversarial PR 1509 prompt>`

Result: exited 1 with 1 P2 finding. The finding was verified against the thread-binding implementation and is accepted above.

## CI receipt

Mode: focused-only.

- `umask 0022 && node scripts/run-vitest.mjs run --config test/vitest/vitest.plugins.config.ts --maxWorkers=1 src/plugins/local-session-route.test.ts src/plugins/api-lifecycle.test.ts src/plugins/api-facades.lazy-route.test.ts`
- Result: startup failed before test collection; `@openclaw/proc-safe/windows-job` could not be resolved from the shared `/home/figs/flesh_beast_best_beast/source/openclaw/node_modules/.vite-temp` config path. 0 tests executed.
- `umask 0022 && OPENCLAW_VITEST_DATABASE_WORKER_WATCH_OWNER=test/vitest/vitest.plugins.config.ts OPENCLAW_VITEST_DATABASE_WORKER_WATCH_TESTS='["src/plugins/local-session-route.worker.test.ts"]' node scripts/run-vitest.mjs run --config test/vitest/vitest.database-worker-watch.config.ts --maxWorkers=1 src/plugins/local-session-route.worker.test.ts`
- Result: startup failed before test collection for the same missing `@openclaw/proc-safe/windows-job` dependency. 0 tests executed.

This is a dependency/worktree infrastructure blocker, not a test verdict: the worktree's `node_modules` link points to the shared source clone and the required package is absent there. Per the read-only workorder, no dependency reconciliation or live-runtime edit was performed.
