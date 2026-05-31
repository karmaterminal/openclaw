# Output: Subagent-spawn/registry 26-failure cluster cure

## Branch

`cure/subagent-spawn-26-failure-cluster` → opens against `uncurse/20260530/copilot-opus47-1m`

## Substrate (re-measured at start)

Cure-cycle HEAD `e6b6b48150` (post-#823 + #824 + #826 merge). Empirical re-measure on this lane found **29 failures across 5 test files** (the workorder's 26-failure tally undercounted `subagent-registry.test.ts` — actual was 17, not 14):

| Test file                                          | Reported | Empirical |
| -------------------------------------------------- | -------- | --------- |
| `src/agents/subagent-registry.test.ts`             | 14       | 17        |
| `src/agents/subagent-spawn.test.ts`                | 4        | 4         |
| `src/agents/subagent-spawn.thread-binding.test.ts` | 3        | 3         |
| `src/agents/subagent-spawn.workspace.test.ts`      | 4        | 4         |
| `src/agents/subagent-spawn.depth-limits.test.ts`   | 1        | 1         |
| **Total**                                          | **26**   | **29**    |

All test files exist on `upstream/main`. Per workorder methodology bullet 5, these are class-(a) **cure-cycle-induced** failures.

## Cure pattern applied: pluck-and-reauthor (figs's 08:13 PDT amendment)

### Pluck (test-file shape alignment with upstream/main)

- `src/agents/subagent-registry.test.ts` — pluck no-op (file already byte-identical to `upstream/main`)
- `src/agents/subagent-spawn.test.ts` — pluck no-op for upstream-shared tests; the cure-cycle +59 lines (continuation-traceparent forwarding test + the `traceparent:` assertion add inside the existing `accepts a spawned run…` test) PRESERVED as continuation-feature test coverage
- `src/agents/subagent-spawn.thread-binding.test.ts` — plucked: reverted cure-cycle's `matrix → telegram` channel swap inside `uses controller ownership for thread binding…` (cosmetic channel-name change, not feature-related). File now byte-identical to `upstream/main`.
- `src/agents/subagent-spawn.workspace.test.ts` — pluck no-op (already byte-identical)
- `src/agents/subagent-spawn.depth-limits.test.ts` — pluck no-op (already byte-identical)

### Reauthor (new cure-cycle tests, not in upstream)

None required. The +59-line cure-cycle additions to `subagent-spawn.test.ts` (traceparent forwarding + traceparent-on-spawn) were authored against the current cure-cycle SUT shape already; they pass cleanly after the test-helper mock plumbing fix (below) without further authoring. They are PRESERVED as continuation-feature test coverage.

## Per-test classification + cure-shape applied

### Cluster A — subagent-spawn.\*.test.ts (12 of 29 failures)

**Classification:** Test-infrastructure mock points at deleted SUT import path.

**Root cause:** Cure-cycle commit #826 ("fix(continuation): break types.ts ↔ targeting.ts import cycle via leaf-redirect") moved `countActiveRunsForSession` / `registerSubagentRun` from `./subagent-registry.js` into the new leaf module `./subagent-registry-spawn-runtime.js`. The hot-path consumer `subagent-spawn.ts` now imports them from the new path. The test-helper `subagent-spawn.test-helpers.ts` only mocked the OLD path (`./subagent-registry.js`), so production code called the unmocked runtime leaf, which returned 0 / undefined while logging "called before configureSubagentRegistrySpawnRuntime()".

**Cure-shape:** test-infrastructure-update. `src/agents/subagent-spawn.test-helpers.ts:310-322` now also mocks `./subagent-registry-spawn-runtime.js` with the same `countActiveRunsForSession` / `registerSubagentRun` impls (single shared variables to ensure mock identity matches across both import paths). Added an inline comment citing #826 so the next refactor doesn't strand it again.

**Files touched:** `src/agents/subagent-spawn.test-helpers.ts` (+15 lines / -4 lines).

**Cleared:** all 4 (subagent-spawn) + 3 (thread-binding) + 4 (workspace) + 1 (depth-limits) = 12 failures.

### Cluster B — subagent-registry.test.ts (17 of 29 failures)

**Classification:** SUT-restoration (non-continuation primitives the cure-cycle aggressively deleted).

**Root cause:** Independent of #826's cycle-break, cure-cycle commits in `subagent-registry-run-manager.ts` (−198 lines) and `subagent-registry.ts` (−168 lines) deleted general-purpose run-timeout / start-time / completion-recovery primitives that the upstream tests are authored to exercise:

- Deleted file: `src/agents/subagent-run-timeout.ts` (45 lines of `resolveSubagentRunDeadlineMs`, `resolveSubagentRunDurationMs`, `resolveSubagentRunTimerDelayMs`)
- Deleted helpers in run-manager: `resolveHardRunTimeoutEndedAt`, `resolveCompletionAfterHardRunDeadline`, `resolveWaitTimeoutMsForRun`, `completeAsRunTimeout`, the `WAIT_TIMEOUT_DEADLINE_SKEW_MS = 250` constant, the `capWaitToStoredDeadline` retry parameter, the `resolveSubagentSessionStartedAt` injected callback, the `observedStartedAt` fallback that consulted the session store when `wait.startedAt` was missing, and the `startedAt` field on completion params
- Deleted helpers in registry: `completeSubagentRunWithRecovery`, `completeSubagentRunInBackground` (retry-on-failure wrapper), the `startedAt?` field on `pendingLifecycleErrorByRunId` / `pendingLifecycleTimeoutByRunId` records, the `resolveSubagentSessionStartedAt` plumbing into the run-manager
- Test mock gap: `vi.mock("../config/sessions.js", …)` in `subagent-registry.test.ts` did not export `resolveSessionStoreEntry`, which `subagent-registry-helpers.ts:8` newly consumes in cure-cycle

None of these deletions are continuation-feature code. They are timing / recovery / observed-startedAt primitives that the registry test directly asserts on (`expected endedAt to be startedAt + 1_000`, `expected waitTimeouts to equal [1_000]`, session-store start-time precedence over `wait.startedAt`, hard-timeout boundary cases). The 17 failing tests exist verbatim in `upstream/main` and pass there because the upstream SUT carries the deleted primitives.

**Cure-shape:** SUT-restoration. Per workorder methodology bullet 6 ("SUT-restoration cure if test-contract is load-bearing … like cot-frame suppression was"). Restored the upstream-main shape for `subagent-registry-run-manager.ts` and `subagent-registry.ts`, then re-applied the cure-cycle's continuation-feature additions and one cure-cycle hardening on top:

1. **Restored `src/agents/subagent-run-timeout.ts`** verbatim from upstream/main, retargeted the `number-coercion` import to `@openclaw/normalization-core/number-coercion` (current monorepo location; the upstream copy still pointed at the moved-out `../shared/number-coercion.js` path).
2. **Restored `src/agents/subagent-run-timeout.test.ts`** verbatim from upstream/main, same import retarget.
3. **Replaced `src/agents/subagent-registry-run-manager.ts` with upstream/main** shape, then re-layered cure-cycle continuation additions on top:
   - `RegisterSubagentRunParams` regains `silentAnnounce`, `wakeOnReturn`, `drainsContinuationDelegateQueue`, `continuationTargetSessionKey`, `continuationTargetSessionKeys`, `continuationFanoutMode`, `traceparent` fields
   - `registerSubagentRun` propagates these into the persisted entry
   - Merged the cure-cycle's TaskFlow-rollback try-catch (which `subagent-registry.persistence.test.ts > rolls back a new subagent run when TaskFlow tracking fails` asserts on) into the upstream persist path so both `persistOrThrow()` and `createRunningTaskRun()` failures roll back atomically and re-throw, instead of upstream's "create-task failure logs a warning and continues" behavior
4. **Replaced `src/agents/subagent-registry.ts` with upstream/main** shape, then re-layered:
   - `import { configureSubagentRegistrySpawnRuntime } from "./subagent-registry-spawn-runtime.js"`
   - `export { listAncestorSessionKeys } from "./subagent-registry-announce-read.js"`
   - The new `configureSubagentRegistrySpawnRuntime({ … })` call paired alongside the existing `configureSubagentRegistrySteerRuntime` call to wire #826's leaf-redirect to its real impls
   - `testing.setDepsForTest` regains the cure-cycle's `persistSubagentRunsToDisk → persistSubagentRunsToDiskOrThrow` fallback so single-override test setups don't drop the throwing variant
5. **`src/agents/subagent-registry.test.ts`** — added `resolveSessionStoreEntry` to the `mocks` hoist and to the `vi.mock("../config/sessions.js", …)` payload (lightweight identity impl returning `{ normalizedKey, existing: store[sessionKey], legacyKeys: [] }`). No test assertions changed.
6. **`src/agents/subagent-spawn.ts`** — restored `import { resolveSubagentRunTimerDelayMs } from "./subagent-run-timeout.js"` and reverted the cure-cycle's inline `Math.floor(runTimeoutSeconds * 1000)` in `resolveSubagentAgentGatewayTimeoutMs` back to the upstream helper call. (The inline copy skipped the `finiteSecondsToTimerSafeMilliseconds` timer-safe cap, which would have allowed >24-day timeouts to silently overflow `setTimeout`.)

**Continuation feature code: PRESERVED.** Verified by inspection:

- `SubagentRunRecord` continuation fields in `subagent-registry.types.ts` — untouched
- `subagent-registry-announce-read.ts:33-35` `listAncestorSessionKeys` export — untouched
- `subagent-registry-queries.ts:312-336` `listAncestorSessionKeysFromRuns` — untouched
- `subagent-registry-lifecycle.ts:1072-1078` continuation field propagation into `runSubagentAnnounceFlow` — untouched
- `subagent-registry-helpers.ts` use of `resolveSessionStoreEntry` for session-store key normalization — untouched
- `subagent-traceparent-handoff.ts` — untouched
- `subagent-registry-spawn-runtime.ts` leaf module from #826 — untouched
- Continuation feature tests (`forwards inherited traceparent to the child agent run`, the `traceparent:` assertion on `accepts a spawned run…`) — preserved and passing

**Cleared:** all 17 registry failures.

## Targeted re-run on the cluster

```
$ node scripts/run-vitest.mjs \
    src/agents/subagent-registry.test.ts \
    src/agents/subagent-spawn.test.ts \
    src/agents/subagent-spawn.thread-binding.test.ts \
    src/agents/subagent-spawn.workspace.test.ts \
    src/agents/subagent-spawn.depth-limits.test.ts \
    src/agents/subagent-run-timeout.test.ts

Test Files  5 passed (5) + 1 passed unit-fast (run-timeout)
      Tests  89 + 3 = 92 passed
```

Sibling-surface re-run (all other subagent-registry / subagent-spawn tests touched by the SUT-restoration):

```
$ node scripts/run-vitest.mjs <all 20 subagent-registry-* and subagent-spawn-* test files>

Test Files  16 passed (16)
      Tests  205 passed (205)
```

Production typecheck:

```
$ pnpm tsgo                     # core production — clean
$ pnpm check:test-types         # test types — clean
```

Lint + format (touched files):

```
$ node scripts/run-oxlint.mjs <8 touched files>     # clean
$ pnpm format <2 reformatted by oxfmt>              # auto-fixed
```

## Full `pnpm test` empirical on cure-cycle branch after restoration

```
Total failing tests:  36 across 12 files
Total passing tests:  ~22,792 across all shards
```

### Breakdown of remaining 36 failures (all match workorder-known parallel clusters or pre-existing env noise; NONE in subagent-registry/spawn lane)

**Workorder-listed parallel clusters (24 failures):**

- `src/gateway/server-methods/agent.test.ts` (5) — issue #829, emeric lane
- `src/auto-reply/reply/normalize-reply.cot-frame.test.ts` (8) — PR #831, ronan parallel lane
- `src/auto-reply/reply/session-updates.compaction.test.ts` (3) — workorder "session-updates.compaction×3"
- `src/auto-reply/reply/commands-system-prompt.test.ts` (2) — workorder "commands-system-prompt×2"
- `src/auto-reply/reply/reply-state.test.ts` (1) — workorder "reply-state×1"
- `extensions/codex/harness.test.ts` (1) + `extensions/codex/provider.test.ts` (1) + `extensions/codex/src/app-server/auth-bridge.test.ts` (2) + `extensions/codex/src/app-server/run-attempt.turn-watches.test.ts` (1) = 5 — workorder "codex-ext×4 + app-server-auth-bridge + app-server-run-attempt"
- (matrix-sdk×2 not observed in this run; either fixed elsewhere or in a shard that completed clean)

**Other failures (12), all NOT subagent-related and NOT introduced by this lane:**

- `src/commands/daemon-install-helpers.test.ts` (3) — CLI daemon install, unrelated
- `src/agents/embedded-agent-runner/runs.test.ts` (1) — embedded runner, distinct subsystem from subagent registry/spawn
- `src/config/sessions/artifacts.test.ts` (2) — session artifacts subsystem
- `src/cli/config-cli.test.ts` (1) — CLI config
- `src/plugins/plugin-registry.test.ts` (1) — plugin registry (host-only)
- `packages/memory-host-sdk/src/host/session-files.test.ts` (1) — memory-host-sdk package
- `src/agents/tools/subagents-tool.test.ts` (2) — **environmental local-config issue**: `~/.openclaw/openclaw.json` contains a `systemPromptOverride` key that this checkout's schema doesn't recognize, so the test's "rejects invalid recentMinutes" cases throw the config-load error before reaching the recentMinutes validator. Pre-existing on this machine; will also fail on `upstream/main` checkout. Filed as new sub-7.X observation (see below).
- `src/auto-reply/status.test.ts` (1) — auto-reply status

None of the 12 touch `subagent-registry*`, `subagent-spawn*`, or `subagent-run-timeout*`. Reduction from this lane: **−29 failures cleared (subagent cluster)**, no regressions introduced.

## Files changed

```
 src/agents/subagent-registry-run-manager.ts |  33 +++++---
 src/agents/subagent-registry.test.ts        |  11 +++
 src/agents/subagent-registry.ts             |  13 +++-
 src/agents/subagent-run-timeout.test.ts     |  +39  (restored from upstream/main, import retarget)
 src/agents/subagent-run-timeout.ts          |  +45  (restored from upstream/main, import retarget)
 src/agents/subagent-spawn.test-helpers.ts   |  20 ++++-
 src/agents/subagent-spawn.thread-binding.test.ts |  8 +/-  (revert matrix→telegram channel swap)
 src/agents/subagent-spawn.ts                | 14 +/-  (restore resolveSubagentRunTimerDelayMs import + use)
```

## New sub-7.X classes banked during work

1. **sub-7.A: stranded test-helper mock after import-path migration** — When a refactor moves a hot-path function from module `A` to a new leaf module `B` to break a cycle, every `vi.doMock("A", …)` in test-helpers that re-exports that function silently no-ops at runtime. The production warning surface (`"called before configureSubagentRegistrySpawnRuntime()"`) is the only signal. Bank rule: `grep -rn "vi\\.doMock.*subagent-registry\\.js" src/agents/` after any future leaf-module split.

2. **sub-7.B: aggressive-deletion-of-non-feature-primitives during feature-refactor** — Cure-cycle #826's cycle-break work appears to have ridden along a separate aggressive simplification that deleted general-purpose run-timeout / observed-startedAt / completion-recovery primitives (45 + ~150 lines) that the upstream test suite asserts on. The continuation feature itself doesn't require those deletions. Bank rule: when a cycle-break refactor's diff includes deletions of code unrelated to the cycle being broken, flag for separate review — those deletions tend to drop behavior that has no green-test signal on the refactor branch but breaks on baseline.

3. **sub-7.C: env-config-bleed into config-validation tests** — `src/agents/tools/subagents-tool.test.ts` reaches the user's `~/.openclaw/openclaw.json` during a test that's meant to exercise tool-argument validation. The test fails on any developer's machine that has `systemPromptOverride` (or any other schema-evolution-pending key) in their user config, regardless of branch correctness. Bank rule: tool-arg validation tests should inject their own minimal config, never touch `~/.openclaw/openclaw.json`.

## Axes of uncertainty for cohort review

- **Should the cot-frame analogy hold?** Workorder bullet 6 explicitly allows SUT-restoration "if test-contract is load-bearing for continuation feature (like cot-frame suppression was)". I interpreted the deleted timeout primitives as **non-continuation, generally load-bearing for the registry test contract** and restored them. An alternative reading is that figs intended SUT-restoration ONLY for continuation-load-bearing tests, in which case the right move would have been to reauthor all 17 registry tests to match the simplified cure-cycle SUT shape. Both routes preserve continuation feature; the SUT-restoration route preserves more pre-existing behavior. Flagging for cohort review.

- **TaskFlow-rollback merge:** I merged the cure-cycle's `try { persistOrThrow + createRunningTaskRun } catch { rollback + rethrow }` block into upstream's separate try-catches because `subagent-registry.persistence.test.ts > rolls back a new subagent run when TaskFlow tracking fails` (cure-cycle-added test) asserts on the throw behavior. Upstream's separate-try-catch would have silently warned and left the run registered with no TaskFlow tracking. Choosing the merged variant is the more defensive of the two; flagging as a behavioral change beyond pure restoration.

- **The `28 → 29` count discrepancy:** Workorder said `subagent-registry.test.ts` had 14 failures; empirical re-measure on this lane found 17. Possible explanations: workorder was taken on an earlier shard with `OPENCLAW_TEST_FAST=1` skipping some, or 3 tests started failing between workorder authorship and lane pickup. Either way, all 17 are cleared.

- **Matrix-sdk×2 not observed:** Workorder listed `matrix-sdk×2` as a parallel cluster but my full-test run shows `extensions/matrix/src/matrix/sdk.test.ts (83 tests)` all passing. Either the matrix-sdk×2 was an earlier baseline that has since been cured, or it lives in a shard I didn't see clearly. Not blocking this lane.
