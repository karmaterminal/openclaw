# rebase candidate journal — gpt2 (copilot v2.5 assist lane)

worktree: /home/figs/flesh_beast_best_beast/openclaw-wt-rebase-20260424-gpt2
branch: frond-scribe/20260424/candidate-gpt2
base: silas/rebase/v2026.4.22-feature @ 140f74956d
target: karmaterminal-2026.4.24-base (tag, == cbcfdf62c7297bda66009ea7476f053c3e9addab)
workorder: /home/figs/flesh_beast_best_beast/WORKORDER-rebase-20260424-v2.md
tracking issue: https://github.com/karmaterminal/openclaw/issues/336
project status: in_coding_agent (project 56)
tmux session: oc-rebase-20260424-v2 (created at dispatch)
seeded: 2026-04-25T19:21:29-07:00

driver: copilot CLI / gpt-5.5 / --reasoning-effort xhigh / --yolo
host: ronan
dispatched-by: frond-scribe (Claude Opus 4.7 / 1M context) under figs's directive 2026-04-25

---

## §0 — guardrails (copilot fills in after reading)

- 2026-04-25T19:29-07:00 — §0 loaded twice. Off-limits tree is `/home/figs/flesh_beast_tmp/openclaw/`; I will not read/list/stat/write/cd there or touch the live `openclaw-gateway`.
- Branch confinement loaded: push only `frond-scribe/20260424/candidate-gpt2`; do not touch Cael/Silas/Ronan/Elliott/main/release branches. The first post-rebase push is the #326 savegame boundary; after that, no force-push, rewrite, delete, or "cleanup" guessing.
- Journal cadence loaded: `tmp-drop-me-gpt2.md` is the visible lane log; checkpoint commits/pushes/comments go to #336 with the ronan-auth caveat. North-star loaded: frame continuation as upstream-wants-this capability gain, not defensive porting.
- Surfaces loaded: Surface 1 adds descriptor-only `continue_delegate.targetSessionKey?` in `src/auto-reply/continuation-delegate.types.ts` + `src/agents/tools/continuation-tools-registration.ts`; Surface 2 adds descriptor-only `traceparent?` + `attachments?` to `QueuedSessionDeliveryPayload` in `src/infra/session-delivery-queue-storage.ts`.
- Conditional voice loaded: v2.5 is the (a)-shape, addressable point-to-point intra-host/gateway-RPC; v3 is the sibling SeedLink-style SING/LISTEN broadcast surface via `publish_to_stream` / `subscribe_stream` under karmaterminal/binary-canticle#11. Same substrate; different verb-set.
- Cite-pin loaded: base tag `karmaterminal-2026.4.24-base` verified in this worktree as `cbcfdf62c7297bda66009ea7476f053c3e9addab`; replay branch ref will be fetched/verified in §4; candidate claims cite the current tip SHA, not a moving branch name.

## §1 — read first (copilot fills in)

- `pnpm docs:list` passed from this worktree before doc reads. Relevant guide read: `docs/design/continue-work-signal-v2.md` plus `src/agents/AGENTS.md` for the agent-tool subtree I will touch later.
- RFC summary (`docs/design/continue-work-signal-v2.md`): §2 defines a tools-first interface (`continue_work`, `continue_delegate`, `request_compaction`) with response-token fallback; §2.3 gives `continue_delegate` fan-out, typed params, and return modes (`normal`, `silent`, `silent-wake`, `post-compaction`); §2.6 pins the three-tier fallback hierarchy; §3.2-§3.4 describe delegate scheduling/drain boundaries; §5.4 says Task Flow backs pending delegates; §6 and §7 pin observability, safety bounds, and temporal-gap integrity limits. v2 is addressable continuation + Task Flow durability; v3/binary-canticle extends the substrate into station/stream broadcast rather than replacing it.
- #325 skimmed as the procedure root for the release branch update; #326 skimmed as savegame discipline. The branch I produce becomes a #326-style savegame at §5 and must not be rewritten afterward.
- #332 OP + latest ronan comment read: runtime adoption home for `session-delivery-queue` integration, with the explicit distinction between new `src/infra/session-delivery-queue*` and older `src/infra/outbound/delivery-queue*`. Substrate-existence claims are pinned to `karmaterminal-2026.4.24-base` (`cbcfdf62c7297bda66009ea7476f053c3e9addab`), not pre-rebase trees.
- #334 OP read: `traceparent`/DiagnosticTraceContext propagation is the chain-correlation home, so this lane should only make the payload schema ready for later runtime span parenting.
- #335 skimmed: RFC/doc-debt umbrella, especially cross-session routing and v24 capability uptake. Latest comment frames the net capability gain as pre-v24 system events surviving compaction but post-v24 `session-delivery-queue` surviving compaction plus gateway restart.
- binary-canticle#11 latest ronan ferry read fully: v3 stack is `session-delivery-queue -> ringbuffer -> NORM/UDP broadcast -> ringbuffer -> session-delivery-queue`; SING/LISTEN/HUSH/WHO are the durable verb-shape; the schema ask is top-level `traceparent?` and `attachments?` on the queued payload union before migrations harden.
- Cael plan read is deferred to §4 because `/tmp/oc-325-rebase/rebase-plan.txt` is a sanity reference for classification, not the source of truth. I will note if it is unreachable.

## §2 — code walk (copilot fills in)

- `src/auto-reply/continuation-delegate-store-taskflow.ts` — Task Flow backing for pending delegate records (`controllerId=core/continuation-delegate`), FIFO drain/cancel; depends on task-flow runtime internals; last touched `198758e66b`; supports v2 delegate durability, complementary to Surface 2.
- `src/auto-reply/continuation-delegate-store-taskflow.test.ts` — Task Flow store lifecycle/config-gate coverage; depends on task-flow test seams; last touched `4cab9cf2cd`; validates delegate-store behavior that must remain separate from session-delivery queue.
- `src/auto-reply/continuation-delegate-store.ts` — volatile-or-TaskFlow facade for tool-staged delegates plus delayed reservations and post-compaction staging; depends on Task Flow store and continuation types; last touched `198758e66b`; Surface 1 runtime-adjacent but not descriptor-owned.
- `src/auto-reply/continuation-delegate-store.test.ts` — FIFO/multi-session/delayed-reservation/post-compaction store coverage; depends on store facade; last touched `4cab9cf2cd`; guards existing v2 semantics while descriptors extend discoverability.
- `src/auto-reply/continuation-delegate.types.ts` — small shared interfaces (`PendingContinuationDelegate`, `DelayedContinuationReservation`); last touched `198758e66b`; Surface 1 type home for descriptor-only `targetSessionKey?`.
- `src/auto-reply/reply/context-pressure.ts` — computes pressure bands, dedups via `lastContextPressureBand`, enqueues `[system:context-pressure]`; depends on system-events and subsystem logger; last touched `198758e66b`; continuation core, not Surface 1/2.
- `src/auto-reply/reply/context-pressure.test.ts` — direct pressure band/dedup/event/log coverage; depends on mocked logger and system-events helpers; last touched `4cab9cf2cd`; regression guard for RFC §4.2/§6.1.
- `src/auto-reply/reply/context-pressure.integration.test.ts` — real enqueue/peek/drain ordering for pressure events; last touched `4cab9cf2cd`; confirms pre-run event visibility.
- `src/auto-reply/reply/continuation-runtime.ts` — resolves hot runtime config defaults/clamps for continuation; depends on config load; last touched `198758e66b`; used by tool delegate limits.
- `src/auto-reply/reply/continuation-runtime.test.ts` — config clamp/default access tests; last touched `4cab9cf2cd`; guards runtime/schema split.
- `src/auto-reply/reply/continuation-state.ts` — timer generation/ref bookkeeping and pending flags; depends on delayed reservation count; last touched `198758e66b`; core timer state, not Surface 1/2.
- `src/auto-reply/reply/continuation-state.runtime.ts` — local barrel for continuation state; last touched `198758e66b`; exists as a narrow runtime seam for tests/mocks.
- `src/auto-reply/reply/post-compaction-context.test.ts` — AGENTS.md post-compaction context extraction/limit/symlink safety coverage; last touched `4f00b76925`; adjacent to continuation recovery but not descriptor-owned.
- `src/agents/tools/request-compaction-tool.ts` — async volitional compaction tool with active-session/sessionId/context/rate/dedup guards and status counter; depends on TypeBox, logger, config cache; last touched `e4d971bf13`; continuation sibling tool.
- `src/agents/tools/request-compaction-tool.test.ts` — request_compaction guard/fire-and-forget/counter coverage; last touched `4cab9cf2cd`; protects compaction primitive during rebase.
- `src/agents/tools/continue-delegate-tool.ts` — actual `continue_delegate` schema/descriptor/executor on replay tip; depends on continuation store/runtime and TypeBox enum helper; last touched `198758e66b`; Surface 1 descriptor home in this tree because `src/agents/tools/continuation-tools-registration.ts` does not exist pre-rebase.
- `src/agents/openclaw-tools.ts:337-353` — actual registration gate for `continue_work` and `continue_delegate`; `continue_delegate` appears when continuation enabled and `drainsContinuationDelegateQueue !== false`; relevant to Surface 1 descriptor tests.
- `src/agents/tools/continuation-tools-registration.test.ts` — registration truth-table coverage; depends on `createOpenClawTools` and fast core tools helper; last touched `788b0abe1d`; Surface 1 descriptor test will extend here per workorder.
- `src/agents/subagent-announce.continuation.test.ts` — announce-boundary continuation chain-hop coverage with mocked spawn/heartbeat/runtime seams; last touched `4cab9cf2cd`; important for `198758e66b` conflict comparison.
- `src/config/zod-schema.continuation.test.ts` — strict Zod boundary tests for continuation config keys; last touched `4cab9cf2cd`; verifies config contract, not descriptor payloads.
- Upstream `karmaterminal-2026.4.24-base` (`cbcfdf62c7297bda66009ea7476f053c3e9addab`) `src/infra/session-delivery-queue.ts` — barrel exporting storage/recovery API/types; last touched `0ac81d41b6`; Surface 2 public import path.
- Upstream `src/infra/session-delivery-queue-storage.ts` — fs-backed session delivery queue: payload union, sha256 idempotency from `idempotencyKey`, atomic temp write/rename, ack/fail/load/failed move; last touched `a903df02f5`; Surface 2 schema home.
- Upstream `src/infra/session-delivery-queue-recovery.ts` — retry/backoff drain/recovery with max 5 retries and in-progress guards; last touched `03addfe9ba`; confirms Surface 2 fields should be opaque payload data.
- Upstream `src/infra/session-delivery-queue.storage.test.ts` — idempotency, retry metadata, ack removal, tmp cleanup/fresh tmp coverage; last touched `03addfe9ba`; Surface 2 round-trip test target.
- Upstream `src/infra/session-delivery-queue.recovery.test.ts` — replay/ack, retry metadata, cutoff skip, backoff tier coverage; last touched `03addfe9ba`; substrate sanity test target.
- Upstream `src/gateway/server-restart-sentinel.ts` — restart continuation wake producer/consumer that enqueues and drains queued session deliveries; last touched `a903df02f5`; restart-survival neighbor, not descriptor-owned.
- Overlap note: TaskFlow delegate store (`src/auto-reply/continuation-delegate-store-taskflow.ts`) and v24 `session-delivery-queue` are complementary. TaskFlow persists in-process continuation delegate intent; `session-delivery-queue` persists addressable session delivery across gateway restart. Surface 2 edits must not modify TaskFlow semantics.

## §3 — tests of concern (copilot fills in)

## §4 — rebase (copilot fills in)

## §5 — savegame push (copilot fills in)

## §6 — verification (copilot fills in)

## §B-execute — Surfaces 1+2 descriptor edits (copilot fills in)

## §8 — declare done (copilot fills in)
