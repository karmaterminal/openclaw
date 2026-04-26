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

| File                                                                     | Shape note                                                                                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extensions/whatsapp/src/auto-reply/heartbeat-runner.test.ts`            | WhatsApp heartbeat send/runner config and delivery behavior; 7 cases; last `95331e5cc5`.                                                                       |
| `extensions/whatsapp/src/heartbeat-recipients.test.ts`                   | WhatsApp recipient resolution from runtime config; 10 cases; last `2940379361`.                                                                                |
| `src/agents/heartbeat-system-prompt.test.ts`                             | System-prompt heartbeat guidance enable/disable behavior; 6 cases; last `51633fc13a`.                                                                          |
| `src/agents/subagent-announce.continuation.test.ts`                      | Continuation chain-hop spawn/wake at subagent announce boundary; 7 cases; last `4cab9cf2cd`.                                                                   |
| `src/agents/tools/continuation-tools-registration.test.ts`               | Tool inventory gate for continuation tools and drainers; 6 existing cases; last `788b0abe1d`; Surface 1 descriptor/loud-fail assertions will extend this file. |
| `src/agents/tools/request-compaction-tool.test.ts`                       | `request_compaction` preconditions, guards, async behavior, counters; 22 cases; last `4cab9cf2cd`.                                                             |
| `src/auto-reply/continuation-delegate-store-taskflow.test.ts`            | Task Flow delegate store lifecycle and config gate routing; 21 cases; last `4cab9cf2cd`.                                                                       |
| `src/auto-reply/continuation-delegate-store.test.ts`                     | Volatile delegate store, delayed reservations, post-compaction staging; 21 cases; last `4cab9cf2cd`.                                                           |
| `src/auto-reply/heartbeat-filter.test.ts`                                | HEARTBEAT/HEARTBEAT_OK message filtering; 8 cases; last `57f9f0a08d`.                                                                                          |
| `src/auto-reply/heartbeat.test.ts`                                       | Heartbeat token stripping, prompt parsing, effective-empty behavior; 28 cases; last `3b57af0388`.                                                              |
| `src/auto-reply/reply/context-pressure.integration.test.ts`              | Real system-event queue order for pressure enqueue/peek/drain; 5 cases; last `4cab9cf2cd`.                                                                     |
| `src/auto-reply/reply/context-pressure.test.ts`                          | Direct pressure thresholds, dedup, stale token/accounting guards; 34 cases; last `4cab9cf2cd`.                                                                 |
| `src/auto-reply/reply/continuation-runtime.test.ts`                      | Runtime continuation config defaults/clamps/live accessor; 5 cases; last `4cab9cf2cd`.                                                                         |
| `src/auto-reply/reply/post-compaction-context.test.ts`                   | AGENTS.md post-compaction extraction, limits, symlink/hardlink safety; 25 cases; last `4f00b76925`.                                                            |
| `src/auto-reply/reply/session.heartbeat-no-reset.test.ts`                | Heartbeat should not reset per-sender session state; 5 cases; last `a112903802`.                                                                               |
| `src/config/heartbeat-config-honor.inventory.test.ts`                    | Inventory guard that heartbeat config surfaces are honored; 2 checks; last `c94888dbee`.                                                                       |
| `src/config/zod-schema.continuation.test.ts`                             | Strict continuation config schema boundary; 20 cases; last `4cab9cf2cd`.                                                                                       |
| `src/cron/heartbeat-policy.test.ts`                                      | Cron heartbeat-only delivery skip and summary policy; 5 cases; last `f9cbcfca0d`.                                                                              |
| `src/cron/service.heartbeat-ok-summary-suppressed.test.ts`               | Cron isolated job suppresses HEARTBEAT_OK summary; 2 cases; last `d4e59a3666`.                                                                                 |
| `src/cron/service.main-job-passes-heartbeat-target-last.test.ts`         | Cron main job preserves heartbeat target=last; 3 cases; last `1d4e4314dd`.                                                                                     |
| `src/infra/heartbeat-active-hours.test.ts`                               | Active-hours window handling including zero-width; 7 cases; last `ae4907ce6e`.                                                                                 |
| `src/infra/heartbeat-events-filter.test.ts`                              | Heartbeat event prompt/classification tables; grep saw describe blocks but no plain `it(` due table/each shape; last `19a2e9ddb5`.                             |
| `src/infra/heartbeat-events.test.ts`                                     | Heartbeat indicator/event formatting behavior; 4 cases; last `5eb99a9b50`.                                                                                     |
| `src/infra/heartbeat-reason.test.ts`                                     | Heartbeat reason coverage in table/each style; last `ec2663ee5d`.                                                                                              |
| `src/infra/heartbeat-runner.ghost-reminder.test.ts`                      | Ghost reminder heartbeat runner behavior; 17 cases; last `77876bd05c`.                                                                                         |
| `src/infra/heartbeat-runner.isolated-key-stability.test.ts`              | Isolated session key stability for heartbeat runner; 11 cases; last `8e20e6584d`.                                                                              |
| `src/infra/heartbeat-runner.model-override.test.ts`                      | Heartbeat model override behavior; 11 cases; last `9d8e923ddb`.                                                                                                |
| `src/infra/heartbeat-runner.respects-ackmaxchars-heartbeat-acks.test.ts` | Ack max chars handling for heartbeat acknowledgements; 6 cases; last `5ff72867bf`.                                                                             |
| `src/infra/heartbeat-runner.returns-default-unset.test.ts`               | Heartbeat interval/prompt defaults and unset behavior; 23 cases; last `7320dfc1ff`.                                                                            |
| `src/infra/heartbeat-runner.scheduler.test.ts`                           | Heartbeat scheduler start/interval behavior; 9 cases; last `1d4e4314dd`.                                                                                       |
| `src/infra/heartbeat-runner.sender-prefers-delivery-target.test.ts`      | Sender selection prefers delivery target; 1 case; last `a78dba4396`.                                                                                           |
| `src/infra/heartbeat-runner.skips-busy-session-lane.test.ts`             | Runner skips when target session lane is busy; 2 cases; last `f62766b996`.                                                                                     |
| `src/infra/heartbeat-runner.subagent-session-guard.test.ts`              | Heartbeat runner guard for subagent sessions/restart-sentinel adjacency; 1 case; last `fcd9a04e47`.                                                            |
| `src/infra/heartbeat-runner.transcript-prune.test.ts`                    | Transcript append/prune behavior for heartbeat; 2 cases; last `57f9f0a08d`.                                                                                    |
| `src/infra/heartbeat-runner.typing.test.ts`                              | Heartbeat typing callbacks while runner is active; 4 cases; last `89932593bb`.                                                                                 |
| `src/infra/heartbeat-schedule.test.ts`                                   | Heartbeat schedule helper phasing; 3 cases; last `9a4a9a5993`.                                                                                                 |
| `src/infra/heartbeat-typing.test.ts`                                     | Typing callback factory coverage; 1 case; last `89932593bb`.                                                                                                   |
| `src/infra/heartbeat-visibility.test.ts`                                 | Heartbeat visibility resolution; 13 cases; last `cb6b835a49`.                                                                                                  |
| `src/infra/heartbeat-wake.test.ts`                                       | Heartbeat wake queueing/dedup/runtime behavior; 14 cases; last `05835dd2d4`.                                                                                   |

Descriptor-test TBDs for §B-execute: extend `src/agents/tools/continuation-tools-registration.test.ts` for Surface 1 schema + loud failure, and extend post-rebase `src/infra/session-delivery-queue.storage.test.ts` for Surface 2 `traceparent` round-trip + idempotency.

## §4 — rebase (copilot fills in)

### §4 plan baked + rebase completed

- Ref verification from this worktree before rebase: `karmaterminal-2026.4.24-base` => `cbcfdf62c7297bda66009ea7476f053c3e9addab`; `origin/silas/rebase/v2026.4.22-feature` => `140f74956d84d524e1fc179ca05b4247aa8ca637`; pre-rebase candidate tip => `7fb1c455b723c473ed33dd1fad89338571f86edb`.
- Replay accounting: target..origin/silas had 49 commits; target..candidate had 53 commits because it included the 49-commit replay set plus 4 journal/seed commits.
- Cael plan comparison: `/tmp/oc-325-rebase/rebase-plan.txt` was not readable from this lane, so no direct plan diff is available; classification is independent.
- Baked rebase todo restored as `tmp-rebase-plan-gpt2.txt` on the post-rebase lineage. The todo itself was used by the sequence editor and therefore did not replay as a commit during the rebase; I restored it after rebase completion for cohort visibility.
- Classification summary for the 49 replay commits: 14 PICK continuation/doc/test/fix commits; 1 FOLD (`b2b2616f64` note cleanup folded into `198758e66b`); 4 DROP-release-prep (`579f00313b`, `0ec75a6ab4`, `5cd79da5b1`, `945a1922cb`); 1 DROP-generated-baseline/regenerate-after-rebase (`827d3e9150`); 29 DROP-already-upstream (all cherry-minus commits plus same-subject v24 replacements for docker/live/session/QA/status/plugin allowlist commits).
- Non-continuation cherry-plus drops checked against `karmaterminal-2026.4.24-base`: target already has same-subject replacements for `aef4fc9178`, `e515ea1f31`, `7e5f67c6a2`, `aa1908bf38`, `dfcce38a36`, `7ee46a3ab9`, and `00bd2cf7a3`, so replaying old variants would reintroduce release-window noise.
- Checkpoint incident: committing the unknown-root plan file through the normal hook triggered fail-safe all-lanes; the hook/test path polluted local HEAD with unrelated tiny test-history commits and briefly pushed bad tip `d52657db6a60b95a1443b50f698515002c9452aa`. This was before the §5 savegame boundary. I reset the branch pointer back to the last good OpenClaw tip with the worktree preserved and used `--force-with-lease` only to undo that accidental pre-savegame visibility push.
- Rebase stopped at `198758e66b feat(continuation): core implementation` with 9 conflicts: `src/agents/subagent-announce-delivery.ts`, `src/agents/subagent-announce.ts`, `src/agents/subagent-spawn.test-helpers.ts`, `src/agents/system-prompt.ts`, `src/auto-reply/reply/agent-runner-execution.ts`, `src/auto-reply/reply/agent-runner.ts`, `src/auto-reply/reply/session-reset-model.ts`, `src/gateway/server-methods/agent.ts`, `src/status/status-text.ts`.
- Conflict resolution shape: preserve v24 host rewrites/retry/fallback/lazy-boundary structures, then thread continuation semantics through them. Specifics: added `continuationTrigger` to direct announce delivery while keeping thread-fallback retry; kept silent/skip announce chain accounting; moved spawn helper mocks to `subagent-registry-spawn-runtime`; kept sessions_spawn isolated-context prompt guidance plus continue_delegate guidance; combined runtime outcome plan with continuation wrapped result typing; kept diagnostic trace freeze plus continuation heartbeat/UUID imports; used normalized session store persistence in reset-model; threaded gateway `continuationTrigger`/`drainsContinuationDelegateQueue`; kept `/status` continuation row imports.
- Rebase completed at `85675e7ebd8a22c12fc5519f1b2ec624feae8ced` before restoring this §4 journal/plan visibility commit. `note.txt` is absent after the `b2b2616f64` fixup.
- Baseline regeneration done on the v2026.4.24 base: `pnpm config:docs:gen` wrote `docs/.generated/config-baseline.sha256`, committed as `ef833e498b`; `pnpm plugin-sdk:api:gen` wrote `docs/.generated/plugin-sdk-api-baseline.sha256`, committed as `7e4d6c995f`.

## §5 — savegame push (copilot fills in)

## §6 — verification (copilot fills in)

## §B-execute — Surfaces 1+2 descriptor edits (copilot fills in)

## §8 — declare done (copilot fills in)
