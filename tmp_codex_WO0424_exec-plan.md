# WO0424 execution plan

Purpose: convert the investigation into an execution-safe patch plan.

This file is intentionally narrower than `tmp_codex_WO0424.md`:

- only changes I can justify from local code
- explicit file write sets
- explicit test coverage plan
- explicit certainty and non-certainty

The repo is wired tightly enough that I do **not** want to batch unrelated fixes into one patch. The safest shape is three waves, each independently shippable.

## Execution status

Executed on branch `flesh_beast_figs/20260411-fixup`.

Landed in this branch:

- `1.1` bound `continuationGenerations` with live timer tracking
- `1.2` restored structured `continuationTrigger` wake handling in `get-reply-run.ts`
- `1.3` kept `delegatePendingFlags` and finished its success-path cleanup through structured `delegate-return`
- `1.4` added physical timer-handle disposal plus delayed reservation clearing on external input / explicit cancellation
- `1.5` TTL-bounded `request_compaction` guard state
- `2.1` removed duplicate serialized `sessions.json` retention and put the remaining serialized cache on the same expiry clock as the object cache
- `2.2` replaced the full-buffer streaming visible-text rescan with incremental accumulation plus rebuild-on-divergence
- `2.3` partially addressed announce-side repeated store loads with request-scoped memoization inside `runSubagentAnnounceFlow`

Not landed in this branch:

- provider transport / timeout logic changes
- upstream SDK / undici / stream internals
- broader semantic redesign of continuation gating

## Execution guardrails

1. Do not mix continuation-state cleanup and stream-subscriber refactors in the same commit.
2. Do not touch provider transport / timeout logic in the first wave.
3. Do not patch `node_modules` or vendor upstream packages locally as a “fix”.
4. After each wave, run the targeted tests for that wave before widening scope.
5. After the final wave, run `pnpm build`. If this lands on a shared branch, also run `pnpm check`.

## 1. What I can fix in our feature

These are continuation-specific or continuation-owned changes.

### 1.1. Bound `continuationGenerations` correctly

Status:

- defect certainty: high
- certainty this fixes the leak itself: high
- certainty this alone fixes the fleet stalls: low

Problem:

- `src/auto-reply/reply/agent-runner.ts:137-175`
- `continuationGenerations` is a process-wide `Map<string, number>` with no delete path
- it is bumped on ordinary inbound external messages at `src/auto-reply/reply/agent-runner.ts:520-543`
- plain “delete the entry when idle” is **not** safe unless timer lifetime is tracked, because the existing comment about generation reuse is valid

Safe implementation plan:

1. Keep generation-based invalidation semantics.
2. Add explicit volatile timer lifetime tracking, so generation entries are only deleted when no stale callback can still fire.
3. Stop creating a generation entry on plain inbound traffic when the session has no live continuation state.

Exact change set:

- `src/auto-reply/reply/agent-runner.ts`
- `src/agents/subagent-announce.ts`
- optionally a small new helper module if the state logic becomes too noisy, for example:
  - `src/auto-reply/reply/continuation-volatile-state.ts`

Exact code shape:

1. Introduce a per-session volatile timer refcount:
   - `retainContinuationTimerRef(sessionKey)`
   - `releaseContinuationTimerRef(sessionKey)`
   - `hasLiveContinuationTimerRefs(sessionKey)`
2. Introduce a single cleanup gate:
   - `maybeDropContinuationGeneration(sessionKey)`
   - delete the generation entry only when:
     - timer refcount is `0`
     - `delayedContinuationReservationCount(sessionKey) === 0`
3. Change the external inbound path in `src/auto-reply/reply/agent-runner.ts:520-553`:
   - only bump generation when live continuation state exists
   - “live continuation state” means:
     - active timer refs, or
     - delayed reservations
4. Wrap every continuation timer with retain/release:
   - `continue_work` timer at `src/auto-reply/reply/agent-runner.ts:1843-1873`
   - bracket delegate timer at `src/auto-reply/reply/agent-runner.ts:1774-1825`
   - tool delegate timer at `src/auto-reply/reply/agent-runner.ts:2031-2082`
   - chain-hop timer at `src/agents/subagent-announce.ts:644-668`
   - tool chain-hop timer at `src/agents/subagent-announce.ts:762-783`
5. Ensure `releaseContinuationTimerRef` runs in all timer outcomes:
   - successful fire
   - drift-cancel branch
   - explicit clear path

What I will not do in this patch:

- I will not change `generationGuardTolerance` semantics.
- I will not rewrite continuation-chain persisted metadata.

Coverage already present:

- `src/auto-reply/continuation-delegate-store.test.ts`
- `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`
- `src/agents/subagent-announce.continuation.test.ts`
- `src/agents/subagent-announce.chain-guard.test.ts`

Coverage to add:

1. `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`
   - regular inbound turn with continuation enabled but no live continuation state leaves generation absent / zero
   - delayed `continue_work` creates live state, then drops it after timer completes
2. `src/agents/subagent-announce.continuation.test.ts`
   - delayed chain-hop timer releases volatile state on drift cancel
3. if needed, add a narrow helper test file for the volatile state helper only

Execution note:

- if I need a test reset seam, I will add one small test-only reset helper rather than using broad `vi.resetModules()` loops

Targeted verification:

- `pnpm test src/auto-reply/continuation-delegate-store.test.ts`
- `pnpm test src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`
- `pnpm test src/agents/subagent-announce.continuation.test.ts src/agents/subagent-announce.chain-guard.test.ts`

### 1.2. Restore structured continuation-wake handling before touching `delegatePendingFlags`

Status:

- defect certainty: high
- certainty this fixes a real continuation-regression: high
- certainty this alone fixes the fleet stalls: low-medium

Problem:

- `src/auto-reply/get-reply-options.types.ts:53-56` defines the structured
  continuation trigger contract
- `src/infra/heartbeat-runner.ts:965-978` emits `"work-wake"`
- `src/agents/subagent-announce-delivery.ts:301,506` emits `"delegate-return"`
- `src/gateway/server-methods/agent.ts:881` forwards it
- `src/auto-reply/reply/get-reply.ts:355,595` passes `opts` into
  `runPreparedReply`
- but `src/auto-reply/reply/get-reply-run.ts` no longer consumes
  `opts.continuationTrigger`
- and `src/auto-reply/reply/get-reply-run.ts:666` no longer passes
  `isContinuationWake` into `runReplyAgent`
- meanwhile `src/auto-reply/reply/agent-runner.ts:515-518` still expects the
  caller to classify continuation wakes before external-reset logic runs

Why this changes my assessment:

- figs is right that the underlying need was real: the system does need a way to
  distinguish delegate-return turns from ordinary external input
- the current boolean Map was part of the older completion-detect seam, but the
  current architecture already has a better carrier for that signal:
  `continuationTrigger`
- the regression in the current tree is that the structured reader disappeared
- that means the safest “finish the wiring” patch is to restore the structured
  wake consumer, not to invent a new `hasDelegatePending()` gate

Recommended fix:

- restore the structured wake reader in `get-reply-run.ts`
- clear `delegatePendingFlags` when that structured delegate-return is actually
  processed in `get-reply-run.ts`
- do **not** wire `hasDelegatePending()` into `get-reply-run.ts` right now
- do **not** clear the flag early in `subagent-announce.ts` success delivery;
  that would clear it before the completion turn is actually classified

Exact change set:

- `src/auto-reply/reply/get-reply-run.ts`
- `src/auto-reply/reply/agent-runner.ts`
- tests in:
  - `src/auto-reply/reply/get-reply-run.media-only.test.ts`
  - `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`

Exact code shape:

1. In `get-reply-run.ts`, restore:
   - `const continuationTrigger = opts?.continuationTrigger`
   - `const isDelegateWake = continuationTrigger === "delegate-return"`
   - `const isContinuationWake = continuationTrigger === "work-wake" || isDelegateWake`
2. When `isDelegateWake && sessionKey`, call `clearDelegatePending(sessionKey)`.
3. Pass `isContinuationWake` into `runReplyAgent(...)`.
4. Keep the wake contract structured; do not reintroduce system-event-text
   inference or a boolean Map reader.
5. In `agent-runner.ts`, keep using `isContinuationWake` only as a
   pre-classified signal for the external-message reset branch.
6. Do not mix this patch with timer-handle cleanup.

Coverage already present:

- forwarding coverage only:
  - `src/gateway/server-methods/agent.test.ts`
  - `src/agents/subagent-announce.format.e2e.test.ts`
- behavioral coverage for `get-reply-run` / `runReplyAgent` wake classification
  does **not** currently exist

Coverage to add:

1. `src/auto-reply/reply/get-reply-run.media-only.test.ts`
   - `opts.continuationTrigger = "delegate-return"` results in
     `runReplyAgent({ isContinuationWake: true, ... })`
   - `delegate-return` also calls `clearDelegatePending(sessionKey)`
   - `opts.continuationTrigger = "work-wake"` also results in
     `isContinuationWake: true`
   - a normal user turn leaves `isContinuationWake` undefined/false
2. `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`
   - non-heartbeat turn with `isContinuationWake: true` does not run the
     external-message continuation reset branch
   - equivalent non-heartbeat turn without `isContinuationWake` still does
     reset as before

Targeted verification:

- `pnpm test src/auto-reply/reply/get-reply-run.media-only.test.ts`
- `pnpm test src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`

### 1.3. Keep `delegatePendingFlags`, finish its lifecycle cleanup, and defer any semantic redesign

Status:

- defect certainty: high
- certainty this fixes the leak itself: high
- certainty this affects fleet stalls materially: low

Problem:

- `src/auto-reply/reply/agent-runner.ts:139-159`
- `hasDelegatePending()` has no production callers in the current tree
- `setDelegatePending(...)` still writes from:
  - `src/auto-reply/reply/agent-runner.ts:1764-1768`
  - `src/auto-reply/reply/agent-runner.ts:2025-2029`
  - `src/agents/subagent-announce.ts:606`
  - `src/agents/subagent-announce.ts:726`
- the original concept was superseded behaviorally by the structured
  `continuationTrigger` path in commit `61c9a60869`, but the flag still exists
  as local continuation state and figs explicitly prefers keeping it
- today the Map leaks because successful delegate completion is not calling the
  intended clear path in `get-reply-run.ts`
- `clearDelegatePending(...)` bumps continuation generation; that means the flag
  cleanup and generation-leak fix are related but not identical

Recommended fix:

- keep the Map for now
- after 1.2, rely on structured delegate-return handling in `get-reply-run.ts`
  to clear it on successful completion
- keep the existing cancellation/reset clears
- do **not** add a new `hasDelegatePending()` behavioral gate in this incident
  fix; that is a separate design change
- defer any later “remove vs redesign” decision until the hot-path regression
  and timer leaks are fixed

Exact change set:

- `src/auto-reply/reply/agent-runner.ts`
- `src/auto-reply/reply/get-reply-run.ts`
- tests/mocks that currently stub `clearDelegatePending`

Exact edits:

1. Preserve:
   - `delegatePendingFlags`
   - `setDelegatePending`
   - `clearDelegatePending`
   - existing cancellation/reset clear sites
2. Restore the missing successful-completion clear via 1.2:
   - `clearDelegatePending(sessionKey)` on structured delegate-return in
     `get-reply-run.ts`
3. Leave `hasDelegatePending()` unused for now rather than inventing new hot-path
   semantics during the incident fix.
4. Keep `cancelPendingDelegates(sessionKey)` for the actual Task Flow delegate
   queue; that is the real mutable store.
5. Re-evaluate the need for `hasDelegatePending()` only after the incident fixes
   land and the continuation wake path has test coverage again.

Coverage already present:

- `src/auto-reply/reply/get-reply-run.media-only.test.ts` has a mock surface that will need updating

Coverage to add:

1. `src/auto-reply/reply/get-reply-run.media-only.test.ts`
   - delegate-return clears the flag exactly once
2. `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`
   - successful delegate-return wake preserves chain-state semantics via
     `isContinuationWake`
3. existing announce continuation tests should still pass unchanged, proving this
   is not an announce-delivery behavior rewrite

Targeted verification:

- `pnpm test src/auto-reply/reply/get-reply-run.media-only.test.ts`
- `pnpm test src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`

### 1.4. Physically dispose superseded delayed continuation work

Status:

- defect certainty: high
- certainty this fixes the retention itself: high
- certainty this reduces incident frequency: medium

Problem:

- `clearDelayedContinuationReservations(sessionKey)` exists in `src/auto-reply/continuation-delegate-store.ts:190-191`
- production stopped calling it
- superseded timers and reservations sit until their delay elapses
- on this fleet, `maxDelayMs` is large enough that dead work can accumulate meaningfully

Safe implementation plan:

1. Reintroduce physical cancellation, but only after timer handles are tracked.
2. Use explicit timer-handle registries, not generation-only “logical cancel”.
3. Clear both:
   - reservation objects
   - timer handles

Exact change set:

- `src/auto-reply/continuation-delegate-store.ts`
- `src/auto-reply/reply/agent-runner.ts`
- `src/agents/subagent-announce.ts`

Exact code shape:

1. Add an in-memory timer-handle registry keyed by session and reservation/timer id.
2. When scheduling delayed bracket/tool delegates:
   - store the reservation
   - store the timeout handle
3. When the timer fires:
   - remove the reservation
   - remove the handle
4. On external user input and explicit cancellation:
   - `clearTimeout(...)` all live handles for that session
   - call `clearDelayedContinuationReservations(sessionKey)`
5. For `continue_work` and chain-hop timers, which do not use reservation objects:
   - track handles in the same volatile registry
   - clear them on explicit cancel / external user input

Critical caution:

- this patch depends on 1.1 first
- I do not want to delete generations or clear timers until the timer-ref cleanup logic exists

Coverage already present:

- `src/auto-reply/continuation-delegate-store.test.ts`
- `src/agents/subagent-announce.continuation.test.ts`

Coverage to add:

1. `src/auto-reply/continuation-delegate-store.test.ts`
   - clear-all removes delayed reservations cleanly
2. `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`
   - external message cancels a pending delayed delegate timer before it fires
3. `src/agents/subagent-announce.continuation.test.ts`
   - external invalidation prevents a delayed chain-hop timer from spawning

Targeted verification:

- `pnpm test src/auto-reply/continuation-delegate-store.test.ts`
- `pnpm test src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`
- `pnpm test src/agents/subagent-announce.continuation.test.ts`

### 1.5. Clean up `request_compaction` guard state, but do not prioritize it above the above four

Status:

- defect certainty: medium-high
- certainty this bounds the small leak: high
- certainty this matters to the fleet incident: low

Problem:

- `src/agents/tools/request-compaction-tool.ts:26-32`
- `src/agents/tools/request-compaction-tool.ts:247-256`
- `pendingCompactionSessions` already cleans itself up
- `sessionGuardState` and `volitionalCompactionCounts` do not

Recommended fix:

- add lazy stale pruning, not eager deletion

Reason:

- `volitional` is surfaced in `/status` at `src/auto-reply/reply/commands-status.ts:291-307`
- immediate deletion would quietly change visible semantics

Exact change set:

- `src/agents/tools/request-compaction-tool.ts`
- `src/agents/tools/request-compaction-tool.test.ts`

Exact code shape:

1. Change `volitionalCompactionCounts` to store:
   - `{ count, lastTouchedMs }`
2. Add `pruneStaleRequestCompactionState(now)` called from:
   - tool execute entry
   - `getVolitionalCompactionCount`
3. TTL:
   - long, for example 24h
   - enough to preserve current-session status usefulness
   - short enough to bound process memory over multi-day uptime

Coverage already present:

- `src/agents/tools/request-compaction-tool.test.ts`

Coverage to add:

- stale entry pruning for both guard state and volitional counts

Targeted verification:

- `pnpm test src/agents/tools/request-compaction-tool.test.ts`

Recommendation:

- ship this only after 1.1 to 1.4 unless it falls out naturally from touching the same area

## 2. What I can fix external to our feature

These are not continuation-specific. They are either shared runtime retention or shared hot-path pressure.

### 2.1. Remove duplicate raw `sessions.json` retention

Status:

- defect certainty: high
- certainty this fixes the retention itself: high
- certainty this alone fixes the fleet stalls: low

Problem:

- `src/config/sessions/store-cache.ts:4-16`
- `src/config/sessions/store-load.ts:66-132`
- `src/config/sessions/store.ts:398-400`
- the raw serialized store is retained twice
- one copy is not bounded by the object-cache TTL

Recommended fix:

- make the serialized cache itself an expiring cache
- remove the dead `serialized` field from `SessionStoreCacheEntry`

Exact change set:

- `src/config/sessions/store-cache.ts`
- `src/config/sessions/store-load.ts`
- `src/config/sessions/store.ts`
- `src/config/sessions.cache.test.ts` or a new narrow `src/config/sessions/store-cache.test.ts`

Exact code shape:

1. In `store-cache.ts`:
   - delete `SessionStoreCacheEntry.serialized`
   - replace `SESSION_STORE_SERIALIZED_CACHE = new Map<string, string>()`
     with `createExpiringMapCache<string, string>({ ttlMs: getSessionStoreTtl })`
2. Keep the same public helpers:
   - `getSerializedSessionStore`
   - `setSerializedSessionStore`
   - `invalidateSessionStoreCache`
   - `clearSessionStoreCaches`
3. In `writeSessionStoreCache(...)`:
   - stop accepting/storing `serialized` in the object-cache entry
4. In `store-load.ts`:
   - keep populating the serialized cache from disk reads
5. In `store.ts`:
   - keep using `getSerializedSessionStore(storePath) === json` as the no-op write shortcut

Why this is the safest version:

- it preserves the existing no-op write optimization
- it removes the dead duplicate field
- it bounds the raw string lifetime using the same TTL model the object cache already uses

Coverage already present:

- `src/config/sessions.cache.test.ts`
- `src/config/sessions/store.lock.test.ts`

Coverage to add:

1. cache stores only one raw serialized copy in the public cache layer
2. serialized cache expires with TTL
3. no-op save shortcut still works while TTL is live
4. cache clear / invalidate clears both object and serialized caches

Targeted verification:

- `pnpm test src/config/sessions.cache.test.ts`
- `pnpm test src/config/sessions/store.lock.test.ts`

### 2.2. Remove one full-buffer rescan from the streamed delta hot path

Status:

- defect certainty: high that this path is expensive
- certainty this reduces CPU / timer starvation pressure: medium-high
- certainty this fully fixes the freeze: low-medium

Problem:

- `src/agents/pi-embedded-subscribe.handlers.messages.ts:321-347`
- `src/agents/pi-embedded-subscribe.ts:446-533`
- on each `text_delta`, the code can rescan the whole accumulated assistant buffer
- the clearest avoidable rescan is the fallback visible-text path:
  - `stripBlockTags(ctx.state.deltaBuffer, freshState)`

Recommended first fix:

- replace the full-buffer visible-text recomputation with an incremental visible buffer
- do **not** rewrite reasoning-stream extraction in the same patch

Why this split:

- the visible-buffer path already has an incremental primitive:
  - `visibleDelta = ctx.stripBlockTags(chunk, ctx.state.partialBlockState)`
- the reasoning path is trickier and easier to regress

Exact change set:

- `src/agents/pi-embedded-subscribe.handlers.types.ts`
- `src/agents/pi-embedded-subscribe.ts`
- `src/agents/pi-embedded-subscribe.handlers.messages.ts`
- existing `pi-embedded-subscribe*.test.ts` files

Exact code shape:

1. Add one new state field:
   - `incrementalVisibleText: string`
2. Reset it at assistant message start in `resetAssistantMessageState`
3. In `handleMessageUpdate`:
   - after `visibleDelta = chunk ? ctx.stripBlockTags(chunk, ctx.state.partialBlockState) : ""`
   - append `visibleDelta` to `state.incrementalVisibleText`
   - replace the fallback:
     - old: `stripBlockTags(ctx.state.deltaBuffer, freshState).trim()`
     - new: `state.incrementalVisibleText.trim()`
4. Keep the existing full `parseReplyDirectives(stripTrailingDirective(next))`
   - correctness first
   - do not combine incremental directive parsing in the same patch

What I will not do in this patch:

- I will not rewrite `extractThinkingFromTaggedStream(...)`
- I will not change reasoning message semantics
- I will not change final-tag enforcement logic

Coverage already present:

- `src/agents/pi-embedded-subscribe.handlers.messages.test.ts`
- `src/agents/pi-embedded-subscribe.code-span-awareness.test.ts`
- `src/agents/pi-embedded-subscribe.subscribe-embedded-pi-session.subscribeembeddedpisession.test.ts`
- `src/agents/pi-embedded-subscribe.subscribe-embedded-pi-session.does-not-duplicate-text-end-repeats-full.test.ts`
- `src/agents/pi-embedded-subscribe.subscribe-embedded-pi-session.filters-final-suppresses-output-without-start-tag.test.ts`

Coverage to add:

1. a `text_delta` sequence with partial `<think>` tags still emits the same visible output as before
2. `text_end` resend-full-content path does not duplicate visible output
3. code-span-aware `<think>` / `<final>` text inside backticks stays ignored

Targeted verification:

- `pnpm test src/agents/pi-embedded-subscribe.handlers.messages.test.ts`
- `pnpm test src/agents/pi-embedded-subscribe.code-span-awareness.test.ts`
- `pnpm test src/agents/pi-embedded-subscribe.subscribe-embedded-pi-session.subscribeembeddedpisession.test.ts`
- `pnpm test src/agents/pi-embedded-subscribe.subscribe-embedded-pi-session.does-not-duplicate-text-end-repeats-full.test.ts`
- `pnpm test src/agents/pi-embedded-subscribe.subscribe-embedded-pi-session.filters-final-suppresses-output-without-start-tag.test.ts`

Recommendation:

- ship this as its own wave after the continuation leak cleanup

### 2.3. Reduce repeated synchronous `sessions.json` loads inside announce delivery

Status:

- defect certainty: medium
- certainty this reduces pressure: medium
- certainty this materially changes the incident curve: low-medium

Problem:

- `src/agents/subagent-announce-delivery.ts:308-323`
- announce flow repeatedly calls `loadSessionStore(...)`
- `loadSessionStore(...)` is synchronous and clones the full store:
  - `src/config/sessions/store-load.ts:66-132`

Recommended fix:

- use per-flow memoization only
- do **not** add another process-global cache layer

Exact change set:

- `src/agents/subagent-announce-delivery.ts`
- tests touching announce continuation / timeout behavior

Exact code shape:

1. Thread a local “loaded requester/session entry” object through one announce flow invocation.
2. Avoid repeated `loadRequesterSessionEntry(...)` / `loadSessionEntryByKey(...)` calls for the same session in the same flow.
3. Keep the external interfaces unchanged if possible; prefer local helper closures.

Coverage already present:

- `src/agents/subagent-announce.continuation.test.ts`
- `src/agents/subagent-announce.timeout.test.ts`

Coverage to add:

- one test asserting the same flow does not reload the same session entry multiple times if I introduce a new helper seam

Recommendation:

- this is worth doing only after 2.1 and 2.2, because the evidence for it being the dominant trigger is weaker

## 3. What I cannot fix responsibly from this repo

These are real candidates, but not good local patches here.

### 3.1. `SessionManager.open(...)` internals if the root transcript hang is inside `@mariozechner/pi-coding-agent`

Reason:

- OpenClaw calls `SessionManager.open(params.sessionFile)` in multiple places, for example:
  - `src/agents/pi-embedded-runner/run/attempt.ts:853-861`
  - `src/agents/pi-embedded-runner/compact.ts:765-786`
  - `src/agents/pi-embedded-runner/session-truncation.ts:45-57`
- but the implementation of `SessionManager` is not maintained in this repo’s source tree

What I can do instead:

- detect oversized transcripts earlier
- truncate/archive aggressively after compaction
- avoid adding extra transcript churn locally

What I cannot honestly claim:

- that I can fully fix a `SessionManager.open` giant-JSONL main-thread hang from this repo without upstream/vendor work

### 3.2. Unbounded or poorly backpressured queues inside upstream Pi packages

Reason:

- the event-stream / agent-loop / session-event queue internals are in upstream packages, not local source
- I can reduce local per-delta cost
- I cannot fully redesign those upstream queue semantics here without taking ownership of forked package behavior

What I can do instead:

- reduce work per event locally
- add event-loop lag instrumentation

### 3.3. Undici / HTTP2 / SDK hangs below JS timer scheduling

Reason:

- the absolute abort timer is armed in our code
- if it still does not visibly fire, one plausible remaining class is a hang below normal JS scheduling
- that is not something I can claim to fix without proving the exact library-level retainer or lock

What I can do instead:

- instrument around the call boundary
- reduce JS-side starvation so timers have a chance to run
- capture evidence for upstream / library fixes

## Recommended execution order

If I execute this work, I would do it in this order:

1. feature wave A
   - 1.1 `continuationGenerations`
   - 1.2 restore structured continuation wake handling
2. feature wave B
   - 1.3 finish `delegatePendingFlags` lifecycle cleanup
   - 1.4 physical delayed timer/reservation disposal
3. feature wave C
   - 1.5 `request_compaction` stale-state cleanup
4. shared wave A
   - 2.1 `sessions.json` serialized cache retention
5. shared wave B
   - 2.2 streamed visible-buffer incremental path
6. shared wave C
   - 2.3 announce-delivery per-flow store-load dedup

## Minimum verification bar per wave

After each wave:

1. run the targeted tests listed in that section
2. rerun any test file I had to edit for mocks
3. run `pnpm build`

After the last wave on a branch intended for merge:

1. run `pnpm check`
2. if failures appear outside the touched surface, stop and triage before widening scope

## Final certainty summary

Highest-confidence fixes to execute now:

- restore structured `continuationTrigger` handling in `get-reply-run.ts`
- bound `continuationGenerations` with real timer lifetime tracking
- finish `delegatePendingFlags` lifecycle cleanup via structured delegate-return handling
- physically cancel delayed continuation timers/reservations
- remove duplicate serialized `sessions.json` retention

Medium-confidence, worthwhile but separate:

- incremental visible-buffer path in `pi-embedded-subscribe`
- request-compaction stale-state pruning
- per-flow announce store-load dedup

Not safe to promise from this repo:

- a full fix for upstream `SessionManager` giant transcript behavior
- a full fix for upstream Pi queue/backpressure semantics
- a full fix for any deeper undici / provider SDK hang below JS scheduling
