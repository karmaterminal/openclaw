# rebase candidate journal — swim-v29-copilot-exploratory

worktree: /home/figs/flesh_beast_best_beast/openclaw-wt-rebase-v29-copilot
branch: frond-scribe/20260429/rebase-copilot
base (rebase target): a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd (upstream v2026.4.29)
old-base: cbcfdf62c7297bda66009ea7476f053c3e9addab (karmaterminal-2026.4.24-base)
cohort-tip-at-fire: 9b31762f611028f296ea408cf332af5056fa4ac8
workorder: ./WORKORDER.md
track: exploratory for 2026.4.29
heartbeat: DISCORD_SPRITES_WEBHOOK (https://discord.com/api/webhooks/1499626882277048401/...)
heartbeat-username: swim-v29-copilot-exploratory
started: 2026-05-01T15:14:20+00:00

## §0 guardrails — acked

## §1 required reads — 2026-05-01T15:55Z

- Read order satisfied:
  1. `docs/design/continue-work-signal-v2.md` with `docs/AGENTS.md` scoped rules in mind.
  2. `CLAUDE.md` (same root content as `AGENTS.md` in this checkout).
  3. `AGENTS.md`.
  4. `openclaw-bootstrap/PRINCE-CODE-AGENT-RUNBOOK.md`.
  5. GitHub release notes for upstream `v2026.4.29`.
  6. Cohort commit list from `cbcfdf62c7297bda66009ea7476f053c3e9addab..origin/cael/325-canonical2`.
- Docs index: `pnpm docs:list` is available and ran before relevant docs reads; relevant continuation/RFC and root rules were read.
- Upstream target verified locally: `a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd` resolves to `test(qa): extend restart boundary wait`.
- Cohort tip at read time: `origin/cael/325-canonical2` = `9b31762f611028f296ea408cf332af5056fa4ac8`.
- Readbook constraints carried forward: remote-first journal pushes; no force-push after first push; fork CI must be manually dispatched via `karmaterminal/openclaw-bootstrap`; journal at repo root is the durable cohort read surface.
- RFC source-of-truth notes:
  - Continuation is documented as tools-first with response-token fallback: `continue_work()`, `continue_delegate()`, `request_compaction()`.
  - Delegate persistence is documented as Task Flow-backed, with `session-delivery-queue` handling restart-safe local cross-session delivery, idempotency, retry, and post-compaction handoff.
  - `targetSessionKey` remains descriptor-only in the RFC; future `targetSessionKeys[]` is named but not shipped by the RFC.
  - Post-compaction delegates are expected to return silently and wake successor sessions.
  - RFC warns that routing metadata and topology data are load-bearing for silent-wake, post-compaction dispatch, and subagent tool access.
- v29 release-note collision shortlist for §3:
  - HIGH: active-run steering default (`steer`, 500ms debounce) in messages/queue and auto-reply queueing.
  - HIGH: gateway/session abort wait semantics, upstream `1f1f70a23f`.
  - HIGH: spawned subagent routing metadata `spawnedBy`, upstream `443ca4865d`.
  - MED: visible reply enforcement (`messages.visibleReplies`), upstream `e1fd27fb24` plus follow-up docs/fixes.
  - MED: inferred follow-up commitments (`commitments.*`), upstream `8e4035d09a` and follow-ups.
  - MED: subagent orphan recovery/tombstone, upstream `838d0c02e3`.
  - MED: embedded runner blank visible prompt skip, upstream `a4d338c170`.
  - LOW-MED: tool-result guard budget, upstream `9ee651e1f5`.
  - LOW: Bedrock Opus 4.7 thinking parity, memory wiki/Active Memory filters, stale model catalog.
- Cohort feature commits most relevant to the collision map:
  - Core continuation: `8ecf0c0b83` through `1e21522fea`, plus swim-37 tracer chain `d533d5c720`..`42f1bb9c14`.
  - Run-state/blocked-liveness: `9afc94e86d`, `a5434fbba7`, `356d05a2ba`.
  - Continuation caps/pending-state: `5b360c6998`, `6302e5968d`, `a3dcc2adc2`, `1e21522fea`.
  - Subagent announce runtime/dist: `23189e3ed1`.
  - Compaction attribution: `9b31762f61`.

Next: §3 code walk across v29 base and cohort tip for high-risk surfaces before starting the actual rebase.

## §3 code walk + touchpoint mapping — 2026-05-01T16:31Z

### Scope receipts

- Read scoped rules for `src/agents/AGENTS.md`, `src/gateway/AGENTS.md`, and `src/gateway/protocol/AGENTS.md`.
- Corrected an initial subagent finding: upstream `v2026.4.29` does **not** have `src/auto-reply/continuation/*`; that standalone continuation directory is cohort-only on `origin/cael/325-canonical2`. v29 does have `src/auto-reply/reply/post-compaction-context.*`, active-run queue steering, commitments, orphan recovery, and tool-result guard surfaces.
- Exact overlapping hot files touched by both upstream and cohort include:
  - `src/auto-reply/reply/agent-runner.ts` — upstream `+122/-63`; cohort `+1367/-174`.
  - `src/auto-reply/reply/agent-runner-execution.ts` — upstream `+365/-17`; cohort `+250/-12`.
  - `src/agents/openclaw-tools.ts` — upstream `+14`; cohort `+48`.
  - `src/agents/pi-embedded-runner/run/attempt.ts` — upstream `+710/-334`; cohort `+3`.
  - `src/agents/subagent-announce.ts` — upstream `+7/-4`; cohort `+708/-39`.
  - `src/gateway/protocol/schema/agent.ts` — upstream `+12`; cohort `+4`.

### HIGH-risk touchpoint decisions

| Touchpoint                        | Upstream receipts                                                                                                                                                                                                                                                                                                    | Cohort receipts                                                                                                                                                                | Decision                                                                                                  | Rebase recommendation                                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active-run steering default       | `4a6e10ece8`, `30a2b3049a`, `58153d38af`; `src/auto-reply/reply/queue/settings.ts` defaults mode to `steer`; `src/auto-reply/reply/queue/steering.ts` drains `steer`/`steer-backlog` as `all` and legacy `queue` as one-at-a-time; `src/auto-reply/reply/agent-runner.ts` now imports/uses `queueEmbeddedPiMessage`. | Cohort continuation adds large runner/followup/post-compaction state and blocked-liveness finalization but does not own queue mode defaults.                                   | **compose** with likely textual conflicts in `agent-runner.ts`, `get-reply-run.ts`, and `queue/types.ts`. | Keep upstream steering defaults/debounce; reapply cohort continuation hooks around runner finalization without changing steering semantics.                                                    |
| Session abort wait semantics      | `1f1f70a23f`; `src/gateway/chat-abort.ts` tracks active chat runs and abort grace; `src/gateway/server-methods/{chat,agent,sessions}.ts` wait for terminal state instead of resolving early.                                                                                                                         | Cohort relies on `src/auto-reply/reply/reply-run-registry.ts` active-run state, `waitForIdle`, `abortByUser`, and ReplyRunAlreadyActive handling; Ronan leak report maps here. | **merge-required**.                                                                                       | Adopt upstream server-method wait semantics, then ensure reply-run registry clears/waits against the same session key/id mapping so `ReplyRunAlreadyActiveError` cannot leak after abort.      |
| Spawned subagent routing metadata | `443ca4865d`; `src/gateway/protocol/schema/agent.ts` and `schema/logs-chat.ts` expose optional `spawnedBy`; `src/gateway/server-chat.ts` resolves/caches spawnedBy for chat/agent events.                                                                                                                            | Cohort #484 adds `src/agents/subagent-announce.continuation.runtime.ts` runtime co-location and extensive `subagent-announce.ts` continuation drain/silent-wake topology.      | **compose**.                                                                                              | Keep upstream `spawnedBy` as additive lineage metadata; it does not supersede cohort continuation drain/silent-wake runtime because it does not dispatch or consume child continuation queues. |

### MEDIUM-risk touchpoint decisions

| Touchpoint                           | Upstream receipts                                                                                                                                                                   | Cohort receipts                                                                                                                                                                                    | Decision                                            | Rebase recommendation                                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visible-reply enforcement            | `e1fd27fb24`, `3c636208b0`; config/types/schema and `src/auto-reply/reply/source-reply-delivery-mode.ts`; `agent-runner-execution.ts` participates in payload delivery mode.        | #475/#487/#500 inject exactly one blocked-liveness marker in `agent-runner-execution.ts`: standalone notice only when no error payload, otherwise prefix error payload with `⛔ Session blocked:`. | **merge-required** for code, **compose** by design. | Preserve upstream visible-reply resolver/fallback; preserve cohort single-marker rule. Explicitly verify blocked-liveness marker is not suppressed when message-tool-only delivery is unavailable. |
| Inferred follow-up commitments       | `8e4035d09a` plus follow-ups; adds `src/commitments/*`, `src/commands/commitments.ts`, config, and heartbeat extraction/delivery.                                                   | Cohort continuation/RFC provides agent-elected turn continuation and post-compaction delegate flows, not natural-language commitment extraction.                                                   | **compose**.                                        | Keep commitments as independent opt-in reminder substrate; do not try to replace continuation with commitments or vice versa.                                                                      |
| Subagent orphan recovery + tombstone | `838d0c02e3`; adds `src/agents/subagent-orphan-recovery.ts` and `src/agents/subagent-recovery-state.ts` with attempt bounds and wedged tombstone.                                   | Cohort subagent announce drains child `continue_delegate` queues after subagent settle; silent-wake and chain-state inheritance live in `subagent-announce.*`.                                     | **merge-required**.                                 | Keep upstream recovery/tombstone, then ensure recovered/synthetic completion still runs cohort child-continuation drain exactly once.                                                              |
| Embedded-runner blank prompt skip    | `a4d338c170`; `src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts` and `attempt.ts` guard blank visible prompt submissions while preserving runtime-only/media-only turns. | Cohort touched embedded runner for continuation, compaction attribution, and blocked-liveness metadata, but not this blank-prompt policy.                                                          | **supersede-up**.                                   | Adopt upstream guard unchanged unless a direct continuation test fails; do not duplicate blank-prompt checks in cohort code.                                                                       |
| Tool-result guard budget             | `9ee651e1f5`; `src/agents/pi-embedded-runner/tool-result-context-guard.ts` / `attempt.ts` uses resolved runtime context budget.                                                     | Cohort continuation cap logic is chain/delegate cost, not provider tool-result overflow.                                                                                                           | **compose**.                                        | Keep upstream guard and wire cohort continuation cap logic separately.                                                                                                                             |

### LOW-risk touchpoints

- Bedrock Opus 4.7 thinking parity: provider surface, no direct continuation collision. **compose**.
- Memory wiki / Active Memory chat filters: memory surface, no direct continuation collision. **compose**.
- Gateway stale model catalog: `src/gateway/models.ts`, no direct continuation collision. **compose**.

### RFC vs v29 drift

- v29 added a real `commitments.*` reminder feature, but it is not a `continue_work` replacement: it extracts/delivers inferred follow-up reminders via heartbeat, while the cohort RFC is about self-elected turns/delegates/compaction.
- v29 added `spawnedBy` lineage metadata that the RFC did not anticipate; cohort should adopt it as an event-routing primitive but keep its continuation drain runtime because lineage alone does not deliver queued child continuation work.
- v29 still lacks the cohort's standalone `src/auto-reply/continuation/*` implementation and TaskFlow-backed continuation delegate store. The RFC remains ahead of upstream here.
- v29 session abort wait semantics may cure part of the observed `ReplyRunAlreadyActiveError` leak, but only if composed with cohort reply-run-registry key rebinding and cleanup semantics.

### §3 bucket snapshot

- HIGH: 3 total — 2 compose, 1 merge-required.
- MEDIUM: 5 total — 2 compose, 1 supersede-up, 2 merge-required.
- LOW: 3 total — 3 compose.
- No **supersede-by-cohort** decisions yet; any such choice should require prince review after actual conflicts are visible.

## §9 blocker — branch push policy before §4 rebase

The assigned branch `frond-scribe/20260429/rebase-copilot` is already pushed to origin and currently contains the seed workorder/journal commit plus this lane's §1 journal checkpoint on top of the old `origin/cael/325-canonical2` history. Executing §4's `git rebase --onto a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd cbcfdf62c7297bda66009ea7476f053c3e9addab` on the assigned branch will rewrite the already-published branch and require a non-fast-forward push to publish the rebased candidate.

This conflicts with §0: "Never force-push your candidate branch after first push (it's the savegame)." It also conflicts with §2's non-negotiable target if we avoid rewriting: a merge/overlay commit would preserve old-base ancestry and fail `git merge-base HEAD a448042c... == a448042c...`.

Best guess: this lane needs explicit prince/figs authorization for one of these:

1. Permit a single `--force-with-lease` update of `frond-scribe/20260429/rebase-copilot` after the rebase, treating the current pushed journal as the savegame receipt.
2. Authorize a new assigned branch for the rebased candidate, leaving the current branch as the savegame.
3. Authorize local-only rebase artifacts without origin push, which violates remote-first and is not recommended.

Until clarified, §4 rebase execution is destructively ambiguous. I am stopping before the history rewrite rather than guessing.
