# test-trap walker journal - copilot/gpt-5.5

worktree: /home/figs/flesh_beast_best_beast/openclaw-wt-test-trap-20260430
branch: frond-scribe/20260430/test-trap-and-broad-walk
base: origin/cael/325-canonical2 @ cf7830ffb37 (HEALTHY canonical track)
workorder: /home/figs/flesh_beast_best_beast/WORKORDER-test-trap-20260430.md
project: karmaterminal #56 ("2026.4.24 - cbcfdf62 frond release track")
PROJECT_ID: PVT_kwDOAYLGvs4BVtmL
STATUS_FIELD_ID: PVTSSF_lADOAYLGvs4BVtmLzhRHcUA
NTK reference issue: #436
repair tracking issue: #433
prior walker output: frond-scribe/20260429/release-notes-canonical2 @ e5be9f5a07

started: 2026-04-30T03:36Z

## §0 guardrails - ack on first commit

- Operate only in assigned worktree.
- Do not touch live runtime tree, protected branches, existing issues, project structure, installs, tests, or CI.
- GitHub mutations for this lane are scoped to creating new findings issues, adding them to project 56, setting Status=Todo, and applying permitted labels.

## Checkpoint: read-completed

- Branch confirmed: `frond-scribe/20260430/test-trap-and-broad-walk`.
- Worktree scope confirmed: operate only in this assigned worktree; do not touch the live runtime tree or other protected branches.
- Workorder read first and followed as controlling instructions.
- `pnpm docs:list` was available and run before docs reads.
- Required local docs read:
  - `docs/design/continue-work-signal-v2.md`
  - `CLAUDE.md`
  - `AGENTS.md`
  - `docs/AGENTS.md` surfaced by tooling for docs edits.
- Required GitHub/project context read:
  - `karmaterminal/openclaw#433` body and all comments via JSON issue API. `gh issue view --comments` hits the GitHub Projects classic deprecation GraphQL error, so JSON read path was used instead.
  - `karmaterminal/openclaw#436` body and comments via JSON issue API.
  - Project 56 Status field verified; `Todo` option id is `f75ad846`.
- Required prior-walker context read from `frond-scribe/20260429/release-notes-canonical2`:
  - `docs/release-notes/PR-DESCRIBE.md`
  - `docs/release-notes/VERIFICATION-PUNCHLIST.md`
  - `docs/release-notes/RELEASE-NOTES-DRAFT.md`
  - prior inventory files: `audit-lane-narrow-fold.txt`, `canonical2-vs-feature-squashed.txt`, `canonical2-vs-v2026.4.24.txt`
- Required bootstrap runbook read from `karmaterminal/openclaw-bootstrap/PRINCE-CODE-AGENT-RUNBOOK.md`; relevant rules: remote-first/checkpoint pushes, journal as cohort artifact, exact-SHA CI discipline, and tests as guard/proof discipline.
- Discord directive IDs were not available from repo search or session-store search (session-store returned 404). Applied the relayed workorder summaries as controlling context:
  - stabilize canonical -> integration tests -> squash -> upstream PR
  - keep `package.json` at `2026.4.24`
  - do not sacrifice quality after a corrected mistake
  - volatile Maps/Sets/WeakMaps that carry continuation/queue state should be eliminated or explicitly justified.
- Key risk frame from #433: broken step-9 push mixed canonical mode/ChainState callers with legacy boolean delegate-store/types; the guard-test walk must catch incomplete substrate folds and adjacent partial-refold shapes.
- Next checkpoint: generate fresh delta receipts under `docs/test-trap-walk/`, then code-walk the canonical2 continuation surface.

## Checkpoint: delta-files-generated

- Generated fresh §3 receipt files under `docs/test-trap-walk/` using exact workorder refs:
  - `canonical2-vs-v2026.4.24.txt` (362 lines)
  - `canonical2-vs-feature-squashed.txt` (1400 lines)
  - `broken-push-forensic.txt` (65 lines)
- The broken-push forensic file includes the required commentary on the missing `PendingContinuationDelegate.mode` shape, missing `ChainState` import, and missing delegate-store/type shim conversion.
- Next checkpoint: code-walk the canonical2 continuation surface at `cf7830ffb3`, map existing guards, and draft issue findings.

## Checkpoint: code-walk-noted

- Walked the §4 continuation surface. Workorder globs contain two stale path families; actual files walked include `src/agents/tools/{continue-delegate-tool,request-compaction-tool,continuation-tools-registration}*.ts` and `src/auto-reply/reply/session-usage.ts`.
- Added `docs/test-trap-walk/codewalk-file-list.txt` as the exact walk receipt (112 files after adding compatibility shims from the #433 forensic surface).
- Legend: `Map none` = no Map/Set/WeakMap in file; `Map safe` = local/test/cache/timer/handle state where loss is expected; `Map load` = queued/pending/session continuation state whose loss matters unless explicitly accepted; `Gap` names the issue candidate when the current tests are proof-like but not trap-like enough.

### §4 per-file ledger

- `src/agents/openclaw-tools.ts` - built-in/plugin tool assembly; Map safe (`existingToolNames` Set); guarded by `continuation-tools-registration.test.ts`; Gap: request_compaction registration truth table.
- `src/agents/subagent-announce.capture-completion-reply.test.ts` - completion capture tests; Map none; guards capture reply formatting; Gap no.
- `src/agents/subagent-announce-capture.ts` - capture completion reply helper; Map none; guarded by capture tests; Gap no.
- `src/agents/subagent-announce.chain-guard.test.ts` - bracket/tool chain-length guard tests; Map none; guards chain boundary; Gap: runtime-state Map substrate not asserted.
- `src/agents/subagent-announce.continuation-drain.test.ts` - continuation drain chain-state tests; Map none; guards inherited chain state; Gap no.
- `src/agents/subagent-announce.continuation.runtime.test.ts` - bundled runtime entry tests; Map none; guards entry path + two exports; Gap: all destructured exports not pinned.
- `src/agents/subagent-announce.continuation.runtime.ts` - co-located runtime entry for continuation drain; Map none; guarded partly by runtime test; Gap: full export contract.
- `src/agents/subagent-announce.continuation.test.ts` - announce continuation/bracket tests; Map safe test mock state; guards silent-wake, cost cap, generation drift; Gap: compatibility state substrate.
- `src/agents/subagent-announce-delivery.runtime.ts` - delivery runtime entry; Map none; guarded by delivery tests; Gap no.
- `src/agents/subagent-announce-delivery.test.ts` - delivery helper tests; Map none; guards delivery routing; Gap no.
- `src/agents/subagent-announce-delivery.ts` - announce delivery helper; Map none; guarded by delivery tests; Gap no.
- `src/agents/subagent-announce-dispatch.test.ts` - dispatch tests; Map none; guards dispatch behavior; Gap no.
- `src/agents/subagent-announce-dispatch.ts` - dispatch helper; Map none; guarded by dispatch tests; Gap no.
- `src/agents/subagent-announce.format.e2e.test.ts` - broad announce formatting e2e; Map safe test Sets; guards output regressions; Gap no.
- `src/agents/subagent-announce-origin.ts` - origin/delivery context helpers; Map none; guarded by announce tests; Gap no.
- `src/agents/subagent-announce-output.ts` - completion output rendering/dedupe; Map safe local grouping cache; guarded by announce output tests; Gap no.
- `src/agents/subagent-announce-queue.test.ts` - announce queue retry tests; Map none; guards in-process retry; Gap: restart/substrate decision.
- `src/agents/subagent-announce-queue.ts` - queued announce delivery; Map load (`ANNOUNCE_QUEUES` holds completion messages); guarded by retry tests; Gap: safe-volatile/substrate justification.
- `src/agents/subagent-announce.registry.runtime.ts` - registry runtime entry; Map none; guarded by announce tests; Gap no.
- `src/agents/subagent-announce.runtime.ts` - announce runtime entry; Map none; guarded by announce tests; Gap no.
- `src/agents/subagent-announce.silent-wake.test.ts` - silent/silent-wake routing tests; Map none; guards wake-on-return; Gap no.
- `src/agents/subagent-announce.test-support.ts` - announce test helpers; Map none; test support only; Gap no.
- `src/agents/subagent-announce.test.ts` - main announce tests; Map none; guards flow basics; Gap no.
- `src/agents/subagent-announce.timeout.test.ts` - timeout announce tests; Map none; guards timeout path; Gap no.
- `src/agents/subagent-announce.ts` - main announce/chain-hop flow; Map safe per-call session-entry caches; guarded by many announce tests; Gap: compatibility runtime state remains volatile.
- `src/agents/tools/continuation-tools-registration.test.ts` - continuation tool descriptor tests; Map none; guards continue_delegate only; Gap: request_compaction + exact mode schema.
- `src/agents/tools/continue-delegate-tool.test.ts` - continue_delegate behavior tests; Map none; guards maxDelegatesPerTurn hot reload + post-compaction staging; Gap: exact descriptor trap.
- `src/agents/tools/continue-delegate-tool.ts` - continue_delegate tool; Map none; guarded by tool tests; Gap: comment still describes old module-level store, and descriptor is under-guarded.
- `src/agents/tools/request-compaction-tool.callsite-threading.test.ts` - cloned compaction closure tests; Map none; guards provider/model/auth profile shape by recreation; Gap: actual callsite integration.
- `src/agents/tools/request-compaction-tool.classifier-emission.test.ts` - classifier log emission tests; Map none; guards failure-code breadcrumbs; Gap no.
- `src/agents/tools/request-compaction-tool.test.ts` - request_compaction guard tests; Map none; guards threshold/rate/dedup basics; Gap: pending Set rejection/restart contract.
- `src/agents/tools/request-compaction-tool.ts` - request_compaction tool; Map safe/load split (`sessionGuardState` justified, `pendingCompactionSessions` in-flight Set); guarded by tool tests; Gap: pending Set safe-volatile trap.
- `src/agents/tools/request-compaction-tool.volitional-threading.test.ts` - volitional counter/log tests; Map none; guards truthful counters; Gap no.
- `src/auto-reply/continuation/config.test.ts` - runtime config tests; Map none; guards defaults/bounds; Gap: minDelayMs > maxDelayMs invariant.
- `src/auto-reply/continuation/config.ts` - continuation runtime config; Map none; guarded by config tests; Gap: cross-field delay invariant.
- `src/auto-reply/continuation/context-pressure.test.ts` - context pressure unit tests; Map none; guards band dedup/post-compaction/sub-25 threshold; Gap: restart semantics.
- `src/auto-reply/continuation/context-pressure.ts` - pressure band detector; Map load-ish `lastFiredBand` per session dedup; guarded by tests; Gap: safe-volatile decision.
- `src/auto-reply/continuation/delegate-dispatch-post-compaction.test.ts` - post-compaction dispatch failure tests; Map none; guards logging/events; Gap: retry/no-retry decision.
- `src/auto-reply/continuation/delegate-dispatch.test.ts` - hedge timer cleanup tests; Map safe test fixture; guards hedge ref cleanup; Gap: spawn failure consumes durable delegate.
- `src/auto-reply/continuation/delegate-dispatch.ts` - delegate dispatch + hedge timers; Map safe hedge timer handles; guarded by dispatch tests; Gap: durable delegate failure semantics.
- `src/auto-reply/continuation-delegate-store.post-compaction-substrate.test.ts` - legacy shim same-substrate tests; Map none; guards tool/runner shared substrate; Gap: broaden to canonical import/type shape.
- `src/auto-reply/continuation-delegate-store.test.ts` - legacy shim store tests; Map none; guards legacy import path; Gap: #433 partial-fold trap.
- `src/auto-reply/continuation/delegate-store.test.ts` - canonical TaskFlow store tests; Map safe test mock registry; guards FIFO/modes/delay/staging; Gap: corrupt payload + concurrency.
- `src/auto-reply/continuation-delegate-store.ts` - compatibility shim to canonical store; Map none; guarded by legacy tests; Gap: red-squash partial fold.
- `src/auto-reply/continuation/delegate-store.ts` - TaskFlow-backed delegate store; Map safe delayed reservation handles; guarded by store tests; Gap: corrupt payload/concurrent finish.
- `src/auto-reply/continuation-delegate.types.ts` - compatibility type shim; Map none; guarded only by compile; Gap: mode-shape/ChainState structural trap.
- `src/auto-reply/continuation/lazy.runtime.ts` - lazy continuation runtime boundary; Map none; guarded indirectly; Gap: dynamic/static import boundary trap if build not run.
- `src/auto-reply/continuation/post-compaction-release.test.ts` - lifecycle release tests; Map none; guards helper ordering; Gap: caller gates only code-read.
- `src/auto-reply/continuation/post-compaction-release.ts` - post-compaction pressure + delegate release; Map none; guarded by helper tests; Gap: caller boundary + retry/no-retry decision.
- `src/auto-reply/continuation/scheduler.test.ts` - scheduler budget tests; Map none; guards no generation guard/caps; Gap no.
- `src/auto-reply/continuation/scheduler.ts` - chain/cost scheduler; Map none; guarded by scheduler tests; Gap no.
- `src/auto-reply/continuation/signal.test.ts` - signal parser tests; Map none; guards signal parsing; Gap no.
- `src/auto-reply/continuation/signal.ts` - continue-work/delegate signal parsing; Map none; guarded by signal tests; Gap no.
- `src/auto-reply/continuation/state.test.ts` - chain-state tests; Map none; guards persisted chain load; Gap: runtime duplicate pending Map elsewhere.
- `src/auto-reply/continuation/state.ts` - canonical continuation state/timers; Map safe timer handles/refs; delegate pending derived from TaskFlow; guarded by state/dispatch tests; Gap no.
- `src/auto-reply/continuation/types.ts` - continuation types incl. `PendingContinuationDelegate.mode` + `ChainState`; Map none; guarded by compile/tests; Gap: structural type trap.
- `src/auto-reply/reply/agent-runner-auth-profile.ts` - auth profile helper; Map none; guarded by runner tests; Gap no.
- `src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts` - runner delegate fire span tests; Map none; guards span lifecycle; Gap no.
- `src/auto-reply/reply/agent-runner.continuation-work-span.test.ts` - runner continuation work span tests; Map none; guards span lifecycle; Gap no.
- `src/auto-reply/reply/agent-runner-direct-runtime-config.test.ts` - direct runtime config tests; Map none; guards config threading; Gap no.
- `src/auto-reply/reply/agent-runner-execution.test.ts` - runner execution tests; Map safe test Sets; guards many runner branches; Gap: actual request_compaction callsite absent.
- `src/auto-reply/reply/agent-runner-execution.ts` - embedded/CLI run loop and compaction tool closure; Map safe local Sets; guarded by runner tests; Gap: closure parity tested by clone, not callsite.
- `src/auto-reply/reply/agent-runner-helpers.test.ts` - runner helper tests; Map none; guards helper behavior; Gap no.
- `src/auto-reply/reply/agent-runner-helpers.ts` - runner helpers; Map none; guarded by helper tests; Gap no.
- `src/auto-reply/reply/agent-runner.media-paths.test.ts` - media path tests; Map none; guards media behavior; Gap no.
- `src/auto-reply/reply/agent-runner-memory.dedup.test.ts` - memory dedupe tests; Map none; guards memory dedupe; Gap no.
- `src/auto-reply/reply/agent-runner-memory.test.ts` - memory tests; Map none; guards memory behavior; Gap no.
- `src/auto-reply/reply/agent-runner-memory.ts` - memory prompt helpers; Map none; guarded by memory tests; Gap no.
- `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts` - miscellaneous runner tests; Map none; guards misc paths; Gap no.
- `src/auto-reply/reply/agent-runner-payloads.test.ts` - payload tests; Map safe test Sets; guards payload helpers; Gap no.
- `src/auto-reply/reply/agent-runner-payloads.ts` - payload conversion; Map safe local Sets; guarded by payload tests; Gap no.
- `src/auto-reply/reply/agent-runner-reminder-guard.ts` - reminder guard; Map none; guarded by runner tests; Gap no.
- `src/auto-reply/reply/agent-runner.runreplyagent.e2e.test.ts` - runReplyAgent e2e tests; Map none; guards end-to-end runner flow; Gap no.
- `src/auto-reply/reply/agent-runner-runtime-config.test.ts` - runtime config tests; Map none; guards config; Gap no.
- `src/auto-reply/reply/agent-runner.runtime.ts` - runner runtime entry; Map none; guarded indirectly; Gap no.
- `src/auto-reply/reply/agent-runner-session-reset.test.ts` - reset tests; Map none; guards reset behavior; Gap no.
- `src/auto-reply/reply/agent-runner-session-reset.ts` - session reset cleanup; Map safe local Set; guarded by reset tests; Gap no.
- `src/auto-reply/reply/agent-runner.test-fixtures.ts` - runner test fixtures; Map none; test support only; Gap no.
- `src/auto-reply/reply/agent-runner.ts` - top-level runner orchestration; Map safe prompt-segment/local pending-tool Sets; guarded broadly; Gap no.
- `src/auto-reply/reply/agent-runner-usage-line.ts` - usage line formatter; Map none; guarded by runner tests; Gap no.
- `src/auto-reply/reply/agent-runner-utils.secret-resolution.test.ts` - secret resolution tests; Map safe test Sets; guards secret resolution; Gap no.
- `src/auto-reply/reply/agent-runner-utils.test.ts` - runner util tests; Map none; guards utils; Gap no.
- `src/auto-reply/reply/agent-runner-utils.ts` - runner utils; Map none; guarded by util tests; Gap no.
- `src/auto-reply/reply/context-pressure.integration.test.ts` - pressure event queue integration; Map none; guards queue ordering; Gap no.
- `src/auto-reply/reply/context-pressure.test.ts` - reply pressure tests; Map none; guards wrapper behavior; Gap no.
- `src/auto-reply/reply/context-pressure.ts` - reply-side pressure wrapper; Map none; guarded by tests; Gap no.
- `src/auto-reply/reply/continuation-runtime.test.ts` - reply runtime config tests; Map none; guards runtime config; Gap no.
- `src/auto-reply/reply/continuation-runtime.ts` - reply runtime config resolver; Map none; guarded by tests; Gap no.
- `src/auto-reply/reply/followup-runner.test.ts` - followup runner tests; Map safe mocks; guards followup delegation; Gap: actual disk durability + request_compaction closure callsite.
- `src/auto-reply/reply/followup-runner.ts` - queued followup runner; Map none; guarded by tests; Gap: disk durability called out in swim-37 README.
- `src/auto-reply/reply/session-usage.ts` - usage/session store patch writer; Map none; guarded indirectly; Gap: chain-field race/updatedAt negative coverage.
- `src/config/sessions/store-cache.ts` - session store cache helpers; Map none; guarded by store tests; Gap no.
- `src/config/sessions/store-entry.ts` - session entry helpers; Map safe local Sets; guarded by store tests; Gap no.
- `src/config/sessions/store-load.ts` - load session store; Map none; guarded by store tests; Gap no.
- `src/config/sessions/store-lock-state.ts` - in-process session-store lock queue; Map safe/load process-local queue; guarded by lock tests; Gap: allowlist in static volatile audit.
- `src/config/sessions/store.lock.test.ts` - lock timeout tests; Map none; guards lock options; Gap no.
- `src/config/sessions/store-maintenance-runtime.ts` - maintenance runtime boundary; Map none; guarded by maintenance tests; Gap no.
- `src/config/sessions/store-maintenance.ts` - maintenance/pruning helpers; Map none; guarded by pruning tests; Gap no.
- `src/config/sessions/store-migrations.ts` - store migrations; Map none; guarded by store tests; Gap no.
- `src/config/sessions/store.pruning.integration.test.ts` - pruning integration; Map none; guards pruning; Gap no.
- `src/config/sessions/store.pruning.test.ts` - pruning unit tests; Map none; guards pruning; Gap no.
- `src/config/sessions/store-read.test.ts` - store read tests; Map none; guards read behavior; Gap no.
- `src/config/sessions/store-read.ts` - store read helpers; Map none; guarded by read tests; Gap no.
- `src/config/sessions/store.runtime.ts` - store runtime entry; Map none; guarded indirectly; Gap no.
- `src/config/sessions/store.session-key-normalization.test.ts` - key normalization tests; Map none; guards key normalization; Gap no.
- `src/config/sessions/store.ts` - main session-store writer/maintenance; Map safe local snapshots/Sets; guarded by store tests; Gap: updatedAt churn negative coverage.
- `src/config/zod-schema.continuation.test.ts` - continuation config schema tests; Map none; guards individual fields + legacy `taskFlowDelegates`; Gap: min/max relation + removal trap.
- `studies/swim-37/harness/durability/durability-fixture.ts` - durability fixture; Map none; guarded by harness use; Gap no.
- `studies/swim-37/harness/durability/README.md` - harness scope and known gaps; Map none; documents open gaps; Gap: followup disk durability + updatedAt churn.
- `studies/swim-37/harness/durability/s1-two-hop-chain.test.ts` - two-hop chain durability harness; Map safe mock TaskFlow; guards cross-surface dispatch/persist; Gap no.
- `studies/swim-37/harness/durability/s2-followup-token-chain.test.ts` - followup token contract harness; Map safe mock TaskFlow; guards persist primitive, not actual followup path; Gap: actual callsite.
- `studies/swim-37/harness/durability/s3-restart-roundtrip.test.ts` - simulated restart durability harness; Map safe mock TaskFlow; guards disk reload after restart; Gap no.

Issue slate distilled from this ledger: 19 findings across regression-known, architectural-decision, volatile-audit, guard-test, trap-test, and coverage. No source-code changes or test/install/CI commands were run.

## Checkpoint: first-10-issues-filed

- Created first batch of 10 new issues only; added each to karmaterminal project 56 and set Status=Todo.
- Issues:
  - #437 `regression-known` - partial TaskFlow delegate fold from #433 broken push.
  - #438 `architectural-decision` - mode-only `PendingContinuationDelegate` at compatibility boundary.
  - #439 `volatile-audit` - reply `continuation-state` `delegatePendingFlags` Map.
  - #440 `volatile-audit` - context-pressure `lastFiredBand` restart/dedup contract.
  - #441 `guard-test` - static allowlist for session-keyed volatile Maps.
  - #442 `coverage` - followup-runner chain state disk durability through actual callsite.
  - #443 `coverage` - negative store-merge guard for `updatedAt` churn.
  - #444 `coverage` - actual request_compaction provider/auth callsite threading.
  - #445 `coverage` - request_compaction registration truth table.
  - #446 `trap-test` - continue_delegate descriptor mode enum and no boolean runtime shape.
