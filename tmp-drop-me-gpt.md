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

2026-04-25T23:48:00+00:00 — tests-of-concern walk completed; no tests run in this section.

- `extensions/whatsapp/src/auto-reply/heartbeat-runner.test.ts`: exercises WhatsApp `runWebHeartbeatOnce` dry-run/send/current-time/token-only/log redaction/error paths; stubs heartbeat runtime, session snapshot, reconnect/send; TaskFlow no; heartbeat yes.
- `extensions/whatsapp/src/heartbeat-recipients.test.ts`: exercises WhatsApp heartbeat recipient resolution across session recipients, allowFrom, explicit `--to`, account/defaultAccount/pairing stores; stubs heartbeat-recipients runtime; TaskFlow no; heartbeat yes.
- `src/agents/heartbeat-system-prompt.test.ts`: exercises heartbeat system-prompt inclusion/omission and default-agent override behavior; no TaskFlow stubs; heartbeat yes.
- `src/agents/subagent-announce.continuation.test.ts`: exercises continuation chain hops emitted from subagent announce, silent-wake stickiness, max-depth/cost caps, grandparent reroute, and timer generation-drift behavior; stubs heartbeat wake, continuation-state runtime, registry/spawn, session store; TaskFlow no; heartbeat wake yes.
- `src/agents/tools/continuation-tools-registration.test.ts`: exercises `createOpenClawTools` exposure of `continue_delegate`/`continue_work` and `drainsContinuationDelegateQueue` truth table; no TaskFlow stubs; heartbeat no.
- `src/agents/tools/request-compaction-tool.test.ts`: exercises request-compaction guards, async fire-and-forget, reason validation/truncation, pending/rate isolation, and volitional count TTL; stubs injected compaction trigger; TaskFlow no; heartbeat no.
- `src/auto-reply/continuation-delegate-store-taskflow.test.ts`: exercises TaskFlow delegate persistence/lifecycle/restart recovery and facade routing; stubs TaskFlow `finishFlow` and registry temp dirs; TaskFlow yes; heartbeat no.
- `src/auto-reply/continuation-delegate-store.test.ts`: exercises volatile delegate queue, delayed reservations, highest-hop, and post-compaction staging; no TaskFlow stubs; heartbeat no.
- `src/auto-reply/heartbeat-filter.test.ts`: exercises heartbeat prompt/user-message detection, `HEARTBEAT_OK` ack detection, ackMaxChars, and transcript pair filtering; no TaskFlow stubs; heartbeat yes.
- `src/auto-reply/heartbeat.test.ts`: exercises heartbeat token stripping, effectively-empty HEARTBEAT.md detection, and task parsing without top-level field bleed; no TaskFlow stubs; heartbeat yes.
- `src/auto-reply/reply/context-pressure.integration.test.ts`: exercises context-pressure event queue visibility before drain, escalation/dedup, low thresholds, disabled config; no TaskFlow stubs; heartbeat no.
- `src/auto-reply/reply/context-pressure.test.ts`: exercises context-pressure thresholds, bands, dedup, guards, event text, custom thresholds, compaction reset refire, and warn log anchor; mocks logger; TaskFlow no; heartbeat no.
- `src/auto-reply/reply/continuation-runtime.test.ts`: exercises continuation runtime config clamping/truncation/live accessor; no TaskFlow stubs; heartbeat no.
- `src/auto-reply/reply/post-compaction-context.test.ts`: exercises AGENTS.md post-compaction context extraction, custom sections, truncation, link escape refusal, date/time substitution, legacy fallbacks; no TaskFlow stubs; heartbeat no.
- `src/auto-reply/reply/session.heartbeat-no-reset.test.ts`: exercises `initSessionState` preserving stale sessions for `heartbeat`, `cron-event`, and `exec-event` providers while resetting normal stale messages; no TaskFlow stubs; heartbeat yes.
- `src/config/heartbeat-config-honor.inventory.test.ts`: exercises heartbeat config audit inventory alignment with schema leaf keys and runtime/reload/test proof rows; no TaskFlow stubs; heartbeat yes.
- `src/config/zod-schema.continuation.test.ts`: exercises continuation zod schema bounds/types/strict unknown-key rejection; no TaskFlow stubs; heartbeat no.
- `src/cron/heartbeat-policy.test.ts`: exercises suppressing heartbeat-only delivery payloads and cron main-summary enqueue policy; no TaskFlow stubs; heartbeat yes.
- `src/cron/service.heartbeat-ok-summary-suppressed.test.ts`: exercises CronService not relaying `HEARTBEAT_OK` summaries into the main session or waking main for legacy summaries; stubs service harness/requestHeartbeatNow; TaskFlow no; heartbeat yes.
- `src/cron/service.main-job-passes-heartbeat-target-last.test.ts`: exercises cron main jobs preserving `heartbeat.target=last` for wakeMode `now`, fallback `requestHeartbeatNow`, and `next-heartbeat`; stubs service harness/requestHeartbeatNow/runHeartbeatOnce; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-active-hours.test.ts`: exercises active-hours parsing including invalid windows, zero-width, user/explicit time zones, overnight ranges; no TaskFlow stubs; heartbeat yes.
- `src/infra/heartbeat-events-filter.test.ts`: exercises heartbeat event prompt construction/classification and filtering of noop heartbeat text; no TaskFlow stubs; heartbeat yes.
- `src/infra/heartbeat-events.test.ts`: exercises heartbeat indicator mapping, event storage/listeners/failure isolation/unsubscribe, and duplicate-module singleton sharing; no TaskFlow stubs; heartbeat yes.
- `src/infra/heartbeat-reason.test.ts`: exercises wake/cron/hook/acp reason normalization and priority matching; no TaskFlow stubs; heartbeat wake yes.
- `src/infra/heartbeat-runner.ghost-reminder.test.ts`: exercises heartbeat runner prompt selection/routing around HEARTBEAT_OK noise, cron/exec/hook events, owner downgrade, queued delivery context, stale route avoidance, and Telegram topic pinning; stubs heartbeat runner test runtime/system events/reply; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-runner.isolated-key-stability.test.ts`: exercises isolated `:heartbeat` session key stability, suffix convergence, base-session event consumption, hook:wake classification, forced real heartbeat sessions, and no-task skip behavior; stubs outbound delivery/test sandbox; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-runner.model-override.test.ts`: exercises heartbeat model/lightContext/timeout/bootstrap overrides and isolated/main session key selection across defaults/per-agent config; stubs outbound delivery/test sandbox; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-runner.respects-ackmaxchars-heartbeat-acks.test.ts`: exercises ackMaxChars, showOk, responsePrefix stripping, markup-wrapped acks, updatedAt preservation, delivery skips, and Telegram accountId passthrough; uses heartbeat test harness/runtime; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-runner.returns-default-unset.test.ts`: broad heartbeat runner suite for interval/prompt defaults, agent enablement, delivery target/sender resolution, runHeartbeatOnce skip/delivery/dedup, templated stores, HEARTBEAT.md gating, and internal-only cron/exec prompts; uses plugin registry/test plugins/temp sandbox; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-runner.scheduler.test.ts`: exercises heartbeat scheduler reloads, error recovery, cleanup idempotency, requests-in-flight retry behavior, targeted wake routing, heartbeat override merge, and no fan-out for session-scoped exec wakes; stubs timers/wake handler; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-runner.sender-prefers-delivery-target.test.ts`: exercises sender context preferring delivery target when `lastTo` differs; uses heartbeat test runtime/sandbox; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-runner.skips-busy-session-lane.test.ts`: exercises heartbeat runner returning `requests-in-flight` when session lane has queued work and proceeding when idle; stubs plugin registry/jiti/system events; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-runner.subagent-session-guard.test.ts`: exercises forced subagent session key falling back to main heartbeat session; uses heartbeat runtime/sandbox; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-runner.transcript-prune.test.ts`: exercises append-only transcript behavior so heartbeat replies do not truncate transcript for token-only or meaningful content; uses heartbeat test utils; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-runner.typing.test.ts`: exercises heartbeat typing start/clear on success/failure and suppression when typing mode/delivery disabled; stubs channel plugin heartbeat typing; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-schedule.test.ts`: exercises stable per-agent heartbeat phases, next future slot, and preserving unchanged future schedules on reload; no TaskFlow stubs; heartbeat yes.
- `src/infra/heartbeat-typing.test.ts`: exercises heartbeat typing callback cadence defaults; stubs fake channel heartbeat typing plugin; TaskFlow no; heartbeat yes.
- `src/infra/heartbeat-visibility.test.ts`: exercises heartbeat visibility resolution from defaults, channel defaults, per-channel/per-account overrides, missing accounts, and webchat special handling; no TaskFlow stubs; heartbeat yes.
- `src/infra/heartbeat-wake.test.ts`: exercises wake coalescing, retry cooldowns, handler re-registration, timer preemption, reason priority, pending drain, target-field forwarding, override preservation, and distinct targeted wakes; no TaskFlow stubs; heartbeat wake yes.

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
