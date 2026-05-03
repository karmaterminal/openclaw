# rfc-review journal — copilot lane

| Field              | Value                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| Worktree           | `/home/figs/flesh_beast_best_beast/openclaw-wt-rfc-review-20260502`                    |
| Branch             | `frond-scribe/20260502/rfc-review-copilot`                                             |
| Base               | `frond-scribe/20260429/v3-cohort-fixes` (v2026.4.29 ancestor verified at `a448042c2e`) |
| Workorder          | `/home/figs/flesh_beast_best_beast/WORKORDER-rfc-review-20260502.md`                   |
| Tracking           | karmaterminal/openclaw#544                                                             |
| Model              | github-copilot/gpt-5.5 with `--reasoning-effort xhigh`                                 |
| Outer budget       | 444m                                                                                   |
| Webhook resolve    | `gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/frond-scribe`                  |
| Heartbeat username | `frond-scribe-rfc-review-hook`                                                         |
| Started            | (filled by agent at first §1 entry)                                                    |

## §0 — guardrails acknowledged

- Operate only inside this worktree
- Never read/write/list/shell into `/home/figs/flesh_beast_tmp/`
- Push to `frond-scribe/20260502/rfc-review-copilot` only
- No edits to `docs/design/continue-work-signal-v2.md` — review-only lane
- Cohort applies the review; this lane does not author the rewrite
- Heartbeat at every §-section close and on any DESIGN-BREAK

(Agent fills §1 onward in-flight.)

## §1 — required-read pass

Started: 2026-05-02T18:41:32-07:00.

### §1 notes — subject RFC

- `docs/design/continue-work-signal-v2.md` is 1400 lines in this checkout. It is not only a feature RFC; it is also a live implementation chronicle, canary report, design doctrine memo, and evidence appendix.
- The document's own stated surface is implemented continuation: `continue_work()`, `continue_delegate()`, context pressure, `request_compaction()`, post-compaction delegate release, response-token fallback, TaskFlow/session-delivery durability, and OTel chain correlation.
- First read impression: the highest-value substrate language is present, especially §1.1, §2.7, §4.6, and §10.2, but it is diluted by implementation archaeology, issue-history insertions, and detailed canary narrative inside the normative body.

### §1 notes — path drift / current code equivalents

- The workorder names `src/auto-reply/continuation-delegate-store-taskflow.ts` and `src/auto-reply/reply/continuation-runtime.ts` / `continuation-state.ts`; those exact files are absent in this checkout.
- Current canonical continuation modules live under `src/auto-reply/continuation/`: `delegate-store.ts`, `delegate-dispatch.ts`, `scheduler.ts`, `state.ts`, `signal.ts`, `context-pressure.ts`, `post-compaction-release.ts`, and `lazy.runtime.ts`.
- Root-level `src/auto-reply/continuation-delegate-store.ts` and `src/auto-reply/continuation-delegate.types.ts` are compatibility shims pointing at the canonical continuation modules.
- The old requested `src/auto-reply/reply/context-pressure.ts` path is now `src/auto-reply/continuation/context-pressure.ts`; reply tests still live at `src/auto-reply/reply/context-pressure.test.ts` and `.integration.test.ts`.

### §1 notes — code walked

- `src/auto-reply/continuation/types.ts`: mode-only runtime delegate shape; persisted legacy rows may still carry booleans, but runtime `PendingContinuationDelegate` uses `mode`.
- `src/auto-reply/continuation/config.ts`: hot-reload-at-use config resolver; includes `earlyWarningBand` default `0.3125`, which the RFC only partially surfaces.
- `src/auto-reply/continuation/signal.ts`: bracket response signals take precedence over `continue_work` tool requests; it scans backward for the last text payload, strips visible syntax, and logs trace anchors.
- `src/auto-reply/tokens.ts`: fallback parser supports `CONTINUE_WORK`, `CONTINUE_WORK:N`, `[[CONTINUE_DELEGATE: task]]`, optional `+Ns`, `| silent`, `| silent-wake`, last-bracket matching, and 4096-character task truncation.
- `src/auto-reply/continuation/delegate-store.ts`: TaskFlow-backed queued delegates and post-compaction staged delegates; corrupt records fail via `failFlow`; delayed reservations remain a volatile in-memory map because timer handles are process-scoped.
- `src/auto-reply/continuation/delegate-dispatch.ts`: tool-delegate drain enforces per-turn cap, chain cap, cost cap, dispatches via `spawnSubagentDirect`, and arms hedge timers for unmatured tool delegates in quiet channels.
- `src/auto-reply/continuation/scheduler.ts`: schedule helpers enforce budget, clamp delay, unref timers, catch timer callback errors, and intentionally omit generation-guard cancellation.
- `src/auto-reply/continuation/state.ts`: timer handle/ref tracking plus chain-state load/persist helpers; no separate delegate-pending map.
- `src/auto-reply/continuation/context-pressure.ts`: equality-band dedup, session-entry and token overloads, early-warning bands, post-compaction unconditional event text, debug noops, and pre-run warning logs.
- `src/auto-reply/continuation/post-compaction-release.ts`: extracted lifecycle helper clears pressure dedup, emits post-compaction pressure, consumes staged delegates, and dispatches them silent/wake.
- `src/auto-reply/reply/agent-runner.ts`: still contains substantial bracket and tool continuation scheduling, spans, timer callbacks, continuation wake event injection, heartbeat wake, and post-response delegate drain wiring.
- `src/auto-reply/reply/followup-runner.ts`: follow-up turns also drain `continue_delegate` queues and persist chain state to disk; this prevents follow-up-only delegate chains from stalling until an external message.
- `src/auto-reply/reply/post-compaction-delegate-dispatch.ts`: post-compaction delegates are persisted into session store, queued through `session-delivery-queue`, then later delivered with chain/cost gates at drain/spawn time.
- `src/agents/tools/continue-work-tool.ts`: requires active session and non-empty reason, captures structured same-turn request, returns scheduled immediately.
- `src/agents/tools/continue-delegate-tool.ts`: no `targetSessionKey` schema; max-delegates admission is per tool instance / turn; post-compaction mode stages separately and returns `queued-for-compaction`.
- `src/agents/tools/request-compaction-tool.ts`: `reason` required/truncated, context floor 70%, per-session pending dedup, rate limit only armed on successful compaction, failure surfaced as `[system:compaction-failed]`.
- `src/agents/openclaw-tools.ts`: continuation tools register only when `continuation.enabled`; `continue_work` also requires runner-provided callback; `request_compaction` also requires `requestCompactionOpts`; `continue_delegate` hidden only when `drainsContinuationDelegateQueue === false`.
- `src/agents/subagent-announce.ts` + `subagent-announce.continuation.runtime.ts`: child sessions drain their own `continue_delegate` queues at announce boundary through a co-located runtime entry to avoid bundle/runtime import drift.
- `src/config/sessions/types.ts`: session entries still include `pendingPostCompactionDelegates`, `continuationChainCount`, `continuationChainStartedAt`, `continuationChainTokens`, and `continuationChainId`.
- `src/gateway/server-restart-sentinel.ts`: restart continuations enqueue `systemEvent` / `agentTurn` records into `session-delivery-queue`, drain the exact entry, and recover pending deliveries at startup.
- `src/infra/session-delivery-queue-storage.ts` and `src/infra/session-delivery-queue-recovery.ts`: atomic JSON queue, sha256 idempotency keys, queue soft cap, ack unlink, retry counts, backoff `[5s, 25s, 120s, 600s]`, retry cap 5, failed/ pruning, and post-compaction delegate payload shape.
- `src/infra/continuation-tracer.ts` and `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts`: span vocabulary has advanced beyond the RFC's §6.6 table; shipped names include `continuation.work.fire`, `continuation.delegate.fire`, `continuation.queue.drain`, `continuation.compaction.released`, `continuation.disabled`, and `heartbeat`, not the RFC's older enqueue/spawn/return schema.

### §1 notes — tests walked

- `src/auto-reply/continuation-delegate-store.test.ts` and `src/auto-reply/continuation/delegate-store.test.ts` pin queue/stage isolation, FIFO, mode round-trip, malformed legacy flag failure, controller ids, queue depths, and volatile delayed reservations.
- `src/auto-reply/continuation-delegate-store.post-compaction-substrate.test.ts` specifically pins that tool-side staging and runner-side consume use the same module/substrate.
- `src/auto-reply/continuation/scheduler.test.ts` pins chain/cost caps, zero-cost unlimited, clamping, no generation guard, and timer callback error containment.
- `src/auto-reply/continuation/context-pressure.test.ts`, `src/auto-reply/reply/context-pressure.test.ts`, and `.integration.test.ts` pin early-warning bands, exact thresholds, custom high thresholds, dedup, post-compaction re-fire, stale-token no-op, event text, warning log level, and queue-before-drain ordering.
- `src/auto-reply/reply/post-compaction-context.test.ts` pins AGENTS section extraction, custom section names, legacy fallback sections, symlink/hardlink rejection, truncation, timezone/date expansion, and opt-out via empty `postCompactionSections`.
- `src/agents/tools/request-compaction-tool.test.ts` pins precondition errors, 70% floor, exact-threshold acceptance, per-session rate limit, same-turn pending dedup, background failure behavior, no generation guard, async fire-and-forget, reason truncation, diagnostic counter TTL, and guard ordering.
- `src/agents/tools/continuation-tools-registration.test.ts` pins `targetSessionKey` absence, binary-canticle description reference, enabled/disabled visibility, `continue_work` callback requirement, and the `drainsContinuationDelegateQueue !== false` predicate.
- `src/agents/subagent-announce.continuation.test.ts` pins bracket chain-hop seeding/propagation, sticky silent-wake, max-depth/cost rejection, grandparent reroute before cost guard, and delayed chain-hop timers.
- `src/config/zod-schema.continuation.test.ts` pins strict schema validation, optional `contextPressureThreshold`, `earlyWarningBand` unit interval, positive integer delegate/depth caps, nonnegative delays/cost, and retired delegate-store switch rejection.

### §1 notes — adjacent design lineage

- `docs/design/332-item-b-post-compaction-release-audit.md` is important lineage for §4.6: it treats substrate adoption as evidence-based and records a direct functional reason for bespoke post-compaction release dispatch when synchronous chain-budget enforcement lives at the release layer.
- `docs/design/334-slice2-chunk5b-delegate-fire-memo.md` is important because current tracer implementation includes the memo's `continuation.delegate.fire` / `reservation.missing` design, while the RFC §6.6 still describes an older span vocabulary.
- `docs/design/334-slice2-chunk6c-followup-memo.md` is narrower tracer/test hardening lineage for compaction release spans.
- `docs/design/swim-37-classifier-span-memo.md` is adjacent mainly as a register example: it is sharper about span-domain boundaries than the RFC currently is in §6.6.

### §1 closeout

- Total elapsed reading/codewalk time for §1: about 25 minutes wall-clock, tool-assisted, covering the full RFC, all requested files that exist at their requested paths, current renamed equivalents for moved files, the listed adjacent memos, and the test files of concern.
- Top surprise 1: the RFC presents TaskFlow-backed delegates as unconditional, but delayed reservations and concrete timers are still process-scoped/volatile; TaskFlow is the pending/staged store, not a durable timer substrate.
- Top surprise 2: `continue_delegate` intentionally omits `targetSessionKey` from the shipped schema, while the RFC still says the descriptor surface includes it and treats it as a pending runtime seam.
- Top surprise 3: the shipped OTel/trace surface has outpaced §6.6 substantially; current code has `work.fire`, `delegate.fire`, queue-drain, compaction-release, disabled, and heartbeat spans, while the RFC table uses older enqueue/spawn/return names.
- Initial gut: the RFC contains the raw material for scientific literature, but currently reads as a hybrid of functional documentation, post-hoc implementation ledger, and canary report. The strongest substrate claims are real; the document needs sharper terminology, normative/implementation separation, and updated claim pins before it reads like cold-pickup scientific literature for future agents.
