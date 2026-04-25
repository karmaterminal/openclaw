# rebase candidate journal — gpt

- worktree: `/home/figs/flesh_beast_best_beast/openclaw-wt-rebase-20260424-gpt`
- branch: `frond-scribe/20260424/candidate-gpt`
- base: `silas/rebase/v2026.4.22-feature` @ `140f7495`
- target: `cbcfdf62` (v2026.4.24)
- workorder: `/home/figs/flesh_beast_best_beast/WORKORDER-rebase-20260424.md`
- host: ronan
- started: 2026-04-25T22:37:07+00:00

## §0 — guardrails acked

- workshop tree confirmed: ✓ under flesh_beast_best_beast
- ronan-the-prince's tree (`/home/figs/flesh_beast_tmp/openclaw/`): off-limits
- candidate branch: push-only, no force-push, no delete after first push
- journal: this file, committed + pushed every checkpoint

## §1 — read first

2026-04-25T23:05:00+00:00 — read completed.

- `docs/design/continue-work-signal-v2.md`: continuation feature gives persistent agents an explicit, bounded way to say "I am not done yet" without relying on heartbeat polling. Primary primitives are `continue_work()` for same-session follow-up turns, `continue_delegate()` for delayed/quiet/post-compaction sub-agent work, `request_compaction()` for async agent-elected compaction, response-token fallbacks (`CONTINUE_WORK`, `[[CONTINUE_DELEGATE: ...]]`), context-pressure events, and post-compaction delegate release.
- Invariants from RFC: opt-in only (`continuation.enabled: false` default), bounded by chain length/cost/delay/fan-out guards, current turn always finishes normally before continuation/compaction actions run, tools and fallback syntax converge on shared runtime paths, leaf sub-agents are denied delegate tools, generation guard is intentionally removed, and pending delegates are Task Flow backed so queues survive gateway restarts.
- Rebase-sensitive sections/files/tests named by RFC: token parsing in `src/auto-reply/tokens.ts`; reply pipeline hooks in `src/auto-reply/reply/agent-runner.ts`, `agent-runner-execution.ts`, `followup-runner.ts`, `session-updates.ts`; continuation runtime/state/store files under `src/auto-reply/`; tool surfaces in `src/agents/tools/*continuation*` and `request-compaction-tool.ts`; compaction reasons in `src/agents/pi-embedded-runner/compact-reasons.ts`; status rendering in `src/auto-reply/status.ts`; continuation tests including delegate store, context pressure, runtime, post-compaction context, tool registration, request compaction, and zod schema tests.
- `karmaterminal/openclaw#325`: procedure root for this release-track rebase. Locked guidance in thread selects `silas/rebase/v2026.4.22-feature` / `140f7495` as base source, target `cbcfdf62` v2026.4.24, flat continuation layout, TaskFlow substrate, candidate branches for parallel lanes, and savegame/journal visibility.
- `karmaterminal/openclaw#326`: savegame discipline issue. Important rule for this lane: candidate branch becomes the durable unsquashed savegame; after first push no force-push/delete/reset-and-replay. Also notes the historical 20260424 savegame ambiguity and says not to paper over it with a falsely paired branch.
- Cael plan `/tmp/oc-325-rebase/rebase-plan.txt`: not readable from this lane (`NOT_ACCESSIBLE`). I will derive classification independently and record "no Cael file diff available" in §4 unless another allowed source appears.

## §2 — full code walk

2026-04-25T23:26:00+00:00 — code walk completed.

- `src/auto-reply/continuation-delegate-store-taskflow.ts`: TaskFlow-backed pending-delegate store; maps delegate fields into TaskFlow `stateJson`, drains FIFO queued flows, and marks consume/cancel lifecycle states. Depends on task-flow runtime internals + delegate types. Last touched: `198758e66b` by Cael, 2026-04-23.
- `src/auto-reply/continuation-delegate-store-taskflow.test.ts`: persistence/lifecycle coverage for TaskFlow delegate store: FIFO fan-out, session isolation, restart recovery, succeeded/cancelled records, finishFlow failure tolerance, and config gate routing. Stubs TaskFlow `finishFlow`; no heartbeat. Depends on task-flow registry + temp dirs + delegate-store facade. Last touched: `4cab9cf2cd` by Silas, 2026-04-23.
- `src/auto-reply/continuation-delegate-store.ts`: facade for volatile pending delegate map, optional TaskFlow delegate routing, delayed reservation map, and staged post-compaction delegates. Depends on TaskFlow store and session post-compaction delegate type. Last touched: `198758e66b` by Cael, 2026-04-23.
- `src/auto-reply/continuation-delegate-store.test.ts`: volatile-store coverage for enqueue/consume/count/isolation, delayed continuation reservations, highest planned hop, and post-compaction staging. No TaskFlow stubs; no heartbeat. Depends only on store exports. Last touched: `4cab9cf2cd` by Silas, 2026-04-23.
- `src/auto-reply/continuation-delegate.types.ts`: minimal DTOs for pending delegates and delayed reservations (`task`, delay, source, fire time, planned hop, silent flags). No runtime dependencies. Last touched: `198758e66b` by Cael, 2026-04-23.
- `src/auto-reply/reply/context-pressure.ts`: computes context pressure bands from session token totals and context window, dedups via `lastContextPressureBand`, logs `[context-pressure:fire]`, enqueues `[system:context-pressure]`, and mutates session entry band. Depends on `SessionEntry`, system events, subsystem logger. Last touched: `198758e66b` by Cael, 2026-04-23.
- `src/auto-reply/reply/context-pressure.test.ts`: unit coverage for disabled/below-threshold cases, exact threshold, 90/95 escalation, dedup, stale token guards, event text, custom thresholds, reset/refire after compaction, >window usage, NaN/negative guards, and warn-level log anchor. Mocks logger; no TaskFlow or heartbeat. Last touched: `4cab9cf2cd` by Silas, 2026-04-23.
- `src/auto-reply/reply/context-pressure.integration.test.ts`: integration coverage that `checkContextPressure()` enqueues a system event visible before prompt drain, then drains cleanly; also covers escalation/dedup and low test thresholds. Uses real system event queue; no TaskFlow or heartbeat. Last touched: `4cab9cf2cd` by Silas, 2026-04-23.
- `src/auto-reply/reply/continuation-runtime.ts`: resolves hot runtime continuation config with safe defaults/clamps for enablement, TaskFlow delegate gate, delay bounds, chain/cost/fan-out, and context threshold. Depends on config loader/snapshot. Last touched: `198758e66b` by Cael, 2026-04-23.
- `src/auto-reply/reply/continuation-runtime.test.ts`: config snapshot tests for runtime clamps/truncation, optional threshold handling, zero-delay runtime overrides, and `resolveMaxDelegatesPerTurn`. No TaskFlow or heartbeat. Last touched: `4cab9cf2cd` by Silas, 2026-04-23.
- `src/auto-reply/reply/continuation-state.ts`: module state for continuation generations, timer ref counts/handles, delegate-pending flags, cleanup, and timer cancellation; drops generation only when no live refs/reservations remain. Depends on delayed reservation count from delegate store. Last touched: `198758e66b` by Cael, 2026-04-23.
- `src/auto-reply/reply/continuation-state.runtime.ts`: narrow runtime barrel for continuation-state functions used by agent/subagent paths to keep mock/lazy boundaries stable. Depends on `continuation-state.ts`. Last touched: `198758e66b` by Cael, 2026-04-23.
- `src/auto-reply/reply/post-compaction-context.test.ts`: tests AGENTS.md post-compaction context extraction, section matching, truncation/limits, symlink/hardlink escape refusal, date/time placeholder substitution, custom `postCompactionSections`, opt-out, and legacy section fallback. No TaskFlow or heartbeat. Last touched: `4f00b76925` by Tak Hoffman, 2026-04-15.
- `src/agents/tools/request-compaction-tool.ts`: defines async `request_compaction` tool, validates session + reason, enforces >=70% context floor, pending dedup, per-session 5-minute rate limit, fire-and-forget trigger, background error logging, and 24h diagnostic volitional counter. Depends on typebox, cache utils, logger, common tool helpers. Last touched: `e4d971bf13` by Silas, 2026-04-24.
- `src/agents/tools/request-compaction-tool.test.ts`: request-compaction coverage for missing session/sessionId errors, threshold/rate/pending guards, generation-guard absence, fire-and-forget behavior, reason truncation/required validation, per-session isolation, guard reset, and volitional count TTL. Stubs injected trigger; no TaskFlow; no heartbeat except indirectly absent. Last touched: `4cab9cf2cd` by Silas, 2026-04-23.
- `src/agents/tools/continuation-tools-registration.test.ts`: full `createOpenClawTools` registration tests for `continue_delegate`/`continue_work` visibility and the `drainsContinuationDelegateQueue !== false` truth table. Uses fast-core-tools helper; no TaskFlow stubs or heartbeat. Last touched: `788b0abe1d` by Ronan Solidor, 2026-04-24.
- `src/agents/subagent-announce.continuation.test.ts`: subagent announce chaining coverage for bracket-origin hop seeding, canonical hop propagation, silent-wake stickiness, max-chain/cost-cap rejection, grandparent reroute, and delayed timer firing despite generation drift. Mocks heartbeat wake, continuation-state runtime, subagent registry/spawn, and filesystem session store; no TaskFlow. Last touched: `4cab9cf2cd` by Silas, 2026-04-23.
- `src/config/zod-schema.continuation.test.ts`: schema boundary tests for continuation config: contextPressureThreshold bounds/types, maxDelegatesPerTurn positivity/integer, costCapTokens nonnegative integer, delay/chain positivity, boolean enabled, strict unknown-key rejection. No TaskFlow or heartbeat. Last touched: `4cab9cf2cd` by Silas, 2026-04-23.
- Upstream neighbor `cbcfdf62:src/gateway/server-restart-sentinel.ts`: startup task reads restart sentinel, formats notice, merges delivery context/session route, enqueues wake system event, retries outbound notice delivery, persists/drains restart continuation deliveries through session-delivery queue, and can dispatch an agent turn via `recordInboundSessionAndDispatchReply`. Overlap with continuation-runtime/restart-survival: same recovery vocabulary (persist intent, enqueue system event, call `requestHeartbeatNow`, replay after restart), but upstream path is gateway-level restart sentinel + delivery queue while continuation delegates use delegate store/TaskFlow and continuation timers. Rebase risk is semantic duplication around "wake after restart" and delivery-context resolution, not a direct textual conflict in continuation files.

## §3 — full walk of tests of concern

(pending)

## §4 — perform the rebase

(pending)

## §5 — push savegame BEFORE any squash

(pending — first push happens after this seed commit)

## §6 — verification

(pending)

## §7 — push cadence

checkpoints pushed:

- 2026-04-25T22:37:07+00:00 seed journal + §0 acked

## §8 — declare done

(pending)
