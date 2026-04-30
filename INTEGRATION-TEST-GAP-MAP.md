# Integration test gap map — continuation durability surfaces

**Author:** Elliott 🌻
**Base:** `cael/325-canonical2 @ dc572c01062a8da9a337039c87c1eb09288af640`
**Date:** 2026-04-29
**Status:** DRAFT for cohort review (pre-squash)
**Prior art:** `studies/swim-37/harness/` (in-process span recorder; vitest project `vitest.swim-37.config.ts`)

## What landed in canonical2 since `v2026.4.24`

The audit-lane PRs (#427/#428/#429) plus the persist-trio (`f26a86535f`) cover four chain-state-persistence write-sites. Each has unit-level regression coverage. **What's missing is cross-surface coverage: the path a single chain takes through multiple write-sites in one chain-life.**

| Write-site | File | Unit test | Cross-surface gap |
|---|---|---|---|
| Agent-runner durable write-back | `src/auto-reply/reply/agent-runner.ts` (~L2876–2925, L1269) | `agent-runner-*.test.ts` (49) | YES — never exercised end-to-end with subagent emission |
| Followup-runner token persist | `src/auto-reply/reply/followup-runner.ts:477` | `followup-runner.test.ts` (32) | YES — `dispatched==0` token-only branch never seen by a real chain |
| Subagent-announce child-drain persist | `src/agents/subagent-announce.ts:232` | `subagent-announce.continuation-drain.test.ts` (6) | YES — never followed by next-hop dispatch reading the persisted state |
| Continuation `state.persistContinuationChainState` | `src/auto-reply/continuation/state.ts` | `state.test.ts` | OK at unit level; gap is in *who calls it when* |

## Three integration scenarios proposed

### S1 — Two-hop chain across subagent boundary (`r3164380565` cross-surface)

**Shape:** parent emits `continue_delegate(silent-wake)` → child spawns → child emits its own `continue_delegate` → child settles → parent's drain observes child chain state advanced by 1, persists it, then dispatches next hop reading the persisted `currentChainCount`.

**Asserts:**
- After child settle, on-disk session entry for child has `continuationChainCount` advanced.
- After parent drain, parent's next dispatch sees `currentChainCount = 2` (not 0 or 1).
- `maxChainLength` enforcement counts both hops.

**Why this matters:** unit test for #429 only asserts in-memory + store-write; never proves *the next reader observes the new value*. This is the exact bug shape: stale reload after persist gap.

### S2 — Followup-only token chain (`r3164418106` cross-surface)

**Shape:** agent-runner produces a single turn that emits `continue_work` (no delegates) consuming N tokens; followup-runner triggers; `dispatchToolDelegates` returns `dispatched=0, chainState={accumulatedChainTokens: N}`; next followup turn must see the accumulated tokens.

**Asserts:**
- After `dispatched==0` followup, on-disk `continuationChainTokens` reflects N (when persisted via the audit-fix callsite shape).
- Subsequent turn's `costCapTokens` enforcement uses the accumulated value, not 0.
- ~~No spurious `updatedAt` churn when tokens unchanged (negative case).~~ — **Out of scope for the audit-lane fix.** `persistContinuationChainState` does not touch `updatedAt`; that field is owned by the `mergeSessionEntry` / `updateSessionStoreEntry` layer. Move to a separate session-store-merge integration scenario if needed.

**Why this matters:** #428 unit test covers the persist call; the integration question is whether the cost-cap reader actually sees the tokens after a delayed/deferred-only chain.

**Open finding (🩸 catch on bef8963d79):** the production followup-runner callsite at `src/auto-reply/reply/followup-runner.ts:485` only mutates `tailEntry` in memory. The followup-path code itself contains zero `updateSessionStore`/`saveSessionStore` calls; the only durable writer it invokes is `persistRunSessionUsage` → `updateSessionStoreEntry` (`session-usage.ts:110`), which patches only usage fields and does not include `continuationChain*`. Whether r3164418106's in-memory mutation reaches disk via the followup path alone depends on a downstream writer that flushes the `tailEntry`-shaped store snapshot — which this code-walk did not surface. **S2 is therefore positioned as a contract harness for the persist primitive**, not a full integration test of the production callsite. The followup-path disk-durability question stays open as a follow-up after #430 lands.

### S3 — Durable persist across simulated gateway restart (`r3164418100` + persist-trio)

**Shape:** chain runs N hops; mid-chain, simulate restart by `loadSessionStore()` from disk into a fresh in-memory state; resume; assert next hop continues from persisted counters not from 0.

**Asserts:**
- All four write-sites (`f26a86535f` trio + #429 child-drain) survive a `JSON.parse(JSON.stringify(loadSessionStore()))` round-trip.
- Chain count + tokens + startedAt all preserved.
- `taskFlowDelegates` queue replay (post #423 TaskFlow-only migration) re-hydrates pending hops.

**Why this matters:** the whole audit family is *about* gateway-restart survival. We have no test that actually round-trips the session-store file. Persist-trio could pass unit tests and still fail on real restart if `updateSessionStore` writes to wrong key, wrong shape, or never flushes.

## Harness placement

**Reuse `studies/swim-37/harness/`:**
- In-process recorder via `setContinuationTracer` (existing pattern in `in-memory-span-recorder.ts`).
- Add `studies/swim-37/harness/durability/` subfolder for S1–S3.
- New vitest config tag (e.g., `vitest.continuation-durability.config.ts`) so these run separately from swim-37 trap-class scaffolds.

**Why not full e2e (`scripts/e2e/`)?**
- Docker-tier overhead unjustified for this scope; assertions are about in-process state persistence + reload, not network/container behavior.
- Faster CI signal (target: <10s per scenario).

**Substrate needs:**
- Tmp-dir session store (real disk write, not mock) — use `os.tmpdir() + crypto.randomUUID()` per test.
- Real `dispatchToolDelegates` (not mocked) but with fake `spawn` implementation that returns deterministic `accepted` results.
- Real `updateSessionStore` against tmp-dir file.

## Out of scope for this pass

- Cross-host chain (Pi/ACP runtime) — separate concern; covered by `cael-chain-tests` when those land.
- Compaction-triggered post-compaction lich — already covered by `delegate-dispatch-post-compaction.test.ts` + `post-compaction-release.test.ts`.
- Multi-agent fan-out (`continue_delegate` × N in one turn) — orthogonal to durability; covered by existing `delegate-dispatch.test.ts` chain budget tests.

## Estimate

- S1: ~150 lines test + ~50 lines harness helper. ~2h.
- S2: ~80 lines test + reuse S1 harness. ~1h.
- S3: ~120 lines test + tmp-dir restart helper (~40 lines). ~2h.

Total: 5h, single-PR, base-agnostic (#427/#428/#429 already merged into `dc572c01`).

## Open questions for cohort

1. **Squash gate?** Should integration tests block squash, or land as a follow-up PR after squash → upstream artifact?
2. **Harness location?** `studies/swim-37/harness/durability/` (sibling to existing trap-class tests) vs `studies/continuation-durability/` (new top-level study)?
3. **Real `dispatchToolDelegates`?** Or is a high-fidelity mock sufficient (faster CI, less coupling to dispatch internals)?

🌻 standing by for cohort feedback before kicking off live.
