# Canonical2 continuation release notes draft

Status: draft for maintainer review.

Scope: canonical2 continuation substrate, durability, context pressure, compaction, telemetry, and verification evidence.

Canonical implementation tip: `cf7830ffb3702bf7d826d70838893e2e41709f12`.

Base tag used for inventory: `v2026.4.24`.

Release-note branch: `frond-scribe/20260429/release-notes-canonical2`.

Package version policy for this lane: keep `package.json` at `2026.4.24`.

No fork-line version string is introduced by this draft.

No GitHub issue, PR, label, project, workflow, release, or tag mutation is part of this draft.

No tests, installs, or CI lanes were run while writing this draft; the evidence below is source, commit, and prior-PR provenance.

Delta inventories live in `docs/release-notes/canonical2-vs-v2026.4.24.txt` and `docs/release-notes/canonical2-vs-feature-squashed.txt`.

The inventories compare the canonical implementation tip instead of this release-notes branch head so journal and draft commits do not self-pollute the code delta.

## Provenance keys used throughout

- `P423` = PR #423, merge `c8f85f525466dbadc70791759c4c7db32318978a`.
- `P427` = PR #427, merge `d0f31f65cc1250e5300d1c45ac4feeda71100b18`.
- `P428` = PR #428, merge `e73fd0f088813ca125bab60a2cc54c08ac97ff07`.
- `P429` = PR #429, merge `dc572c01062a8da9a337039c87c1eb09288af640`.
- `P430` = PR #430, merge `15e045fe460f0fa00f14fdf29f95627d7200b789`.
- `P432` = PR #432, merge `cf7830ffb3702bf7d826d70838893e2e41709f12`.
- `P422` = PR #422, merge `42f1bb9c14bcc5b462206809302b289cbe696f5b`.
- `P421` = PR #421, merge `29e556eb11de7ee7de9e4dadda8bdb2baf3a5dab`.
- `P400` = PR #400, merge `5e90c859b9784acb09e2ce13dc7fe62970635094`.
- `P397` = PR #397, merge `cd8b623be20ce307550048ded1af9d9ef2f26164`.
- `P395` = PR #395, merge `560948a70a6feaf9dbb150b7f8e0601725f02f23`.
- `P391` = PR #391, merge `47016eb41748a3400e4cfed1d09aefcd618ecce4`.
- `P388` = PR #388, merge `e959d2c1772aa6625b768ffb367caaa8729dc326`.
- `P385` = PR #385, merge `6656138126e8b3c650325d6076b18b5100cfec9d`.
- `P384` = PR #384, merge `4719e86345b0dcf983251b80c0f2310349233d09`.
- `P383` = PR #383, merge `3655b0667af5d96f669154388b5221a3ccefcba3`.
- `P382` = PR #382, merge `19797e7fa6cdefc4ce278de54baa234b15b98b50`.
- `P378` = PR #378, merge `d533d5c7205e63a26e0c892fcdd9813feb53d95f`.
- `P366` = PR #366, merge `2d10c1c2189563439de59cbf03158057cd913fb0`.

## Executive significance

- Canonical2 makes continuation delegate storage TaskFlow-backed instead of relying on a volatile delegate Map. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The delegate substrate now has one canonical implementation under `src/auto-reply/continuation/delegate-store.ts`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The old import path remains as a compatibility shim rather than a second substrate. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Post-compaction delegate staging uses the same TaskFlow substrate as ordinary continuation delegates. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The one-cycle `taskFlowDelegates` config key is accepted and ignored for upgrade compatibility. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Tool-delegate chain state is durably written through the active entry, active store, and disk store. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- Followup turns advance token-based chain accounting even when no delegate is dispatched. [PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`]
- Child-session delegate drains persist the advanced child chain state after the child returns. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- The swim-37 durability harness proves two-hop, followup-token, and restart roundtrips against disk-backed session state. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- The #431 followup-runner orphan was fixed by wrapping the persistence path in `updateSessionStore`. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Canonical2 is now closer to a restart-safe continuation substrate than the earlier in-memory delegate design. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- The durability fixes target chain-count and token-budget persistence, not just delegate queue persistence. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`; PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- The followup path is important because usage patches alone do not carry `continuationChain*` fields. [PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- The child-drain path is important because subagents can advance the parent-visible chain without another ordinary runner turn. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- The restart proof matters because TaskFlow delegate records and session-chain state must agree after process memory is cleared. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- The design keeps timers process-local while making queued delegate records durable. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The design keeps context-pressure delivery on the system-event path rather than sending user-visible channel messages. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The release candidate is not just a docs rebase; it changes continuation runtime persistence semantics. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- The release candidate includes observability wiring for continuation spans and an OTEL adapter. [PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`]
- The release candidate keeps the tracer surface additive and no-op-safe before OTEL wiring. [PR #378 `d533d5c7205e63a26e0c892fcdd9813feb53d95f`; PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`]
- The release candidate records chain IDs and span names used by swim-37 probes. [PR #382 `19797e7fa6cdefc4ce278de54baa234b15b98b50`; PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`]
- The release candidate adds cap-rejection telemetry for disabled or over-budget continuation dispatches. [PR #384 `4719e86345b0dcf983251b80c0f2310349233d09`; PR #385 `6656138126e8b3c650325d6076b18b5100cfec9d`]
- The release candidate wires queue-drain, delegate-fire, work-fire, and compaction-release spans. [PR #388 `e959d2c1772aa6625b768ffb367caaa8729dc326`; PR #391 `47016eb41748a3400e4cfed1d09aefcd618ecce4`; PR #395 `560948a70a6feaf9dbb150b7f8e0601725f02f23`; PR #397 `cd8b623be20ce307550048ded1af9d9ef2f26164`]
- The release candidate aligns span payloads on `signal.kind` and `compaction.id` as shared attributes. [PR #400 `5e90c859b9784acb09e2ce13dc7fe62970635094`]
- The release candidate reparented release-highlight documentation onto canonical2. [PR #421 `29e556eb11de7ee7de9e4dadda8bdb2baf3a5dab`]
- The release candidate does not yet close every open review lane; #361, #363, and #368 remain open with no merge SHA. [open PRs #361, #363, #368]

## What changed by surface

### 1. Delegate substrate

- `src/auto-reply/continuation/delegate-store.ts` is the canonical delegate store. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/continuation/delegate-store.ts` uses TaskFlow controller ID `core/continuation-delegate`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/continuation/delegate-store.ts` uses TaskFlow controller ID `core/continuation-post-compaction`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Delegate payloads are validated through Zod before release to callers. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Corrupt delegate records are failed rather than silently treated as valid work. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Released delegate records are finished with a `releasedAt` timestamp. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Queue selection preserves FIFO ordering after filtering by session and due time. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Delayed reservation timers remain volatile because timer handles are process-scoped. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Delayed reservation records themselves move through the canonical TaskFlow-backed store. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Post-compaction delegates no longer depend on a separate in-memory staging substrate. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The compatibility file `src/auto-reply/continuation-delegate-store.ts` re-exports and adapts the canonical store. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The compatibility file documents that the volatile Map fallback has been removed. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The compatibility file documents that `taskFlowDelegatesEnabled` is no longer a runtime gate. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The workorder filename `continuation-delegate-store-taskflow.ts` is stale for this branch; the actual source is under `continuation/delegate-store.ts`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The workorder filename `continuation-delegate-store-taskflow.test.ts` is stale for this branch; the actual tests are split across canonical and shim test files. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]

### 2. Delegate store tests

- `src/auto-reply/continuation/delegate-store.test.ts` mocks TaskFlow registry behavior at the store boundary. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The canonical store tests pin enqueue and consume behavior for ordinary continuation delegates. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The canonical store tests pin session isolation across queued delegates. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The canonical store tests pin mode roundtrip for delegate payloads. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The canonical store tests pin post-compaction controller separation. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The canonical store tests pin delay gating for unmatured delegate reservations. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The canonical store tests pin `peekSoonestUnmaturedDelegateDueAt`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/continuation-delegate-store.test.ts` keeps legacy import-path smoke coverage alive. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The legacy shim tests pin pending delegate counts through the old path. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The legacy shim tests pin delayed reservation release through the old path. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The legacy shim tests pin post-compaction staging through the old path. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/continuation-delegate-store.post-compaction-substrate.test.ts` verifies tool-side and runner-side post-compaction calls resolve to the same module instance. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]

### 3. Chain state and runtime config

- `src/auto-reply/continuation/state.ts` centralizes chain-state load and persist helpers. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Canonical chain-state helpers derive pending delegate truth from TaskFlow instead of a separate pending Map. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Canonical chain-state helpers track timer handles and refs outside the durable delegate queue. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/continuation/config.ts` is the canonical continuation runtime config resolver. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The runtime config resolver clamps continuation delays before enforcement. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The runtime config resolver keeps default delay and cap behavior centralized. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/continuation-runtime.ts` remains a reply-local resolver surface for continuation defaults and clamping. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/continuation-runtime.test.ts` pins delay clamping. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/continuation-runtime.test.ts` pins fractional truncation. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/continuation-runtime.test.ts` pins optional context-threshold behavior. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/continuation-runtime.test.ts` pins zero-delay overrides. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/continuation-runtime.test.ts` pins max-delegates-per-turn resolution. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]

### 4. Delegate dispatch

- `src/auto-reply/continuation/delegate-dispatch.ts` consumes TaskFlow delegates rather than in-memory pending records. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Delegate dispatch arms hedge timers for unmatured entries. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Delegate dispatch enforces `maxDelegatesPerTurn`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Delegate dispatch enforces `maxChainLength`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Delegate dispatch enforces continuation token cost caps. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Delegate dispatch labels spawned continuation turns with `[continuation:chain-hop:N]`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Delegate dispatch returns advanced chain state to the caller rather than persisting it internally in every case. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- Post-compaction delegate dispatch uses `silentAnnounce` with wake-on-return behavior. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Chain-budget rejections are part of the dispatch contract rather than late caller-specific behavior. [PR #366 `2d10c1c2189563439de59cbf03158057cd913fb0`]
- Cap-rejection telemetry was added for disabled or over-budget dispatch cases. [PR #384 `4719e86345b0dcf983251b80c0f2310349233d09`; PR #385 `6656138126e8b3c650325d6076b18b5100cfec9d`]

### 5. Context pressure

- `src/auto-reply/reply/context-pressure.ts` computes threshold bands for continuation pressure. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Context pressure uses fresh token totals before firing. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Context pressure emits a `[context-pressure:fire]` diagnostic line when it fires. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Context pressure enqueues `[system:context-pressure]` as a system event. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Context pressure updates `lastContextPressureBand` after firing. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/context-pressure.test.ts` pins disabled behavior. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/context-pressure.test.ts` pins below-threshold no-op behavior. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/context-pressure.test.ts` pins band escalation behavior. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/context-pressure.test.ts` pins dedup behavior. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/context-pressure.test.ts` pins stale-token guards. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/context-pressure.test.ts` pins custom threshold behavior. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/context-pressure.integration.test.ts` pins system-event queue visibility before drain. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/auto-reply/reply/context-pressure.integration.test.ts` pins system-event consumption after prompt drain. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]

### 6. Request compaction

- `src/agents/tools/request-compaction-tool.ts` adds an active-session precondition. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `request_compaction` requires a session-id match before compaction is accepted. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `request_compaction` requires a reason. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `request_compaction` rejects below the >=70% context-pressure guard. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `request_compaction` has a per-session 5-minute rate limit. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `request_compaction` deduplicates in-flight requests. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `request_compaction` returns asynchronously while background compaction proceeds. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `request_compaction` logs background compaction failures. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `request_compaction` increments diagnostic counters for volitional requests. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/agents/tools/request-compaction-tool.test.ts` pins precondition errors. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/agents/tools/request-compaction-tool.test.ts` pins threshold ordering. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/agents/tools/request-compaction-tool.test.ts` pins rate-limit ordering. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/agents/tools/request-compaction-tool.test.ts` pins in-flight dedup behavior. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/agents/tools/request-compaction-tool.test.ts` pins background-error handling. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/agents/tools/request-compaction-tool.test.ts` pins reason truncation. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/agents/tools/request-compaction-tool.test.ts` pins counter TTL behavior. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]

### 7. Tool registration and public tool shape

- `src/agents/tools/continuation-tools-registration.test.ts` pins `continue_delegate` registration when continuation is enabled. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `continue_delegate` is absent when draining is explicitly disabled. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `continue_work` appears when the runner wires it. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `targetSessionKey` is intentionally absent from the tool registration schema. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The registration test description points to `binary-canticle#11`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The registration test file still documents a known 240-second hot-test timeout concern. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Open PR #363 is the pending multi-recipient descriptor lane and has no merge SHA at this draft point. [open PR #363]
- Open PR #363 review comments still need a decision on `targetSessionKey` / `targetSessionKeys` fail-open semantics. [open PR #363]

### 8. Agent runner persistence

- `src/auto-reply/reply/agent-runner.ts` owns the ordinary tool-delegate dispatch path. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- The agent-runner persistence helper updates the active session entry. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- The agent-runner persistence helper updates the active session store. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- The agent-runner persistence helper writes through `updateSessionStore`. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- The agent-runner persistence helper cleans legacy chain-state keys while persisting the canonical fields. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- The agent-runner dispatch call consumes tool delegates before persisting returned advanced state. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- The agent-runner callsite persists the returned advanced state after `dispatchToolDelegates`. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- The durable write-back selection is the r3164418100 audit fix. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- The agent-runner fix closes the class of bugs where dispatch advanced chain state but only memory observed the update. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]

### 9. Followup runner persistence

- `src/auto-reply/reply/followup-runner.ts` owns followup-turn delegate draining. [PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`]
- Followup turns build chain state from this turn's token usage. [PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`]
- Followup turns persist token-based chain advancement even when the delegate queue is empty. [PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`]
- The empty-dispatch persistence behavior is the r3164418106 audit fix. [PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`]
- The original followup durability gap was that bare in-memory mutation could orphan disk state. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- #431 recorded the orphan gap exposed by the S2 durability harness. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- `src/auto-reply/reply/followup-runner.ts` now wraps that persistence path in `updateSessionStore`. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- The #432 fix closes #431. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- The followup fix is load-bearing because `persistSessionUsageUpdate` does not patch `continuationChain*` fields. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- The S2 harness now acts as a live regression detector for the followup persistence path. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]

### 10. Child delegate drain

- `src/agents/subagent-announce.ts` drains child continuation queues after subagent settlement. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Child-drain logic imports continuation runtime modules dynamically to avoid cycles. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Child-drain logic dispatches child `continue_delegate` queues. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Child-drain logic persists returned child chain state in memory. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Child-drain logic persists returned child chain state with `updateSessionStore`. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Child-drain logic logs drain failures instead of silently succeeding. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Silent delegate returns inject a system event. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Silent delegate returns can request a heartbeat wake. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- `src/agents/subagent-announce.continuation.test.ts` pins bracket-origin hop seeding. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- `src/agents/subagent-announce.continuation.test.ts` pins canonical hop propagation. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- `src/agents/subagent-announce.continuation.test.ts` pins sticky silent-wake behavior. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- `src/agents/subagent-announce.continuation.test.ts` pins max-chain rejection. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- `src/agents/subagent-announce.continuation.test.ts` pins cost-cap rejection. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- `src/agents/subagent-announce.continuation.test.ts` pins no generation-drift cancellation for delayed hops. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]

### 11. Session store and usage update contract

- `src/config/sessions/store.ts` updates session entries under a store lock. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- `updateSessionStoreEntry` reloads with `{ skipCache: true }` before patching. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- `updateSessionStoreEntry` resolves legacy session keys before patching. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- `updateSessionStoreEntry` applies a `Partial<SessionEntry>` patch via `mergeSessionEntry`. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- `src/auto-reply/reply/session-usage.ts` patches model, provider, context, and usage fields. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- `persistSessionUsageUpdate` patches token counters and estimated cost. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- `persistSessionUsageUpdate` patches `totalTokens` and `totalTokensFresh`. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- `persistSessionUsageUpdate` does not patch `continuationChain*` fields. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- The workorder path `src/config/sessions/session-usage.ts` is stale for this branch. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- The actual usage-persistence file is `src/auto-reply/reply/session-usage.ts`. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]

### 12. Config schema compatibility

- `src/config/schema.base.generated.ts` still contains `continuation.taskFlowDelegates`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `continuation.taskFlowDelegates` is an empty-object compatibility shim. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- The shim matters because the generated schema is strict about additional properties. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- `src/config/zod-schema.continuation.test.ts` pins the legacy key acceptance behavior. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Open PR #368 proposes the TaskFlow-only purge and has no merge SHA at this draft point. [open PR #368]
- Open PR #368 review still requires keeping legacy `taskFlowDelegates` tolerance during upgrade. [open PR #368]
- The final squash should not drop the generated schema shim unless the upgrade-tolerance requirement is intentionally retired. [open PR #368]

### 13. Gateway restart and session delivery

- `src/gateway/server-restart-sentinel.ts` imports session-delivery recovery, drain, and enqueue helpers. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Restart continuation payloads can be represented as `systemEvent`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Restart continuation payloads can be represented as `agentTurn`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Restart continuation payloads carry idempotency keys. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Startup logic enqueues continuation work after restart. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Startup logic wakes the session after restart continuation work is queued. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Startup logic drains pending deliveries. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Startup logic can recover pending deliveries. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Open issue/PR lane #332 remains the broader context-pressure isolation and session-delivery-queue integration tracker. [Project 56 #332, no merge SHA]

### 14. Telemetry and tracer surface

- A continuation tracer surface and `noopTracer` were added before OTEL binding. [PR #378 `d533d5c7205e63a26e0c892fcdd9813feb53d95f`]
- Traceparent payload and chain-budget cap helpers were added as early continuation primitives. [PR #366 `2d10c1c2189563439de59cbf03158057cd913fb0`]
- Chain IDs were added to continuation work spans. [PR #382 `19797e7fa6cdefc4ce278de54baa234b15b98b50`]
- `continuation.work` spans were wired at the runner accept seam. [PR #382 `19797e7fa6cdefc4ce278de54baa234b15b98b50`]
- `continuation.delegate.dispatch` spans were wired at the runner enqueue seam. [PR #383 `3655b0667af5d96f669154388b5221a3ccefcba3`]
- `continuation.disabled` spans were added for cap-rejected dispatches. [PR #384 `4719e86345b0dcf983251b80c0f2310349233d09`]
- Per-turn cap rejection was relanded after review. [PR #385 `6656138126e8b3c650325d6076b18b5100cfec9d`]
- `continuation.delegate.fire` spans were wired. [PR #388 `e959d2c1772aa6625b768ffb367caaa8729dc326`]
- `continuation.work.fire` spans were wired. [PR #391 `47016eb41748a3400e4cfed1d09aefcd618ecce4`]
- `continuation.queue.drain` spans were wired. [PR #395 `560948a70a6feaf9dbb150b7f8e0601725f02f23`]
- `continuation.compaction.released` spans were wired. [PR #397 `cd8b623be20ce307550048ded1af9d9ef2f26164`]
- `signal.kind` was made a single source of truth across release-side wiring. [PR #400 `5e90c859b9784acb09e2ce13dc7fe62970635094`]
- `compaction.id` was added as a cross-cutting continuation attribute. [PR #400 `5e90c859b9784acb09e2ce13dc7fe62970635094`]
- The OTEL adapter was wired into `setContinuationTracer`. [PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`]
- Open PR #361 remains the RFC-only OTEL wiring review lane and has no merge SHA at this draft point. [open PR #361]

### 15. Swim-37 durability harness

- `studies/swim-37/harness/durability/README.md` documents the durability lane scope. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- The durability lane uses real `dispatchToolDelegates`. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- The durability lane uses a temporary disk-backed session store. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- The durability lane uses TaskFlow mocks rather than a live external TaskFlow service. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- `durability-fixture.ts` seeds session entries through real `updateSessionStore`. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- `durability-fixture.ts` reads session entries through `loadSessionStore(skipCache:true)`. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- `durability-fixture.ts` records fake deterministic `spawnSubagentDirect` calls. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- `s1-two-hop-chain.test.ts` proves hop-1 state is reloaded from disk before hop-2. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- `s1-two-hop-chain.test.ts` includes a regression sentinel for skipped persistence producing another `chain-hop:1`. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- `s2-followup-token-chain.test.ts` proves empty delegate dispatch returns `dispatched:0` with advanced token state. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- `s2-followup-token-chain.test.ts` proves `updateSessionStore + persistContinuationChainState` carries the advanced state to disk. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- `s2-followup-token-chain.test.ts` includes the #431 bare-mutation orphan sentinel. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- `s3-restart-roundtrip.test.ts` clears continuation memory to simulate restart. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- `s3-restart-roundtrip.test.ts` reloads disk with `skipCache:true`. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- `s3-restart-roundtrip.test.ts` verifies chain count and tokens survive restart. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- `s3-restart-roundtrip.test.ts` verifies hop-2 resumes after restart. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- `test/vitest/vitest.continuation-durability.config.ts` scopes the harness as `continuation-durability`. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- The durability README still contains historical open-finding language that predates #432. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]

## User-facing release-note shape

### Suggested headline

Canonical2 moves continuation work onto a durable TaskFlow-backed substrate and adds explicit disk-backed proof for continuation chain accounting.

### Suggested short summary

OpenClaw's continuation machinery now stores delegate work through TaskFlow, persists chain state across the ordinary runner, followup runner, and child-drain paths, and documents the remaining pre-squash review lanes.

### Suggested changes

- Continuation delegates now use the TaskFlow-backed store as the canonical substrate. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Post-compaction continuation delegates share that same canonical substrate. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Continuation chain state is durably written after tool-delegate dispatch. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- Followup turns now persist token-based chain advancement even when no delegate dispatches. [PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Child delegate drains now persist advanced chain state after subagents return. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- A swim-37 durability harness captures two-hop, followup-token, and restart roundtrip proofs. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Continuation spans and OTEL adapter wiring make the new flow observable. [PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`]

### Suggested fixes

- Fixed a tool-delegate path that advanced chain state without a durable write-back. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- Fixed a followup-turn path that lost token-chain advancement when no delegate was dispatched. [PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`]
- Fixed child-drain chain persistence after a subagent returned. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Fixed the #431 disk orphan by wrapping followup-runner persistence in `updateSessionStore`. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Preserved legacy `continuation.taskFlowDelegates` config tolerance for one upgrade cycle. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]

## Verified contracts from source review

- Contract: continuation delegates are queued through the canonical TaskFlow store. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Contract: post-compaction delegates use the same canonical substrate. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Contract: legacy `taskFlowDelegates` config is tolerated by schema validation. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Contract: ordinary runner delegate dispatch persists advanced chain state to disk. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- Contract: followup runner persists advanced token-chain state on `dispatched === 0`. [PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Contract: child delegate drains persist advanced child chain state. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Contract: session-store updates reload from disk with `skipCache:true` before patching. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Contract: usage persistence does not substitute for continuation chain persistence. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Contract: restart roundtrip proof clears process memory and reloads disk state. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Contract: TaskFlow delayed timers remain process-local while delegate queue state is durable. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Contract: context-pressure warnings enter the system-event queue, not a token-delta channel message. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Contract: `request_compaction` is guarded by active-session, session-id, reason, threshold, rate-limit, and in-flight dedup checks. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Contract: continuation spans can be emitted through the continuation tracer surface before OTEL adapter binding. [PR #378 `d533d5c7205e63a26e0c892fcdd9813feb53d95f`; PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`]

## Test surfaces to keep in the final candidate

- Keep `src/auto-reply/continuation/delegate-store.test.ts`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Keep `src/auto-reply/continuation-delegate-store.test.ts`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Keep `src/auto-reply/continuation-delegate-store.post-compaction-substrate.test.ts`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Keep `src/auto-reply/reply/context-pressure.test.ts`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Keep `src/auto-reply/reply/context-pressure.integration.test.ts`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Keep `src/auto-reply/reply/continuation-runtime.test.ts`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Keep `src/auto-reply/reply/post-compaction-context.test.ts`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Keep `src/agents/tools/request-compaction-tool.test.ts`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Keep `src/agents/tools/continuation-tools-registration.test.ts`. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Keep `src/agents/subagent-announce.continuation.test.ts`. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Keep `studies/swim-37/harness/durability/s1-two-hop-chain.test.ts`. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Keep `studies/swim-37/harness/durability/s2-followup-token-chain.test.ts`. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Keep `studies/swim-37/harness/durability/s3-restart-roundtrip.test.ts`. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Keep `test/vitest/vitest.continuation-durability.config.ts`. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Keep continuation tracer tests that pin span names and attributes. [PR #382 `19797e7fa6cdefc4ce278de54baa234b15b98b50`; PR #388 `e959d2c1772aa6625b768ffb367caaa8729dc326`; PR #400 `5e90c859b9784acb09e2ce13dc7fe62970635094`]

## Verification punchlist summary

- Confirm open PR #368 is either merged or explicitly deferred with the legacy schema shim intact. [open PR #368]
- Confirm open PR #361 is either merged or explicitly deferred without breaking current OTEL adapter evidence. [open PR #361]
- Confirm open PR #363 is either merged or explicitly deferred with descriptor fail-open semantics resolved. [open PR #363]
- Confirm generated schema and docs baselines are not changed to silence drift. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Confirm the final squash preserves `taskFlowDelegates` legacy tolerance for the upgrade window. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; open PR #368]
- Confirm the final squash preserves the #427 ordinary runner durable write-back. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- Confirm the final squash preserves the #428 followup `dispatched === 0` state advancement. [PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`]
- Confirm the final squash preserves the #432 `updateSessionStore` disk wrap. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Confirm the final squash preserves the #429 child-drain disk persistence. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Confirm the final squash preserves the swim-37 durability project configuration. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Confirm final candidate validation is run on the actual squash SHA, not only on canonical2 child PRs. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Confirm phantom or superseded CI from unrelated heads is not treated as final-candidate evidence. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Confirm `package.json` remains `2026.4.24` for this lane. [workorder]
- Confirm no `frond.1`, `.27`, or other fork-line version string is introduced. [workorder]
- Confirm release-note artifacts are not landed or merged by this lane. [workorder]

## Open decisions before squash

- Decide whether #368 lands before squash or remains deferred with strict legacy key tolerance retained. [open PR #368]
- Decide whether #361 lands before squash or remains an RFC-only follow-up. [open PR #361]
- Decide whether #363 lands before squash or waits for descriptor fail-open review resolution. [open PR #363]
- Decide whether the durability README should be updated to remove pre-#432 open-finding wording. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Decide whether `INTEGRATION-TEST-GAP-MAP.md` should be refreshed to mark #431 as closed by #432. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Decide whether the final upstream PR body should include the full audit-lane provenance table or a compressed form. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Decide whether the final candidate should group commits as substrate, observability, durability, and release docs. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`; PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]

## Candidate four-commit squash topology

- Commit 1: TaskFlow continuation substrate and config compatibility. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Commit 1 includes canonical delegate store, compatibility shim, post-compaction substrate alignment, and legacy `taskFlowDelegates` tolerance. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Commit 2: continuation tracing, context-pressure, and request-compaction observability surfaces. [PR #366 `2d10c1c2189563439de59cbf03158057cd913fb0`; PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`]
- Commit 2 includes span wiring, OTEL adapter, context-pressure queue behavior, and `request_compaction` guard behavior. [PR #388 `e959d2c1772aa6625b768ffb367caaa8729dc326`; PR #397 `cd8b623be20ce307550048ded1af9d9ef2f26164`; PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Commit 3: durability fixes for ordinary runner, followup runner, and child-drain paths. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`; PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`; PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Commit 3 includes the #431 disk orphan fix. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Commit 4: swim-37 durability harness and release-highlight documentation. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #421 `29e556eb11de7ee7de9e4dadda8bdb2baf3a5dab`]
- Commit 4 includes S1/S2/S3 tests and the continuation-durability Vitest project. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- This topology is a proposal for review, not an instruction executed by this release-note lane. [workorder]

## Provenance ledger

| Area                          | Evidence                                                  | Provenance                                         |
| ----------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| TaskFlow delegate substrate   | canonical store and compatibility shim                    | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a` |
| Legacy config tolerance       | generated schema and Zod test accept `taskFlowDelegates`  | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a` |
| Post-compaction substrate     | tool and runner resolve same substrate                    | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a` |
| Ordinary runner persistence   | returned chain state written through store and disk       | PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18` |
| Followup token persistence    | `dispatched === 0` still advances chain tokens            | PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07` |
| Child-drain persistence       | returned child chain state written through store and disk | PR #429 `dc572c01062a8da9a337039c87c1eb09288af640` |
| Durability harness            | S1/S2/S3 disk roundtrip tests                             | PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789` |
| #431 fix                      | followup persistence wrapped in `updateSessionStore`      | PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12` |
| OTEL adapter                  | `setContinuationTracer` wired to adapter                  | PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b` |
| Release highlights            | release-highlights docs reparented onto canonical2        | PR #421 `29e556eb11de7ee7de9e4dadda8bdb2baf3a5dab` |
| Chain budget primitive        | traceparent and chain-budget cap helper                   | PR #366 `2d10c1c2189563439de59cbf03158057cd913fb0` |
| Tracer primitive              | continuation tracer surface and noop tracer               | PR #378 `d533d5c7205e63a26e0c892fcdd9813feb53d95f` |
| Runner accept span            | `continuation.work` at runner accept seam                 | PR #382 `19797e7fa6cdefc4ce278de54baa234b15b98b50` |
| Runner enqueue span           | `continuation.delegate.dispatch` at runner enqueue seam   | PR #383 `3655b0667af5d96f669154388b5221a3ccefcba3` |
| Disabled span                 | cap-rejected disabled dispatch spans                      | PR #384 `4719e86345b0dcf983251b80c0f2310349233d09` |
| Per-turn cap reland           | per-turn cap rejection behavior                           | PR #385 `6656138126e8b3c650325d6076b18b5100cfec9d` |
| Delegate fire span            | `continuation.delegate.fire`                              | PR #388 `e959d2c1772aa6625b768ffb367caaa8729dc326` |
| Work fire span                | `continuation.work.fire`                                  | PR #391 `47016eb41748a3400e4cfed1d09aefcd618ecce4` |
| Queue drain span              | `continuation.queue.drain`                                | PR #395 `560948a70a6feaf9dbb150b7f8e0601725f02f23` |
| Compaction release span       | `continuation.compaction.released`                        | PR #397 `cd8b623be20ce307550048ded1af9d9ef2f26164` |
| Signal kind and compaction ID | shared continuation attributes                            | PR #400 `5e90c859b9784acb09e2ce13dc7fe62970635094` |

## Final-candidate readiness note

The canonical2 implementation tip has the core TaskFlow substrate and the audit-lane durability fixes in place. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`; PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`; PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]

The final candidate still needs reviewer decisions on open PR #368, open PR #361, and open PR #363 before this draft should be treated as the upstream PR description source of truth. [open PR #368; open PR #361; open PR #363]

The final candidate should validate the exact squash SHA and should not rely only on historical child-PR green states. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]

## Appendix A: source evidence ledger

| Source path                                                                    | Release-note significance                                            | Provenance                                                                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/auto-reply/continuation/delegate-store.ts`                                | Canonical TaskFlow-backed continuation delegate store                | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/delegate-store.ts`                                | Ordinary delegate controller ID is `core/continuation-delegate`      | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/delegate-store.ts`                                | Post-compaction controller ID is `core/continuation-post-compaction` | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/delegate-store.ts`                                | Zod validation gates queued delegate payloads                        | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/delegate-store.ts`                                | Corrupt TaskFlow records are failed, not silently consumed           | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/delegate-store.ts`                                | Released records are finished with release metadata                  | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/delegate-store.test.ts`                           | Canonical store FIFO and session-isolation coverage                  | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/delegate-store.test.ts`                           | Post-compaction controller separation coverage                       | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/delegate-store.test.ts`                           | Delayed reservation due-time coverage                                | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation-delegate-store.ts`                                | Compatibility import path for old callsites                          | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation-delegate-store.ts`                                | Documents removal of volatile Map fallback                           | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation-delegate-store.ts`                                | Documents removal of runtime TaskFlow delegate gate                  | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation-delegate-store.test.ts`                           | Compatibility shim smoke coverage                                    | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation-delegate-store.post-compaction-substrate.test.ts` | Single-substrate proof for post-compaction staging                   | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/types.ts`                                         | Canonical delegate, reservation, request, and chain types            | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation-delegate.types.ts`                                | Compatibility re-export for canonical types                          | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/state.ts`                                         | Pending-delegate truth derives from TaskFlow                         | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/state.ts`                                         | Chain-state load and persist helpers are centralized                 | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/config.ts`                                        | Canonical continuation runtime config resolver                       | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/scheduler.ts`                                     | Continue-work scheduling and delayed reservation behavior            | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/delegate-dispatch.ts`                             | TaskFlow delegate consumption and chain-budget enforcement           | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/continuation/delegate-dispatch.ts`                             | Returned advanced chain state feeds caller persistence               | PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`                                                     |
| `src/auto-reply/reply/context-pressure.ts`                                     | Context pressure enters the system-event path                        | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/reply/context-pressure.test.ts`                                | Threshold, banding, dedup, and stale-token unit coverage             | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/reply/context-pressure.integration.test.ts`                    | Queue visibility and prompt-drain integration coverage               | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/reply/continuation-runtime.ts`                                 | Reply-local runtime defaults and clamps                              | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/reply/continuation-runtime.test.ts`                            | Runtime config clamp and max-delegate tests                          | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/reply/continuation-state.ts`                                   | Reply-local timer and generation state                               | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/reply/continuation-state.runtime.ts`                           | Runtime access to reply-local continuation state helpers             | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/reply/post-compaction-context.test.ts`                         | Post-compaction context extraction and path-safety coverage          | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/agents/tools/request-compaction-tool.ts`                                  | Active-session, threshold, rate-limit, and dedup guards              | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/agents/tools/request-compaction-tool.test.ts`                             | Request-compaction guard ordering and error coverage                 | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/agents/tools/continuation-tools-registration.test.ts`                     | Tool-schema surface and registration gating coverage                 | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/auto-reply/reply/agent-runner.ts`                                         | Ordinary tool-delegate durable write-back                            | PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`                                                     |
| `src/auto-reply/reply/followup-runner.ts`                                      | Followup token advancement on empty dispatch                         | PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`                                                     |
| `src/auto-reply/reply/followup-runner.ts`                                      | Followup disk persistence through `updateSessionStore`               | PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`                                                     |
| `src/agents/subagent-announce.ts`                                              | Child delegate-drain persistence after subagent return               | PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`                                                     |
| `src/agents/subagent-announce.ts`                                              | Silent delegate return as system event plus wake                     | PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`                                                     |
| `src/agents/subagent-announce.continuation.test.ts`                            | Child-drain hop, cap, cost, and delayed-hop coverage                 | PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`                                                     |
| `src/config/zod-schema.continuation.test.ts`                                   | Legacy `taskFlowDelegates` acceptance coverage                       | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/config/schema.base.generated.ts`                                          | Generated strict-schema compatibility shim                           | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/gateway/server-restart-sentinel.ts`                                       | Restart continuation queue build, wake, drain, and recovery          | PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`                                                     |
| `src/config/sessions/store.ts`                                                 | Disk-rehydrate patch contract via `skipCache:true`                   | PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`                                                     |
| `src/auto-reply/reply/session-usage.ts`                                        | Usage patch excludes continuation chain fields                       | PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`                                                     |
| `studies/swim-37/harness/durability/README.md`                                 | Durability harness scope and caveats                                 | PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`                                                     |
| `studies/swim-37/harness/durability/durability-fixture.ts`                     | Disk-backed session fixture and deterministic spawn recorder         | PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`                                                     |
| `studies/swim-37/harness/durability/s1-two-hop-chain.test.ts`                  | Two-hop chain-state disk roundtrip                                   | PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`                                                     |
| `studies/swim-37/harness/durability/s2-followup-token-chain.test.ts`           | Followup token-chain disk roundtrip and #431 sentinel                | PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12` |
| `studies/swim-37/harness/durability/s3-restart-roundtrip.test.ts`              | Restart roundtrip after clearing process memory                      | PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`                                                     |
| `test/vitest/vitest.continuation-durability.config.ts`                         | Dedicated continuation durability Vitest project                     | PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`                                                     |
| `INTEGRATION-TEST-GAP-MAP.md`                                                  | Historical #431 finding context, superseded by #432 for that gap     | PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12` |
| `src/continuation-tracer` surfaces                                             | Additive tracer surface before OTEL binding                          | PR #378 `d533d5c7205e63a26e0c892fcdd9813feb53d95f`                                                     |
| continuation span wiring                                                       | Chain ID and runner accept spans                                     | PR #382 `19797e7fa6cdefc4ce278de54baa234b15b98b50`                                                     |
| continuation span wiring                                                       | Runner enqueue dispatch spans                                        | PR #383 `3655b0667af5d96f669154388b5221a3ccefcba3`                                                     |
| continuation span wiring                                                       | Disabled/cap-rejected spans                                          | PR #384 `4719e86345b0dcf983251b80c0f2310349233d09`; PR #385 `6656138126e8b3c650325d6076b18b5100cfec9d` |
| continuation span wiring                                                       | Delegate-fire spans                                                  | PR #388 `e959d2c1772aa6625b768ffb367caaa8729dc326`                                                     |
| continuation span wiring                                                       | Work-fire spans                                                      | PR #391 `47016eb41748a3400e4cfed1d09aefcd618ecce4`                                                     |
| continuation span wiring                                                       | Queue-drain spans                                                    | PR #395 `560948a70a6feaf9dbb150b7f8e0601725f02f23`                                                     |
| continuation span wiring                                                       | Compaction-release spans                                             | PR #397 `cd8b623be20ce307550048ded1af9d9ef2f26164`                                                     |
| continuation span wiring                                                       | `signal.kind` and `compaction.id` attributes                         | PR #400 `5e90c859b9784acb09e2ce13dc7fe62970635094`                                                     |
| OTEL adapter                                                                   | Adapter wired into `setContinuationTracer`                           | PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`                                                     |
| release highlights                                                             | Release-highlight docs reparented onto canonical2                    | PR #421 `29e556eb11de7ee7de9e4dadda8bdb2baf3a5dab`                                                     |

## Appendix B: final reviewer question bank

- Should #368 land before the squash, or should the TaskFlow-only purge remain deferred? [open PR #368]
- If #368 lands, does strict schema validation still tolerate legacy `taskFlowDelegates`? [open PR #368; PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Should #361 land before the squash, or should RFC-only OTEL follow-up stay out of the upstream candidate? [open PR #361]
- If #361 is deferred, is PR #422's OTEL adapter sufficient for this release note? [open PR #361; PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`]
- Should #363 land before the squash, or should descriptor multi-recipient behavior wait? [open PR #363]
- If #363 is deferred, does the final PR body need to call out that `targetSessionKey` remains absent? [open PR #363; PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Should `studies/swim-37/harness/durability/README.md` remove stale pre-#432 "open finding" language before squash? [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Should `INTEGRATION-TEST-GAP-MAP.md` mark #431 as closed by #432 before squash? [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Should the final upstream PR body include the full provenance ledger? [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Should the final upstream PR body compress provenance to the six audit-lane PRs only? [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`; PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`; PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`; PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Should the final validation explicitly run the continuation-durability Vitest project? [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Should the final validation include `pnpm check:changed` from the squash SHA? [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Should the final validation include `pnpm test:changed` from the squash SHA? [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Should the final validation include a full `pnpm check` sweep if packaging or generated surfaces changed? [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Should the final candidate preserve release-note docs as separate artifacts or keep them out of the upstream PR? [workorder]
- Should the final squash include release-highlights reparenting from #421? [PR #421 `29e556eb11de7ee7de9e4dadda8bdb2baf3a5dab`]
- Should the final squash keep the swim-37 durability harness under `studies/`? [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Should the final squash move any durability proof into a production test directory? [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Should the final PR mention that delayed timers remain process-local by design? [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Should the final PR mention that TaskFlow records are the durable unit, not timer handles? [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Should the final PR mention that followup usage persistence is not enough for continuation-chain persistence? [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Should the final PR mention that child-drain persistence is separate from ordinary runner persistence? [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Should the final PR mention that #431 is closed only after #432, not by #430 alone? [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Should the final PR mention that open PR #363 is not required for the current single-target tool schema? [open PR #363; PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Should the final PR mention that open PR #361 is not required for the current adapter hook? [open PR #361; PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`]
- Should the final PR mention that open PR #368 is load-bearing if the team wants to purge transitional gates before upstreaming? [open PR #368]
- Should the final PR call this "continuation" rather than "auto-reply" in user-facing prose? [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Should the final PR avoid product docs wording like `extensions/` for plugin-facing text? [workorder]
- Should the final PR state that no version bump is part of canonical2? [workorder]
- Should the final PR state that the final squash must be validated independently from release-note commits? [workorder]
- Should the final PR state that `feature/context-pressure-squashed` is the intended presentation branch? [workorder]
- Should the final PR mention `openclaw/openclaw#38780` only as historical context and avoid re-engagement? [workorder]
- Should the final PR include direct links to #423, #427, #428, #429, #430, and #432? [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]

## Appendix C: copy bank for final release notes

- "Continuation delegates now persist through TaskFlow instead of process-local delegate maps." [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- "Post-compaction continuation delegates now share the same TaskFlow substrate as ordinary delegates." [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- "OpenClaw keeps a one-cycle compatibility shim for legacy `continuation.taskFlowDelegates` config." [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- "The ordinary runner now writes advanced continuation chain state through the durable session store." [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- "Followup turns now preserve token-chain progress even when no delegate dispatches." [PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- "Child delegate drains now persist chain progress after subagents return." [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- "The durability harness now covers a two-hop chain, a followup-token chain, and a restart roundtrip." [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- "The #431 followup disk-orphan is fixed by wrapping followup persistence in `updateSessionStore`." [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- "Continuation tracing now has an OTEL adapter hook." [PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`]
- "Continuation spans now carry chain and compaction attributes needed by swim-37 probes." [PR #382 `19797e7fa6cdefc4ce278de54baa234b15b98b50`; PR #400 `5e90c859b9784acb09e2ce13dc7fe62970635094`]
- "Context pressure now routes through system events rather than channel-token messages." [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- "`request_compaction` is guarded by active-session, threshold, rate-limit, and dedup checks." [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- "The final squash should preserve the generated schema compatibility shim." [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; open PR #368]
- "The final squash should preserve S2 as a regression detector for followup disk persistence." [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- "The final candidate should validate the exact squash SHA rather than historic child PR heads." [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]

## Appendix D: known non-goals for this draft

- This draft does not claim #368 is merged. [open PR #368]
- This draft does not claim #361 is merged. [open PR #361]
- This draft does not claim #363 is merged. [open PR #363]
- This draft does not claim a final squash exists yet. [workorder]
- This draft does not claim `feature/context-pressure-squashed` has been updated by this lane. [workorder]
- This draft does not claim CI passed on a final squash SHA. [workorder]
- This draft does not claim local tests were run while writing release notes. [workorder]
- This draft does not claim `package.json` changed from `2026.4.24`. [workorder]
- This draft does not claim the historical upstream #38780 comment was re-opened or re-engaged. [workorder]
- This draft does not claim release-note commits are part of the implementation candidate. [workorder]
- This draft does not claim the old volatile delegate Map is still a valid fallback. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- This draft does not claim process-local timer handles are durable. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- This draft does not claim usage persistence alone carries continuation chain state. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- This draft does not claim #430 alone fixed the #431 orphan. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- This draft does not claim the TaskFlow-only purge can drop upgrade tolerance without review. [open PR #368]
- This draft does not claim multi-recipient descriptors are part of the merged canonical tip. [open PR #363]
- This draft does not claim RFC-only OTEL follow-up is part of the merged canonical tip. [open PR #361]
- This draft does not claim release-highlight docs are a substitute for durability tests. [PR #421 `29e556eb11de7ee7de9e4dadda8bdb2baf3a5dab`; PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]

## Appendix E: final PR body ingredients

- Ingredient: one sentence on TaskFlow substrate adoption. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Ingredient: one sentence on config upgrade tolerance. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`]
- Ingredient: one sentence on ordinary runner durable write-back. [PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`]
- Ingredient: one sentence on followup empty-dispatch token persistence. [PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`]
- Ingredient: one sentence on child-drain persistence. [PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`]
- Ingredient: one sentence on the #431 / #432 disk-orphan fix. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Ingredient: one sentence on the S1/S2/S3 durability harness. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Ingredient: one sentence on continuation span / OTEL evidence. [PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`]
- Ingredient: one sentence on open PR decisions. [open PR #368; open PR #361; open PR #363]
- Ingredient: one sentence on exact-SHA validation expectations. [PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Ingredient: one sentence that the version remains `2026.4.24`. [workorder]
- Ingredient: one sentence that the release-note lane landed nothing. [workorder]
- Ingredient: one sentence that `feature/context-pressure-squashed` is the intended presentation branch. [workorder]
- Ingredient: one sentence that historical upstream #38780 is reference-only. [workorder]
- Ingredient: one sentence that final validation must not count phantom CI from unrelated heads. [workorder]

## Appendix F: maintainer-ready recommendation

- Recommendation: treat the implementation as ready for figs review after open PR #368, #361, and #363 are explicitly resolved or deferred. [open PR #368; open PR #361; open PR #363]
- Recommendation: treat #423, #427, #428, #429, #430, and #432 as the required audit-lane provenance set. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`; PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`; PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`; PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`; PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Recommendation: keep #422 in the provenance set when describing OTEL adapter readiness. [PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`]
- Recommendation: keep #421 in the provenance set only when describing release-highlight documentation reparenting. [PR #421 `29e556eb11de7ee7de9e4dadda8bdb2baf3a5dab`]
- Recommendation: do not advertise the final candidate as validated until checks run on the final squash SHA. [workorder]
- Recommendation: include the compatibility-shim caveat near any TaskFlow-only purge wording. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; open PR #368]
- Recommendation: mention #431 only as closed by #432, not as an open defect. [PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`]
- Recommendation: keep the release-note copy focused on durability, substrate adoption, and proof rather than the long internal swim lineage. [PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`; PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`]
- Recommendation: use the short `PR-DESCRIBE.md` paragraph as the upstream PR seed only after the open PR decisions are resolved. [open PR #368; open PR #361; open PR #363]
- Recommendation: use `VERIFICATION-PUNCHLIST.md` as the pre-squash checklist, not as proof that validation already ran. [workorder]
