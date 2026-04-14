# WO0424 investigation notes

Branch audited: `deploy/414-fleet-canary` (current checkout)

## Execution update

The audit has now been executed on branch `flesh_beast_figs/20260411-fixup`.

Implemented from this investigation:

- continuation wake classification restored in `src/auto-reply/reply/get-reply-run.ts`
- continuation volatile state bounded in `src/auto-reply/reply/agent-runner.ts`
- delayed continuation timers now support physical disposal, not only generation drift invalidation
- delayed continuation reservations are cleared on explicit cancellation and ordinary external-message interruption
- `request_compaction` guard state is now TTL-bounded instead of process-lifetime
- duplicate raw `sessions.json` string retention was reduced to a single TTL-bound cache
- streamed visible-text assembly now uses incremental accumulation instead of rescanning the full delta buffer on every chunk
- announce flow now memoizes repeated same-flow session entry lookups inside `runSubagentAnnounceFlow`

Still intentionally not changed in this branch:

- provider transport / absolute timeout logic
- any upstream SDK / runtime internals below our application code

Issue context read first:

- `karmaterminal/openclaw-bootstrap#425`
- Comments update the scope from "continuation guard Maps leak" to "still fix the Maps, but also find what is retaining `sessions.json` strings and provider request bodies"

## Investigation path

I traced the work in this order:

1. `src/auto-reply/reply/agent-runner.ts`
   - audited every write path for `continuationGenerations` and `delegatePendingFlags`
   - checked whether either Map has a real delete/clear path
2. `src/agents/subagent-announce.ts`
   - checked whether chain-hop delegate flows add parent or child session keys
3. `src/auto-reply/continuation-delegate-store.ts`
   - compared neighboring module-level Maps to see which ones do have bounded cleanup
4. `src/config/sessions/store-cache.ts`
   - audited raw `sessions.json` caching and looked for duplicate retention
5. `src/config/sessions/store-load.ts`
   - checked when the serialized raw file string is cached
6. `src/config/sessions/store.ts`
   - checked why the serialized cache exists and whether it is TTL-bounded
7. `src/agents/provider-transport-fetch.ts`
   - traced the provider fetch seam
8. `src/infra/net/fetch-guard.ts`
   - checked whether request bodies are captured or retained there
9. `src/proxy-capture/runtime.ts`
   - checked the only local path that explicitly touches full provider request bodies
10. neighboring singleton stores

- `src/auto-reply/reply/reply-run-registry.ts`
- `src/auto-reply/reply/queue/state.ts`
- `src/auto-reply/reply/abort-primitives.ts`
- `src/agents/subagent-registry.ts`

11. upstream compare against `769908ec3f713ecde067eb8c8aa54d8f57217aff` (`v2026.04.11`)

- separated continuation-specific insertions from older shared announce / registry machinery

12. continuation prompt / tool exposure

- `src/agents/openclaw-tools.ts`
- `src/agents/system-prompt.ts`
- `src/agents/subagent-system-prompt.ts`

13. continuation-only disposal scan

- delayed continuation reservations / timers
- `request_compaction` guard state

## Findings

### 0. Continuation-enabled config is a real code-path discriminator, but not the sole root cause

First discriminator Ronan found:

- Ronan has `agents.defaults.continuation: { "taskFlowDelegates": true }`
- other leaking/stalling nodes have `agents.defaults.continuation.enabled: true`

That difference is real in code. `taskFlowDelegates: true` by itself does not enable continuation.

Relevant code:

- `src/auto-reply/reply/continuation-runtime.ts:53-60`
  - runtime config resolves `enabled` strictly as `continuation?.enabled === true`
- `src/agents/openclaw-tools.ts:320-345`
  - `continue_work`, `continue_delegate`, and `request_compaction` tools are only registered when `enabled === true`
- `src/auto-reply/reply/agent-runner.ts:506-512`
  - `continuationFeatureEnabled` is computed once per run and the Task Flow delegate store is only activated when both `enabled` and `taskFlowDelegates` are true
- `src/auto-reply/reply/agent-runner.ts:1025-1069`
  - bracket parsing only runs when `continuationFeatureEnabled` is true; otherwise it logs `bracket-parse skipped: feature disabled`
- `src/auto-reply/reply/agent-runner.ts:1077-1084`
  - `continue_work` requests are ignored unless `continuationFeatureEnabled` is true
- `src/auto-reply/reply/agent-runner.ts:1888-2094`
  - tool-dispatched continuation delegates are only consumed when `continuationFeatureEnabled` is true
- `src/auto-reply/reply/agent-runner.ts:2094-2111`
  - post-compaction delegate persistence is also gated on `continuationFeatureEnabled`
- `src/agents/subagent-announce.ts:460-516`
  - announce-back continuation-chain token accumulation and child delegate consumption are gated on `continuationEnabled`

What this means:

- Ronan's stable node still pays generic costs like normal model requests, session-store loads, and ordinary reply runs.
- But it avoids the continuation-enabled hot path:
  - no continuation tools in the prompt/toolset
  - no bracket continuation parsing
  - no continuation timer scheduling
  - no delegate-chain consumption / scheduling
  - no post-compaction delegate handling
  - no continuation announce-back chain logic

Interpretation:

- This strongly supports the claim that continuation-enabled behavior is the amplifier for the stall/leak/freeze symptoms.
- It does not prove that every generic memory-retention issue is harmless.
- It does mean the generic findings below are probably secondary unless they are specifically exercised much harder by continuation-enabled traffic.

Operational implication:

- A temporary mitigation of setting `agents.defaults.continuation.enabled: false` fleet-wide is still consistent with the code as a pressure reducer, but it is no longer sufficient as a full explanation or full fix.

Update after Elliott's later report:

- Ronan later also went silent with continuation still disabled.
- Reported state:
  - gateway alive
  - PID `470312`
  - `1h7m` uptime
  - `1.3 GB` RSS
  - last journal activity `18:55:59`
  - silent for roughly `8` minutes before restart

Revised interpretation:

- Continuation is not the only root cause.
- The better model now is:
  - there is a shared stall / event-loop wedge path that exists even with continuation disabled
  - continuation still appears to accelerate and amplify that path substantially
  - the continuation-specific leaks below remain real and worth fixing, but they are no longer enough to explain the full outage pattern by themselves

### 0.5. Upstream comparison: continuation mostly layers on top of preexisting announce / cleanup machinery

I compared this branch directly against upstream baseline commit:

- `769908ec3f713ecde067eb8c8aa54d8f57217aff`
- tag `v2026.04.11`

High-signal diff stats:

- `src/auto-reply/reply/agent-runner.ts`
  - `+1380` insertions; this is where most continuation scheduling landed
- `src/agents/subagent-announce.ts`
  - `+417` lines; continuation chain-hop logic is concentrated here
- `src/auto-reply/reply/continuation-runtime.ts`
  - new file
- `src/agents/openclaw-tools.ts`
  - small but important gating change; continuation tools become visible only when enabled

Shared announce infrastructure changed very little:

- `src/agents/subagent-announce-delivery.ts`
  - only `+10` lines in the compare
  - the important direct-announce machinery was already there before continuation:
    - 120s timeout at `src/agents/subagent-announce-delivery.ts:46`
    - transient retry delays at `src/agents/subagent-announce-delivery.ts:62-66`
    - retry loop at `src/agents/subagent-announce-delivery.ts:156-182`
- `src/agents/subagent-announce-queue.ts`
  - only `+1` structural field in the compare
  - queue state, backoff, and retry drain behavior were already there:
    - global queue registry at `src/agents/subagent-announce-queue.ts:61`
    - failure backoff and reschedule at `src/agents/subagent-announce-queue.ts:193-208`
- `src/agents/subagent-registry-cleanup.ts`
  - no relevant continuation diff
- `src/agents/subagent-registry-helpers.ts`
  - no relevant continuation diff

Interpretation:

- Continuation did not introduce the core announce retry / queue / cleanup-retention substrate.
- It adds new ways to drive that substrate:
  - more delegate spawns
  - more silent / wake returns
  - more chained subagent completions
  - more delayed timers
- Ronan's later disabled-yet-stalled behavior fits this exactly:
- shared announce / cleanup path can still wedge on its own
- continuation just makes it happen earlier and harder

### 0.6. Embedded-run timeout analysis: Copilot Claude uses the Anthropic stream path, and slow chunks only explain the idle watchdog

The new `github-copilot` detail matters because it narrows the transport path.

Relevant code:

- `extensions/github-copilot/models.ts:15-20`
  - Copilot model ids containing `claude` resolve to `api: "anthropic-messages"`
- `extensions/github-copilot/stream.ts:13-35`
  - Copilot wraps the Anthropic stream path with dynamic headers / payload patching
- `src/agents/anthropic-transport-stream.ts:596-865`
  - actual streaming loop for Copilot Claude requests

That means Ronan's Copilot `claude-opus-4.6` stalls are going through the Anthropic transport, not the OpenAI Responses transport.

There are two different watchdogs in the runner:

1. LLM idle watchdog
   - `src/agents/pi-embedded-runner/run/llm-idle-timeout.ts:69-144`
   - wrapped in `src/agents/pi-embedded-runner/run/attempt.ts:1255-1272`
   - this one is chunk-sensitive:
     - it races each `iterator.next()` against a timer
     - every delivered stream event effectively resets the idle window
   - default idle timeout is `120s` via `src/config/agent-timeout-defaults.ts:1`

2. Absolute embedded-run timeout
   - armed in `src/agents/pi-embedded-runner/run/attempt.ts:1529-1587`
   - started before `activeSession.prompt(...)` at `src/agents/pi-embedded-runner/run/attempt.ts:1587`
   - only cleared in final cleanup at `src/agents/pi-embedded-runner/run/attempt.ts:2227-2231`
   - this timer is not reset by stream chunks

Important correction:

- "slow / keepalive chunks prevent the timeout from triggering" is plausible for the idle watchdog
- it is not supported for the absolute embedded-run timer

So if the observed `300s` recovery sometimes never happens, the code makes these explanations much more likely:

- the event loop is blocked or starved badly enough that JS timers do not get to run
- the process is hung below normal JS scheduling in SDK / undici / stream internals
- the affected run did not actually have a `300s` timeout configured

And it makes this explanation less likely:

- "the stream looked alive so the 300s timer kept resetting"

The "timeout never set" theory also looks weaker after code audit:

- the absolute timer is scheduled unconditionally in the attempt path before prompt submission
- I did not find a conditional branch that skips `scheduleAbortTimer(...)` for normal runs

One more important nuance:

- the runner default timeout is not `300s`
- `src/agents/timeout.ts:3-47` defaults to `48h`
- reply code resolves the run timeout via `src/auto-reply/reply/get-reply.ts:220`

So if field logs show a `300s` timeout, that value is coming from config or a caller override, not a hardcoded embedded-run default.

Implication:

- the missing `embedded_run_failover_decision` event is best explained by the attempt never returning to `src/agents/pi-embedded-runner/run.ts`, which means the outer failover logic never gets a chance to log
- the next highest-value instrumentation is:
  - event-loop lag probe
  - explicit logs when the absolute abort timer is armed and when it actually fires
  - start/end logs around `runEmbeddedAttemptWithBackend(...)`

### 1. `continuationGenerations` is definitely unbounded, and it is worse than the issue body says

Primary code:

- `src/auto-reply/reply/agent-runner.ts:137-175`
- introduced by `ee42ff157fc` per `git blame`

What is true:

- `continuationGenerations` is a module-level `Map<string, number>`.
- I found no `.delete()` and no `.clear()` for this Map anywhere in the repo.
- The only mutation is `bumpContinuationGeneration(sessionKey)`, which does `.set(sessionKey, next)`.

Important correction to the original issue:

- This Map is not only written on `continue_work` / `continue_delegate`.
- It is also written on ordinary inbound traffic for any continuation-enabled session.

Relevant call sites:

- `src/auto-reply/reply/agent-runner.ts:171-174`
  - the only setter
- `src/auto-reply/reply/agent-runner.ts:520-543`
  - every external non-heartbeat message on a continuation-enabled session bumps the generation
- `src/auto-reply/reply/agent-runner.ts:1071-1076`
  - early delegate parse reserves a generation before scheduling
- `src/auto-reply/reply/agent-runner.ts:1655-1675`
  - chain-cap / cost-cap rejections still bump
- `src/auto-reply/reply/agent-runner.ts:1774-1778`
  - delayed bracket delegate timer
- `src/auto-reply/reply/agent-runner.ts:1843-1846`
  - delayed `continue_work` timer
- `src/auto-reply/reply/agent-runner.ts:2031-2034`
  - delayed tool delegate timer
- `src/agents/subagent-announce.ts:646`
  - delayed chain-hop timer for requester session
- `src/agents/subagent-announce.ts:764`
  - delayed tool-delegate timer for requester session

Consequence:

- Any continuation-enabled session can get a permanent entry just by receiving a normal inbound message.
- Sessions do not need to actually schedule a continuation.
- Child subagent session keys can also accumulate because `agent-runner.ts` uses the current `sessionKey`, which is the child session key during a subagent run.

Secondary problem:

- `clearDelegatePending(sessionKey)` deletes the flag, then immediately calls `bumpContinuationGeneration(sessionKey)` at `src/auto-reply/reply/agent-runner.ts:153-159`.
- That means "cleanup" of the delegate flag can itself create or preserve a generation entry.

Net:

- high-confidence leak / unbounded growth
- broader surface than the workorder originally described

### 2. `delegatePendingFlags` is also unbounded, and the intended completion cleanup was never wired

Primary code:

- `src/auto-reply/reply/agent-runner.ts:139-159`
- introduced by `ee42ff157fc` per `git blame`

What is true:

- `delegatePendingFlags` is a module-level `Map<string, boolean>`.
- Production code writes it in multiple places.
- Production code deletes it only on explicit cancellation / drift / external-message reset paths.
- I found no production read path at all.

Write paths:

- `src/auto-reply/reply/agent-runner.ts:1764-1768`
  - bracket delegate path sets the flag on the current `sessionKey`
- `src/auto-reply/reply/agent-runner.ts:2025-2029`
  - tool delegate path sets the flag on the current `sessionKey`
- `src/agents/subagent-announce.ts:606`
  - chain-hop announce path sets the flag on `targetRequesterSessionKey`
- `src/agents/subagent-announce.ts:726`
  - tool-delegate announce path sets the flag on `targetRequesterSessionKey`

Delete paths:

- `src/auto-reply/reply/agent-runner.ts:153-159`
  - `clearDelegatePending`
- `src/auto-reply/reply/agent-runner.ts:161-165`
  - only clears if there are no delayed reservations
- `src/auto-reply/reply/agent-runner.ts:424-430`
  - explicit cancellation path
- `src/auto-reply/reply/agent-runner.ts:551-553`
  - external-message reset path
- failure / drift paths only:
  - `src/auto-reply/reply/agent-runner.ts:1748-1752`
  - `src/auto-reply/reply/agent-runner.ts:1812-1814`
  - `src/auto-reply/reply/agent-runner.ts:2009-2013`
  - `src/auto-reply/reply/agent-runner.ts:2069-2070`

What is missing:

- The comment at `src/auto-reply/reply/agent-runner.ts:141-142` says the flag is "cleared when the delegate's completion is detected in get-reply-run."
- I could not find that implementation.
- `rg -n "hasDelegatePending\\(" src` returns only the definition in `src/auto-reply/reply/agent-runner.ts:149-150`.

Consequence:

- Successful delegate spawns do not clear the flag.
- Subagent child session keys can accumulate here too, because the current-session write paths run inside child sessions.
- Parent requester keys also accumulate through `subagent-announce.ts`.
- Since the flag is currently write-only in production, it has memory cost without active behavioral value.

Net:

- high-confidence leak / unbounded growth
- the intended completion-cleanup seam appears to have been planned but never finished

### 2.5. Continuation has a second retention problem: superseded delayed timers and reservations are not explicitly disposed

This one is different from the two permanent Map leaks above:

- it is primarily a transient-retention / pressure amplifier
- but it is continuation-specific
- and in a noisy channel it can accumulate a lot of logically dead work until timers expire

Relevant code:

- delayed reservation storage:
  - `src/auto-reply/continuation-delegate-store.ts:71-72`
  - `src/auto-reply/continuation-delegate-store.ts:131-188`
- the cleanup API still exists:
  - `src/auto-reply/continuation-delegate-store.ts:190-191`
- but production no longer calls it:
  - `src/auto-reply/reply/agent-runner.ts:370-371`
  - `src/auto-reply/reply/agent-runner.ts:544-547`
  - `rg -n "clearDelayedContinuationReservations\\(" src` only found tests plus the commented-out line in `agent-runner.ts`

What the code does now:

- external user input does not clear delayed continuation reservations
- explicit cancellation also does not clear delayed continuation reservations
- instead, the code relies on generation drift at timer fire-time

That means a superseded delayed continuation still keeps:

- its reservation object in `delayedReservations`
- its `setTimeout(...).unref()` closure
- the captured task text, silent flags, planned hop, session key, and surrounding scope

until the timer actually fires later and `takeDelayedContinuationReservation(...)` removes it.

Important timer sites:

- runner-side delayed bracket delegates:
  - `src/auto-reply/reply/agent-runner.ts:1774-1825`
- runner-side delayed `continue_work`:
  - `src/auto-reply/reply/agent-runner.ts:1843-1873`
- runner-side delayed tool delegates:
  - `src/auto-reply/reply/agent-runner.ts:2031-2082`
- announce-side delayed chain-hop delegates:
  - `src/agents/subagent-announce.ts:644-668`
- announce-side delayed tool delegates:
  - `src/agents/subagent-announce.ts:762-783`

Why this matters:

- `maxDelayMs` defaults to `300_000` in `src/auto-reply/reply/continuation-runtime.ts:17-18,60-63`
- in busy sessions, many delayed continuations can become obsolete long before they fire
- they still remain resident until their delay elapses

So even if the generation guard prevents incorrect behavior, it does not promptly release the memory or timer bookkeeping.

This is one of the strongest continuation-specific pressure amplifiers I found.

### 3. The heap finding about retained serialized `sessions.json` strings matches the code almost exactly

Primary code:

- `src/config/sessions/store-cache.ts:4-16`
- `src/config/sessions/store-load.ts:87-115`
- `src/config/sessions/store.ts:198-215`
- `src/config/sessions/store.ts:396-400`

What is true:

- The session store keeps the raw serialized `sessions.json` string in two places:
  1. `SessionStoreCacheEntry.serialized` inside `SESSION_STORE_CACHE`
  2. `SESSION_STORE_SERIALIZED_CACHE`, a separate `Map<string, string>`

Why this matters:

- The comment from issue `#425` said the heap showed roughly `3.8 MB x 2` for serialized sessions content.
- This code explains that shape very well.

More detail:

- `src/config/sessions/store-cache.ts:16`
  - `const SESSION_STORE_SERIALIZED_CACHE = new Map<string, string>();`
- `src/config/sessions/store-cache.ts:78-85`
  - `writeSessionStoreCache(...)` stores `serialized` on the cache entry and also in `SESSION_STORE_SERIALIZED_CACHE`
- `src/config/sessions/store-load.ts:92-115`
  - every successful disk read captures `raw` and calls `setSerializedSessionStore(storePath, raw)`
- `src/config/sessions/store.ts:398-400`
  - the raw serialized cache exists only to skip no-op rewrites when the JSON bytes match

Important detail:

- `SESSION_STORE_CACHE` is TTL-based.
- `SESSION_STORE_SERIALIZED_CACHE` is not TTL-based.
- `dropSessionStoreObjectCache(storePath)` only clears the object cache, not the serialized-string cache (`src/config/sessions/store-cache.ts:51-53`).
- Even with the object cache disabled, `loadSessionStore(...)` still fills `SESSION_STORE_SERIALIZED_CACHE`.

Also important:

- `SessionStoreCacheEntry.serialized` appears to be dead weight.
- `rg -n "\\.serialized\\b" src/config/sessions` only found its declaration and writes, not a read from the cache entry.

Consequence:

- The raw `sessions.json` string is definitely retained in-process.
- In the common case it is retained twice.
- One of those copies survives independently of the TTL object cache.
- Ronan's earlier relative stability implies this cache is probably not the primary stall/leak amplifier by itself, because the same session-store machinery still exists on the continuation-disabled node.

Net:

- high-confidence explanation for the heap-retained serialized sessions string
- likely a real but secondary retention issue relative to the continuation-enabled hot path

### 4. The provider request-body retainer is only partially proven from code audit

Primary code:

- `src/agents/provider-transport-fetch.ts:90-130`
- `src/infra/net/fetch-guard.ts:364-380`
- `src/proxy-capture/runtime.ts:167-291`

High-confidence local finding:

- The strongest explicit local request/response body capture path is the debug-proxy capture path.

Flow:

- `src/agents/provider-transport-fetch.ts:114-129`
  - provider fetches always pass `capture: { meta: ... }` into `fetchWithSsrFGuard(...)`
- `src/infra/net/fetch-guard.ts:364-380`
  - if `capture !== false`, guarded fetch calls `captureHttpExchange(...)` with `requestBody`
- `src/proxy-capture/runtime.ts:177-188`
  - `captureHttpExchange(...)` immediately returns unless `OPENCLAW_DEBUG_PROXY_ENABLED=1`
- if debug proxy is enabled:
  - request string / buffer payloads are persisted via `persistEventPayload(...)`
  - the response is cloned and fully buffered via `params.response.clone().arrayBuffer()` at `src/proxy-capture/runtime.ts:249-275`

Important transport-lifetime nuance:

- `src/agents/provider-transport-fetch.ts:11-57`
  - `buildManagedResponse(...)` wraps the response body and defers `release()` until the wrapped stream finishes or is canceled
- `src/agents/provider-transport-fetch.ts:130`
  - every guarded provider response is returned through that wrapper

Interpretation:

- if the provider stream hangs and the consumer never reaches EOF / cancel, request/response lifetime is extended
- that makes this seam relevant to shared stall behavior even without debug proxy
- but for completed turns that fully drain, this wrapper should eventually release transport resources

So the current best split is:

- debug proxy enabled:
  - strong candidate for extra request/response retention
  - especially because it clones and buffers full responses
- debug proxy disabled:
  - the managed-response wrapper still matters for hung streams
  - but I still do not have proof of a universal completed-turn body cache from local code alone

What I can say with confidence:

- If debug proxy capture was enabled in the leaking process, this seam is absolutely in scope.
- It is the only audited local path that explicitly receives the full provider request body and clones the full response body.

What I cannot yet prove from code audit alone:

- I did not find an unconditional, process-global local cache of full provider request payload strings when debug proxy is disabled.
- I did not find a local `Map`/singleton equivalent to the sessions-store raw-string cache for provider bodies.

Most likely remaining non-debug path:

- request/response lifetime inside `buildGuardedModelFetch(...)`, `fetchWithSsrFGuard(...)`, `Request`, `Response`, and underlying SDK / undici objects
- especially around:
  - `src/agents/provider-transport-fetch.ts:94-113`
    - creates a `Request` clone when `input instanceof Request`
  - `src/agents/provider-transport-fetch.ts:11-57`
    - wraps the response body and defers `release()` until the wrapped stream finishes/cancels

My current confidence:

- debug proxy enabled: strong candidate
- debug proxy disabled: not yet proven from local code; needs heap-correlated confirmation

How the new Ronan finding changes this:

- Ronan still performs provider requests while stable.
- That makes an unconditional provider-body retention bug less likely to be the primary discriminator.
- The provider-body finding may still matter if:
  - continuation-enabled traffic produces much larger payloads or many more requests
  - or debug proxy capture was only enabled on the unstable nodes
  - or continuation paths hold onto request/response objects longer than the normal reply path

### 5. Nearby module-level Maps/Sets do not show the same leak pattern

These looked okay on this pass:

- `src/auto-reply/continuation-delegate-store.ts:71-73`
  - `pendingDelegates`, `delayedReservations`, and `stagedPostCompactionDelegates`
  - each has matching consume/delete/clear paths
- `src/auto-reply/reply/reply-run-registry.ts:92-98`
  - active-run Maps are cleared on run end via `clearReplyRunState(...)`
- `src/auto-reply/reply/queue/state.ts:29`
  - followup queue registry has explicit `clearFollowupQueue(...)`
- `src/auto-reply/reply/abort-primitives.ts:49-50`
  - `ABORT_MEMORY` is bounded at 2000 keys and prunes oldest entries
- `src/agents/subagent-registry.ts:173-182`
  - `resumedRuns`, `endedHookInFlightRunIds`, and `pendingLifecycleErrorByRunId`
  - have matching delete/clear behavior

### 5.6. Attempt teardown / disposal scan: no obvious missing cleanup in the embedded runner itself

I specifically checked the embedded-run attempt cleanup path for obvious disposal holes.

Relevant code:

- `src/agents/pi-embedded-runner/run/attempt.ts:2227-2252`
  - clears abort timers
  - calls `unsubscribe()`
  - detaches the reply backend
  - clears active embedded-run registry state
  - removes the external abort listener
- `src/agents/pi-embedded-runner/run/attempt.ts:2384-2393`
  - always calls `cleanupEmbeddedAttemptResources(...)`
- `src/agents/pi-embedded-runner/run/attempt.subscription-cleanup.ts:17-64`
  - best-effort flushes pending tool results
  - disposes the session
  - releases any WS session
  - disposes the LSP runtime
  - releases the session write lock in `finally`
- `src/agents/openai-ws-stream.ts:208-217`
  - `releaseWsSession(...)` closes the manager and deletes the registry entry

Interpretation:

- I did not find an obvious missing-disposal bug in the embedded attempt's main teardown path
- the runner is at least trying to clean up:
  - timers
  - subscriptions
  - session objects
  - WS session registry state
  - LSP runtime
  - write lock

That does not rule out a lower-level SDK / transport hang, but it lowers my confidence in "we forgot to clear one obvious top-level runner resource" as the primary shared root cause.

### 5.5. Additional continuation-only improper disposal: `request_compaction` keeps per-session state forever once touched

Primary code:

- `src/agents/tools/request-compaction-tool.ts:26-32`
  - `sessionGuardState`
- `src/agents/tools/request-compaction-tool.ts:247-257`
  - `volitionalCompactionCounts`

What is true:

- `sessionGuardState` gets new per-session entries at `src/agents/tools/request-compaction-tool.ts:203-206`
- `volitionalCompactionCounts` gets new per-session entries at `src/agents/tools/request-compaction-tool.ts:250-252`
- runtime code does not delete either one
- the only delete / clear paths are test helpers:
  - `src/agents/tools/request-compaction-tool.ts:264-284`

What is not a leak here:

- `pendingCompactionSessions` is a `Set`, but it is correctly deleted in `.finally()` at `src/agents/tools/request-compaction-tool.ts:211-228`

Interpretation:

- this is a smaller secondary leak than `continuationGenerations` / `delegatePendingFlags`
- but it is still real improper disposal on a continuation-only surface
- it matters only if `request_compaction` is actually being used in production

### 6. Strongest current shared root-cause candidate: preexisting subagent announce / cleanup retention

Ronan's later disabled-yet-stalled report makes this the most plausible shared substrate.

Why this path stands out:

- it exists with continuation on or off
- it already existed in upstream `v2026.04.11`
- continuation adds a lot more traffic onto it

Relevant shared behavior:

- direct announce delivery can block for a long time:
  - timeout at `src/agents/subagent-announce-delivery.ts:46`
  - retry delays at `src/agents/subagent-announce-delivery.ts:62-66`
  - retry loop at `src/agents/subagent-announce-delivery.ts:156-182`
- failed queue drains keep queued items alive and reschedule themselves:
  - `src/agents/subagent-announce-queue.ts:61`
  - `src/agents/subagent-announce-queue.ts:193-208`
- completed subagent runs retain substantial in-memory state until cleanup completes:
  - retained fields on `SubagentRunRecord` at `src/agents/subagent-registry.types.ts:6-46`
  - frozen completion capture at `src/agents/subagent-registry-lifecycle.ts:156-169`
  - cleanup path hands those retained fields into announce flow at `src/agents/subagent-registry-lifecycle.ts:504-535`
- TTL cleanup does not start until `cleanupCompletedAt` exists:
  - `src/agents/subagent-registry.ts:496-502`

Why this matches the new field evidence:

- continuation-disabled Ronan can still hit ordinary subagent announce / cleanup behavior
- continuation-enabled nodes likely hit the same path much more often because the feature teaches and exposes delegation heavily
- so the shared base path can explain "disabled still stalled", while continuation explains "enabled stalls much sooner"

This is now my best current model:

- shared stall path:
  - subagent announce delivery / retry / cleanup retention
- continuation-specific accelerants:
  - the two real module-level leaks
  - uncancelled delayed timer / reservation retention
  - prompt/tool exposure that encourages much more delegate traffic

## Practical conclusions

### Highest-confidence fixes

1. Instrument and bound the shared subagent announce / cleanup path
   - This is now the best root-cause candidate that explains both continuation-enabled and continuation-disabled stalls.
   - Focus first on:
     - queued announce backlog size
     - number of runs with `cleanupCompletedAt === undefined`
     - count and total bytes of `frozenResultText` / `fallbackFrozenResultText`
     - direct announce attempts currently sitting in 120s timeout windows

2. Fix `continuationGenerations`
   - Do not keep the current "numeric generation per session with no delete path" design.
   - The current reuse-collision comment is valid, so naive delete-on-clear is unsafe unless timer state is also tracked.
   - Safer options:
     - replace per-session numeric generations with a process-global monotonically increasing epoch/token
     - or track outstanding work/delegate timers explicitly, then delete only when no timer/reservation remains
   - Also stop creating a generation entry on every normal inbound message when no timer/delegate state exists.

3. Fix `delegatePendingFlags`
   - Short version: either remove it entirely or finish the originally intended completion-clear path.
   - Right now it is write-only in production.
   - If kept, it needs explicit cleanup for successful immediate and delayed delegate completions, including child subagent sessions.

4. Restore proper disposal for superseded delayed continuation work
   - If the current generation-guard model is kept, invalidated delayed reservations still need a prompt physical cleanup path.
   - Otherwise continuation-enabled noisy sessions can retain large numbers of dead timers for up to `maxDelayMs`.

5. Fix session-store serialized retention
   - Remove one of the two raw-string caches.
   - Most obvious low-risk cut:
     - drop `SessionStoreCacheEntry.serialized`
   - Then decide whether `SESSION_STORE_SERIALIZED_CACHE` should:
     - get TTL-bounded
     - or be replaced with a cheaper equality shortcut

6. Clean up `request_compaction` guard state if that tool is in use
   - `sessionGuardState` and `volitionalCompactionCounts` should not be immortal per-session Maps.

7. Temporary production mitigation
   - `agents.defaults.continuation.enabled: false` still looks like a valid mitigation for reducing pressure.
   - But Ronan's later stall means it is only a mitigation, not a full fix.

### Provider-body next step

Before changing provider transport code, confirm one thing from the leaking process:

- Was `OPENCLAW_DEBUG_PROXY_ENABLED=1` in the fleet / Elliott process?

If yes:

- the debug-proxy capture seam moves to the front of the queue

If no:

- the next audit target should be heap-retainer confirmation around:
  - `src/agents/provider-transport-fetch.ts`
  - `src/infra/net/fetch-guard.ts`
  - upstream SDK / undici `Request`/`Body` objects

## Short verdict

From code audit alone:

- Ronan's config difference is real and code-significant: `enabled: true` activates a much heavier continuation path
- Ronan later stalling with continuation disabled means continuation is not the sole root cause
- upstream compare shows the most likely shared substrate is older subagent announce / cleanup machinery, not the continuation diff by itself
- `continuationGenerations`: real leak, definite
- `delegatePendingFlags`: real leak, definite
- delayed continuation timers / reservations: real continuation-specific retention amplifier, high confidence
- `request_compaction` guard Maps: smaller continuation-only improper disposal, high confidence
- retained serialized `sessions.json`: real retained memory, definite, and the `x2` heap shape matches the code, but likely secondary
- retained provider request bodies: local debug-proxy path is a real candidate, but unconditional non-debug retention is not yet proven from this audit alone
- Copilot `claude-opus-4.6` uses the Anthropic stream transport, not OpenAI Responses
- slow chunks can explain missing idle-timeout failures, but they do not explain a missing absolute embedded-run timeout
- strongest new timer-path read:
  - "300s timeout was never armed" looks unlikely from code
  - "300s timeout kept resetting on stream activity" is not supported by code
  - "attempt hung below JS timers / event loop got starved" is now the leading explanation for silent freezes with no failover event
- strongest current model:
  - shared root candidate: subagent announce delivery / retry / cleanup retention
  - continuation contribution: it amplifies that path and also adds several real retention bugs of its own

## Notes

- I did not change runtime code in this pass.
- I did not run tests in this pass.

## 2026-04-13 addendum: independent validation of Elliott summary

I re-checked Elliott's terse summary against the code instead of treating it as authoritative.

### What concurs

1. `continuationGenerations` is a real unbounded singleton leak
   - `src/auto-reply/reply/agent-runner.ts:137-175`
   - no production delete path exists
   - it is bumped on ordinary inbound external messages, not just on actual continuation scheduling

2. `delegatePendingFlags` is a real singleton leak / dead-state store
   - `src/auto-reply/reply/agent-runner.ts:139-159`
   - `hasDelegatePending()` still has no production callers
   - the comment promising completion-time cleanup is still not implemented

3. superseded delayed continuation reservations are not physically disposed
   - `src/auto-reply/continuation-delegate-store.ts:131-191`
   - the cleanup API still exists
   - production currently relies on generation drift at fire-time rather than prompt removal
   - with large `maxDelayMs`, stale reservation objects and timer closures can sit resident for a long time

4. the duplicate raw `sessions.json` retention is real
   - `src/config/sessions/store-cache.ts:4-16`
   - `src/config/sessions/store-load.ts:87-129`
   - `src/config/sessions/store.ts:398-400`
   - `SessionStoreCacheEntry.serialized` still looks dead
   - `SESSION_STORE_SERIALIZED_CACHE` is still not TTL-bounded

5. upstream really does have matching base symptoms
   - `openclaw/openclaw#64767`: giant session JSONL blocking the gateway
   - `openclaw/openclaw#43374`: multi-agent simultaneous LLM timeout failures
   - `openclaw/openclaw#51097`: `sessions.json` loaded and retained in memory
   - `openclaw/openclaw#54155`: multi-day RSS climb with session accumulation

### What only partially concurs

1. `request_compaction` guard state is a smaller real leak, but Elliott's wording was too broad
   - `src/agents/tools/request-compaction-tool.ts:26-32`
   - `src/agents/tools/request-compaction-tool.ts:203-228`
   - `src/agents/tools/request-compaction-tool.ts:247-256`
   - `pendingCompactionSessions` does have a production cleanup path in `.finally(...)`
   - `sessionGuardState` and `volitionalCompactionCounts` still do not have production lifecycle cleanup, so they can accumulate across long uptime
   - this is real, but much smaller than the continuation runner Maps

2. "subagent announce retry storm is the shared root cause" is not independently proven from code
   - the retry path is definitely real:
     - `src/agents/subagent-announce-delivery.ts:156-182`
     - `src/agents/subagent-announce-delivery.ts:470-511`
   - but the retries are idempotent, not obviously duplicate LLM runs:
     - queue/direct path passes stable idempotency keys
     - gateway dedupes by `agent:${idem}`
   - current best reading is:
     - announce delivery/retry is a pressure amplifier and likely trigger surface
     - it is not yet proven to be the singular shared root

3. "not fixable in our fork without upstream changes" is too strong
   - the strongest hot-path stall candidate I have from local code is inside this fork:
     - `src/agents/pi-embedded-subscribe.handlers.messages.ts:321-347`
     - `src/agents/pi-embedded-subscribe.ts:446-533`
     - `src/markdown/code-spans.ts:22-37,95-104`
     - `src/agents/pi-embedded-utils.ts:312-335`
   - that path rescans the full accumulated stream buffer repeatedly on each delta
   - this is patchable locally

### Stronger shared-root chain from independent trace

The best code-backed shared stall model is now:

1. provider stream emits many deltas
   - Copilot Claude goes through Anthropic transport:
     - `extensions/github-copilot/models.ts:15-20`

2. each delta does repeated full-buffer work on the JS main thread
   - reasoning extraction rescans the whole accumulated text:
     - `src/agents/pi-embedded-subscribe.handlers.messages.ts:321-323`
     - `src/agents/pi-embedded-utils.ts:312-335`
   - visible-text stripping rescans the whole accumulated text:
     - `src/agents/pi-embedded-subscribe.handlers.messages.ts:325-335`
     - `src/agents/pi-embedded-subscribe.ts:446-533`
   - directive parsing reparses the whole visible text:
     - `src/agents/pi-embedded-subscribe.handlers.messages.ts:347`
   - code-span indexing reparses full text and uses linear span checks:
     - `src/markdown/code-spans.ts:22-37,95-104`

3. event delivery is serialized and effectively unbounded
   - OpenClaw serializes async session event handling through `pendingEventChain`
   - upstream Pi event streams also queue in memory when the consumer is behind
   - if delta handling falls behind, backlog and timer delay can compound quickly

4. announce flow adds more synchronous store churn on top
   - announce delivery repeatedly loads `sessions.json` synchronously:
     - `src/agents/subagent-announce-delivery.ts:308-323`
     - `src/config/sessions/store-load.ts:66-132`
   - that means `fs.readFileSync` + `JSON.parse` + `structuredClone` on the full store can land in the middle of already-busy event processing

5. continuation still amplifies the whole thing
   - more delegate traffic
   - more timers
   - more announce activity
   - plus the real singleton Map leaks and stale delayed reservation retention

This model fits the observed field data better than a continuation-only story and better than a pure provider-outage story.

### Important timeout correction reaffirmed

- the absolute embedded-run timeout is still armed unconditionally:
  - `src/agents/pi-embedded-runner/run/attempt.ts:1529-1587`
  - cleanup clears it at `src/agents/pi-embedded-runner/run/attempt.ts:2227-2231`
- slow stream chunks can keep the idle watchdog alive
- they do not reset the absolute abort timer

So when the fleet "freezes forever" without the timeout log, the leading explanation remains:

- JS timers are not getting a scheduling chance because the process is starved or wedged below the outer runner loop

### Updated priority order

If I were sequencing fixes from this note alone:

1. fix `continuationGenerations`
2. fix `delegatePendingFlags`
3. restore physical cleanup for superseded delayed reservations
4. remove duplicate `sessions.json` raw-string retention
5. reduce streamed delta hot-path rescanning in `pi-embedded-subscribe*`
6. instrument / trim synchronous session-store loads in announce delivery
7. add lifecycle cleanup for `request_compaction` guard Maps

That ordering keeps the known continuation leaks in front, but no longer treats continuation as the sole root cause.
