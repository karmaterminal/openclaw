- 2026-05-03T19:24:00+00:00: workorder authored with figs's verbatim feedback embedded; Q7 chain-budget anti-flood added per figs lines 156-158; agent dispatch pending figs's explicit go
- 2026-05-03T19:45:00+00:00: §1 reads done, scope understood, starting audit. Required sources read: docs/design/continue-work-signal-v2.md §3.3 and §6.6-§6.7, figs-rfc-feedback-0807Z-VERBATIM.txt, continuation targeting/dispatch/release code, session-delivery-queue substrate, and targeted trace-context grep. Source-of-truth audit questions map to figs feedback lines 75-88 for trace shape/incoming tool-token trace context and lines 156-158 for chain-budget-capped span emission. RFC currently calls out the exact open audit at docs/design/continue-work-signal-v2.md:510-512: queue/system-event payloads can carry W3C traceparent, but targeted delegate-return preservation needs implementation audit.
- 2026-05-03T20:03:00+00:00: First concrete §2 finding: Q1 producer-side IN is GAP. The `continue_delegate` tool schema exposes `task`, `delaySeconds`, `mode`, `targetSessionKey`, `targetSessionKeys`, and `fanoutMode`, but no `traceparent` / traceID / parent_span carrier (`src/agents/tools/continue-delegate-tool.ts:23-64`), and execution only reads those same fields before enqueue/stage (`src/agents/tools/continue-delegate-tool.ts:142-176`, `:196-225`). The bracket parser's directive state likewise contains only silent/silentWake/target/fanout fields (`src/auto-reply/tokens.ts:196-202`), parses only target/targets/fanout assignments (`src/auto-reply/tokens.ts:241-278`), and returns no trace carrier in the delegate signal (`src/auto-reply/tokens.ts:371-380`). TaskFlow delegate state persists task/delay/mode/target/fanout only (`src/auto-reply/continuation/delegate-store.ts:54-66`, `:121-140`). This directly answers figs feedback lines 84-88: tool/token do not accept traceID/parent span today.

## Declare-done audit report — otel traceparent propagation

Verdict: **PARTIAL-GAPS**. The low-level substrate has additive `traceparent` fields and the diagnostics-otel adapter can parent-stitch spans when a caller supplies `StartSpanOptions.traceparent`, but the delegate producer, return, targeted fanout, and restart/recovery deliverer call sites do not currently thread a child-return traceparent through the paths figs asked about.

Source anchors:

- figs's desired trace shape is explicit at `figs-rfc-feedback-0807Z-VERBATIM.txt:75-82`: root span -> depth-1 delegate span -> deeper delegate span -> return keeps trace id and parent span.
- figs's producer-side question is explicit at `figs-rfc-feedback-0807Z-VERBATIM.txt:84-88`: return/context may belong in §3.3/TaskFlow, and "tool and token should accept traceID/parent span to propagate".
- figs's anti-flood rule is explicit at `figs-rfc-feedback-0807Z-VERBATIM.txt:156-158`: multi-recipient fan-out must cap span emission by chain step count, not recipient count.
- The RFC already identifies the same audit seam at `docs/design/continue-work-signal-v2.md:510-512`: system events and queued deliveries can carry W3C `traceparent`, diagnostics-otel can stitch to supplied traceparent, but targeted delegate-return delivery currently resolves recipients and enqueues completion text without visibly threading child-return `traceparent`.

### Q1 — Producer-side IN (`traceID` / `parent_span` into `continue_delegate`)

**Status: GAP / UNTESTED.**

Findings:

- The `continue_delegate` tool descriptor does not accept a trace carrier. Its schema exposes `task`, `delaySeconds`, `mode`, `targetSessionKey`, `targetSessionKeys`, and `fanoutMode`; there is no `traceparent`, traceID, spanID, or parent_span field (`src/agents/tools/continue-delegate-tool.ts:23-64`).
- Tool execution reads only `task`, `delaySeconds`, `mode`, targeting, and fanout, then stages/enqueues those fields (`src/agents/tools/continue-delegate-tool.ts:142-176`, `src/agents/tools/continue-delegate-tool.ts:196-225`).
- The bracket directive state is silent/silentWake/target/fanout only (`src/auto-reply/tokens.ts:196-202`), the assignment parser handles only `target`, `targets`, and `fanout` after the silent options (`src/auto-reply/tokens.ts:241-278`), and the returned delegate signal carries task/delay/silent/target/fanout only (`src/auto-reply/tokens.ts:371-380`).
- The runtime pending delegate type and TaskFlow persistence omit any trace carrier: `PendingContinuationDelegate` has task/delay/mode/firstArmedAt/target/fanout only (`src/auto-reply/continuation/types.ts:56-64`), `PendingDelegateStateSchema` has the same durable fields (`src/auto-reply/continuation/delegate-store.ts:54-66`), and `buildDelegateState` writes only those fields (`src/auto-reply/continuation/delegate-store.ts:121-140`).
- The tracer surface is ready but not wired from this path. `StartSpanOptions.traceparent` exists (`src/infra/continuation-tracer.ts:247-264`) and diagnostics-otel parent-stitches it with `trace.setSpanContext` when supplied (`extensions/diagnostics-otel/src/continuation-tracer-adapter.ts:143-158`), but `emitContinuationDelegateSpan` takes no traceparent argument and starts `continuation.delegate.dispatch` with attributes only (`src/infra/continuation-tracer.ts:422-447`). Agent-runner call sites likewise pass chain id/remaining/delay/mode but no traceparent (`src/auto-reply/reply/agent-runner.ts:2267-2274`, `src/auto-reply/reply/agent-runner.ts:2684-2691`).

Existing tests: `src/auto-reply/continuation/delegate-dispatch.test.ts:256-282` proves targeting metadata reaches spawned continuation runs, but it does not assert any trace carrier. `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts:114-138` proves the adapter stitches a parent when a valid traceparent is supplied, not that delegate producer paths supply one.

Seams to wire: `src/agents/tools/continue-delegate-tool.ts` schema/execution; `src/auto-reply/tokens.ts` bracket parser and `ContinuationSignal`; `src/auto-reply/continuation/types.ts` and `delegate-store.ts`; the producer-side span helpers/call sites in `src/infra/continuation-tracer.ts` and `src/auto-reply/reply/agent-runner.ts`; plus the spawn/run metadata seam so the child can later return with the correct producer span context.

### Q2 — Return-side direct/default path

**Status: GAP / UNTESTED.**

Findings:

- Silent/default return injects an internal system event with only `{ sessionKey }`; it does not pass `traceparent` (`src/agents/subagent-announce.ts:1244-1258`).
- Silent-wake then requests a heartbeat with session/reason/parentRunId only (`src/agents/subagent-announce.ts:1263-1269`).
- Visible/direct return calls `deliverSubagentAnnouncement` with route/provenance/idempotency fields and `continuationTriggerOverride`, but no trace carrier (`src/agents/subagent-announce.ts:1277-1305`).
- `deliverSubagentAnnouncement` has no traceparent parameter in its public parameter object (`src/agents/subagent-announce-delivery.ts:883-906`). Its direct gateway call sends `sessionKey`, `message`, delivery route, `inputProvenance`, `continuationTrigger`, and `idempotencyKey`, again without trace context (`src/agents/subagent-announce-delivery.ts:779-811`). Its fallback direct send likewise has no trace field (`src/agents/subagent-announce-delivery.ts:596-606`).
- The current shipped span vocabulary explicitly says the old `continuation.delegate.return` name is not current (`docs/design/continue-work-signal-v2.md:1178-1190`), so there is no return-side span helper that could currently thread the returning child as parent.
- The system-event substrate can carry a traceparent (`src/infra/system-events.ts:18-34`, `src/infra/system-events.ts:48-58`, `src/infra/system-events.ts:120-142`), but the default return call sites above do not supply it. The drain helper emits only aggregate queue counts and leaves structural traceparent reconstruction to a concrete adapter (`src/auto-reply/reply/session-system-events.ts:96-113`); `emitContinuationQueueDrainSpan` has no traceparent input and starts an aggregate span with count attributes only (`src/infra/continuation-tracer.ts:704-725`).

Existing tests: `src/agents/subagent-announce.silent-wake.test.ts:217-250` proves silent-wake enqueues a system event and heartbeat for the requester session, but the asserted event options contain only `sessionKey`; no traceparent is asserted. No direct/default return test found that asserts trace continuity.

Seams to wire: `runSubagentAnnounceFlow` should capture/receive the returning child traceparent and pass it through both silent system-event and visible/direct delivery. `deliverSubagentAnnouncement`, announce queue items, direct gateway params, and fallback send/provenance types need an additive trace-context field if direct returns are expected to stitch successor-turn/return-completion spans.

### Q3 — Return-side targeted single recipient

**Status: GAP / UNTESTED.**

Findings:

- Targeted return resolves target keys and calls `enqueueContinuationReturnDeliveries` with target keys, text, idempotency key, wake policy, and childRunId only (`src/agents/subagent-announce.ts:1189-1214`).
- `enqueueContinuationReturnDeliveries` has no traceparent parameter (`src/auto-reply/continuation/targeting.ts:89-99`). For each target it writes a `systemEvent` payload containing kind/sessionKey/text/deliveryContext/idempotencyKey only (`src/auto-reply/continuation/targeting.ts:105-114`), then calls `enqueueSystemEvent` with text/sessionKey/deliveryContext only (`src/auto-reply/continuation/targeting.ts:118-121`).
- This is the exact RFC TODO seam: recipient resolution and enqueue happen, but no child-return traceparent is threaded (`docs/design/continue-work-signal-v2.md:510-512`).

Existing tests: `src/auto-reply/continuation/cross-session-targeting.test.ts:19-26` proves `targetSessionKey` resolves to one other session, and `src/auto-reply/continuation/cross-session-targeting.test.ts:57-111` proves payload text/order/heartbeat/ack behavior for target delivery. The test does not assert traceparent in either queued payloads or system-event options.

Seam to wire: add a `traceparent` field to `enqueueContinuationReturnDeliveries` params and pass it to both `enqueueSessionDelivery` payloads and `enqueueSystemEvent`; then feed that param from `runSubagentAnnounceFlow` using the child-return span context.

### Q4 — Return-side multi-recipient explicit `targetSessionKeys`

**Status: GAP / UNTESTED.**

Findings:

- Explicit multiple targets normalize/dedupe into an ordered list (`src/auto-reply/continuation/targeting.ts:68-72`), and `enqueueContinuationReturnDeliveries` loops every target (`src/auto-reply/continuation/targeting.ts:105-130`).
- Every recipient receives the same text payload, but the queued payload and in-memory system event omit traceparent for every recipient (`src/auto-reply/continuation/targeting.ts:105-121`). Therefore all recipients receive no returning trace context rather than all recipients preserving it.

Existing tests: `src/auto-reply/continuation/cross-session-targeting.test.ts:28-35` covers targetSessionKeys ordering/dedupe, and `src/auto-reply/continuation/cross-session-targeting.test.ts:57-111` covers byte-identical payloads to two recipients. The byte-identical assertion only checks text/sessionKey/system-event delivery; traceparent is not in the fixture or expectations.

Seam to wire: same helper seam as Q3, plus tests that assert each queued payload and each immediate system-event enqueue receives the same valid traceparent.

### Q5 — Return-side `fanoutMode: "tree" | "all"`

**Status: GAP / UNTESTED.**

Findings:

- `fanoutMode: "tree"` returns normalized ancestor keys; `fanoutMode: "all"` returns normalized all-session keys (`src/auto-reply/continuation/targeting.ts:48-66`).
- The return path populates `treeSessionKeys` from the subagent registry and `allSessionKeys` by enumerating all known local session-store keys, then calls the same traceparent-blind delivery helper (`src/agents/subagent-announce.ts:1192-1214`).
- The host-wide enumerator returns all normalized store keys sorted; no trace/cap metadata is carried with those keys (`src/agents/subagent-announce.ts:100-117`).

Existing tests: `src/auto-reply/continuation/cross-session-targeting.test.ts:37-55` verifies `fanoutMode=tree` and `fanoutMode=all` key resolution only. It does not exercise queue payload traceparent, OTel parent stitching, or return-side span continuity.

Seam to wire: same as Q3/Q4, with `runSubagentAnnounceFlow` passing a child-return traceparent into the delivery helper after resolving tree/all recipients.

### Q6 — Recovery replay after gateway restart

**Status: PARTIAL / UNTESTED end-to-end.**

What works:

- The durable session-delivery queue has an additive `traceparent` metadata field (`src/infra/session-delivery-queue-storage.ts:52-58`) and every payload kind intersects that metadata (`src/infra/session-delivery-queue-storage.ts:67-99`).
- Queue writes serialize the full entry as JSON and reads parse the full entry back (`src/infra/session-delivery-queue-storage.ts:202-213`); `enqueueSessionDelivery` writes `...params` into the entry (`src/infra/session-delivery-queue-storage.ts:297-302`); `loadPendingSessionDelivery` returns the parsed entry (`src/infra/session-delivery-queue-storage.ts:353-364`).
- Storage has a direct round-trip test for traceparent metadata (`src/infra/session-delivery-queue.storage.test.ts:49-80`).
- Recovery passes the full queued entry to the caller-provided deliver function (`src/infra/session-delivery-queue-recovery.ts:146-156`, `src/infra/session-delivery-queue-recovery.ts:318-324`), so the recovery substrate itself does not strip the field.

What is still a gap:

- Restart delivery drops/ignores traceparent at the real replay sinks. For queued `systemEvent`, `deliverQueuedSessionDelivery` re-enqueues text/sessionKey/deliveryContext only (`src/gateway/server-restart-sentinel.ts:238-248`). For queued agent turns without a route it also re-enqueues text/sessionKey/deliveryContext only (`src/gateway/server-restart-sentinel.ts:258-268`). For routed agent turns, the reconstructed inbound context has body/route/message/provenance fields but no traceparent (`src/gateway/server-restart-sentinel.ts:286-318`), and outbound delivery likewise has no trace carrier in the shown call (`src/gateway/server-restart-sentinel.ts:327-341`).
- Post-compaction replay also drops the trace seam: `deliverQueuedPostCompactionDelegate` spawns the child with task/silent/wake/target/fanout/drain fields only (`src/auto-reply/reply/post-compaction-delegate-dispatch.ts:491-515`) and then enqueues a spawned system event without traceparent (`src/auto-reply/reply/post-compaction-delegate-dispatch.ts:520-523`).

Existing tests: `src/infra/session-delivery-queue.recovery.test.ts:25-49` proves recovery replays and acks pending entries; retry/cutoff tests prove retry behavior. No recovery test asserts traceparent is re-applied at delivery time.

Seams to wire: keep the storage shape, but update `src/gateway/server-restart-sentinel.ts` replay sinks to pass `entry.traceparent` into `enqueueSystemEvent`, reconstructed inbound/diagnostic context, or continuation span creation as appropriate. Update `deliverQueuedPostCompactionDelegate` to preserve traceparent into the spawned delegate and spawned lifecycle system event.

### Q7 — Chain-budget-capped span emission / anti-flood

**Status: GAP / UNTESTED.**

Findings:

- The RFC target says queue-lifecycle spans must be capped by chain-step count, not recipient count, and suppressed once `chainStepBudgetRemaining <= 0` (`docs/design/continue-work-signal-v2.md:1251-1257`). It further says multi-recipient fanout should emit one parent `continuation.queue.fanout` span with `recipientCount=N`, `chainStepConsumed=1`, and budget remaining, plus per-target deliver spans (`docs/design/continue-work-signal-v2.md:1266-1269`).
- Current return fanout code does not receive or compute chain-step budget at the fanout seam. `runSubagentAnnounceFlow` resolves recipients and calls `enqueueContinuationReturnDeliveries` with target keys/text/idempotency/wake/childRunId only (`src/agents/subagent-announce.ts:1198-1214`), and the helper loops every target without any chain-budget argument or suppression logic (`src/auto-reply/continuation/targeting.ts:105-130`).
- Existing chain caps do apply to subsequent delegate creation, not to return fanout queue-lifecycle span emission. Bracket chain-hop continuation rejects when `childChainHop >= maxChainLength` (`src/agents/subagent-announce.ts:887-923`); tool-dispatched child delegates reject when `nextToolHop > toolMaxChainLength` (`src/agents/subagent-announce.ts:1018-1044`). Post-compaction delegate release caps queued delegates by `maxDelegatesPerTurn` (`src/auto-reply/reply/post-compaction-delegate-dispatch.ts:609-618`) and tests that cap (`src/auto-reply/reply/post-compaction-delegate-dispatch.test.ts:446-548`). These caps do not implement "per-completion fan-out is 1 chain step regardless of recipient cardinality" for return delivery spans.
- The only shipped queue consumer span helper is aggregate `continuation.queue.drain`, fired once per `drainFormattedSystemEvents` call and explicitly multi-chain/no-chain-id (`src/infra/continuation-tracer.ts:687-725`). Its tests assert it does not carry `chain.id` or `chain.step.remaining` (`src/infra/continuation-tracer.test.ts:1067-1081`). That means the specified `continuation.queue.fanout`/per-target deliver cap is not implemented; absence of per-entry fanout spans is not the same as a chain-budget-capped implementation.

Existing tests: fanout tests cover key resolution and byte-identical payload delivery only (`src/auto-reply/continuation/cross-session-targeting.test.ts:37-55`, `src/auto-reply/continuation/cross-session-targeting.test.ts:57-111`). No existing test constructs runaway `fanoutMode: "tree"` or `"all"` and asserts span emission is bounded by chain-step count instead of recipient count.

Seam to wire: the cap belongs where the single producer completion is expanded into many recipient deliveries: `src/agents/subagent-announce.ts` (`runSubagentAnnounceFlow`) and `src/auto-reply/continuation/targeting.ts` (`enqueueContinuationReturnDeliveries`). That seam should receive `chainStepBudgetRemaining`/traceparent, consume one chain step per completion, emit/suppress a single parent fanout span accordingly, and avoid per-recipient queue-lifecycle spans when budget is exhausted.

### Identified seams for follow-up design/code work

1. Producer input contract: `src/agents/tools/continue-delegate-tool.ts`, `src/auto-reply/tokens.ts`, `src/auto-reply/continuation/types.ts`, and `src/auto-reply/continuation/delegate-store.ts` need additive trace carrier fields if tool/token/TaskFlow are to preserve traceID + parent span.
2. Producer span creation: `src/infra/continuation-tracer.ts` helper signatures and `src/auto-reply/reply/agent-runner.ts` call sites need to pass `StartSpanOptions.traceparent` where the adapter already knows how to parent-stitch.
3. Child run / spawn metadata: spawn params and persisted run/session metadata need a carrier so the returning child can know which traceparent to propagate.
4. Default return: `src/agents/subagent-announce.ts` silent/default return and `src/agents/subagent-announce-delivery.ts` visible/direct delivery need additive traceparent plumbing.
5. Targeted/multi/fanout return: `src/auto-reply/continuation/targeting.ts` should accept traceparent and pass it into both durable `enqueueSessionDelivery` payloads and immediate `enqueueSystemEvent`.
6. Queue drain/replay: `src/auto-reply/reply/session-system-events.ts` and `src/gateway/server-restart-sentinel.ts` need to re-apply per-entry traceparent when draining or replaying queued returns after restart.
7. Anti-flood cap: `runSubagentAnnounceFlow` + `enqueueContinuationReturnDeliveries` are the fanout expansion seam for "1 chain step per completion, not per recipient"; no current test asserts that cap.

### Verification

- `pnpm tsgo` initially failed because `node_modules/.bin/tsgo` was missing (`ENOENT`), so dependencies were installed once with `pnpm install --frozen-lockfile`.
- Retried `pnpm tsgo`; it passed.
- No `src/**` files or `docs/design/continue-work-signal-v2.md` were modified for this audit.
