// studies/swim-37/harness/durability/README.md
//
// **Scope:** continuation-chain durability integration tests.
//
// Cross-surface coverage for the audit-lane fixes (#427/#428/#429 + persist-trio
// f26a86535f). Unit tests assert each write-site in isolation; these scenarios
// assert the _boundary_ between dispatch and persist where the bugs lived
// (import shadowing, drain return discard, dispatched-count guard).
//
// **Substrate:**
// - Real `dispatchToolDelegates` from `src/auto-reply/continuation/delegate-dispatch.ts`
// throughout — including S2's empty-queue case, which exercises the
// `toolDelegates.length === 0 → return { dispatched: 0, ..., chainState }`
// path directly (no stub needed).
// - Faked `spawnSubagentDirect` returning deterministic `{status:"accepted"}` so
// chain advancement is observable without spinning real subagent runs.
// - TaskFlow registry mocks track `flow.status` mutation so
// `consumePendingDelegates` filters correctly across hops (see fixture
// docstring for the failure mode if `finishFlow` is stubbed as no-op).
// - Tmpdir session-store file (`os.tmpdir() + crypto.randomUUID()`) per test;
// real `updateSessionStore`/`updateSessionStoreEntry` writes; real
// `loadSessionStore` reads.
//
// **Vitest config:** `test/vitest/vitest.continuation-durability.config.ts`
// (registered in root `vitest.config.ts`'s `rootVitestProjects`). Runs separate
// from swim-37 trap-class scaffolds so pre-merge gating is independent.
//
// **Scenarios:**
// S1 — Two-hop chain across subagent boundary (r3164380565 cross-surface)
// S2 — Followup-only token chain (r3164418106 contract harness)
// S3 — Durable persist across restart (r3164418100 + persist-trio)
//
// ## S2 scope clarification (🩸 catch on bef8963d79)
//
// S2 is a **contract harness** for the persist primitive
// (`updateSessionStore` + `persistContinuationChainState`), not a full
// integration test of the production followup-runner callsite. The fix
// site at `src/auto-reply/reply/followup-runner.ts:485` only mutates
// `tailEntry` in memory; the followup path itself contains zero
// `updateSessionStore`/`saveSessionStore` calls. The only durable writer
// the followup flow invokes is `persistRunSessionUsage` →
// `updateSessionStoreEntry` (`session-usage.ts:110`), which patches only
// usage fields (`inputTokens`/`outputTokens`/`cacheRead`/`cacheWrite`/
// `totalTokens`/`updatedAt`/etc) and does **not** include
// `continuationChain*` in its patch.
//
// Whether r3164418106's in-memory mutation reaches disk via the followup
// path alone depends on a downstream writer that flushes the
// `tailEntry`-shaped `sessionStore` snapshot — which this code-walk did
// not surface. **Open finding:** there may be a residual followup-runner
// disk-durability gap that r3164418106 did not close.
//
// What S2 does prove:
// - Real `dispatchToolDelegates` returns `dispatched: 0` with chainState
// carrying advanced `accumulatedChainTokens` (the value r3164418106
// fixed the guard to persist).
// - When the audit-fix-shape callsite is invoked
// (`updateSessionStore` + `persistContinuationChainState`), tokens
// reach disk and survive a fresh `loadSessionStore` read.
// - The original `if (dispatched > 0)` guard, simulated explicitly,
// leaves tokens stale on disk.
//
// What S2 does NOT prove:
// - That the actual followup-runner callsite at line 485 results in
// `continuationChainTokens` reaching disk through the followup-path
// code alone.
//
// Tracking the open finding via INTEGRATION-TEST-GAP-MAP.md follow-up
// (see "Open after merge" section).
//
// ## Negative-coverage gaps (🩸 catch — INTEGRATION-TEST-GAP-MAP.md)
//
// The gap map's "no spurious `updatedAt` churn when tokens unchanged"
// item is **not covered** by the current S1/S2/S3 scenarios. Reason:
// `persistContinuationChainState` itself only assigns to
// `continuationChainCount/StartedAt/Tokens` and does not touch
// `updatedAt`; the question of `updatedAt` churn lives at the
// `mergeSessionEntry` / `updateSessionStoreEntry` layer, outside the
// audit-lane fix scope. The gap map should be updated to either:
// (a) drop the item (out of scope for the audit-lane integration set), or
// (b) move it to a separate session-store-merge integration scenario.
//
// **Reference:** see `INTEGRATION-TEST-GAP-MAP.md` at repo root for full design.
