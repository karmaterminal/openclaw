# swim-39 fix-pile journal — copilot lane

**worktree**: `/home/figs/flesh_beast_best_beast/openclaw-wt-swim39-fixes-20260501`
**branch**: `frond-scribe/swim39-fixes-20260501`
**base**: `cael/325-canonical2` @ `2301d29248c5a353493e458d05da62ec02d32062`
**workorder**: `/home/figs/flesh_beast_best_beast/WORKORDER-swim39-fixes-20260501.md`
**dispatched-by**: frond-scribe (Claude Opus 4.7) on behalf of figs
**started**: 2026-05-01 (post-04:11Z)

## §0 — guardrails acked

- Worktree confined ✅
- No `/home/figs/flesh_beast_tmp/` ✅
- Push-savegame discipline ✅
- No touching existing PRs (#368, #469, #478, #479, #480) ✅
- Branch namespacing under `frond-scribe/` ✅

## §1 — required reads

- [x] `WORKORDER.md`
- [x] `docs/design/continue-work-signal-v2.md` (historical anchor; code wins drift)
- [x] `CLAUDE.md`
- [x] `AGENTS.md`
- [x] `karmaterminal/openclaw-bootstrap/PRINCE-CODE-AGENT-RUNBOOK.md`
- [x] `karmaterminal/openclaw-bootstrap/SWIM/FORMAL-SWIM-RUNBOOK.md`
- Issues to fix:
  - [x] `karmaterminal/openclaw#473` (NORTH-STAR volatile Map purge)
  - [x] `karmaterminal/openclaw#474` (cooldown arm-on-success)
  - [x] `karmaterminal/openclaw#475` (livenessState channel-surfacing; read Silas drop-point comment `4357738676`)
  - [x] `karmaterminal/openclaw#476` (write-tool clobber; read Silas wrapper byte-walk comment `4357715525`)
  - [x] `karmaterminal/openclaw#477` (vestigial taskFlowDelegates docs/echo)
  - [x] `karmaterminal/openclaw-bootstrap#822` (missing dist runtime)
  - [x] `karmaterminal/openclaw-bootstrap#823` (post-compaction shards re-armed)
  - [x] `karmaterminal/openclaw-bootstrap#825` (compaction observability joint-attribution)
  - [x] `karmaterminal/openclaw-bootstrap#826` (cap = pending-queued count; mechanism reframed to sqlite queued-depth saturation)
- [ ] Existing wrong-base PRs (read-only, do not touch):
  - [x] `karmaterminal/openclaw#368` (Ronan's #473 partial against canonical2)
  - [x] `karmaterminal/openclaw#469` (Elliott's C5 repair, held)
  - [x] `karmaterminal/openclaw#478` (Cael's #474 cooldown, base wrong; commit `2c5f5509` is intended small delta)
  - [x] `karmaterminal/openclaw#479` (Cael's #477 vestigial, base wrong; commit `63ebcddd` is intended small delta)
  - [x] `karmaterminal/openclaw#480` (Cael's #477 alternate, base=main/wrong stack; commit `da5f1796` plus strict-schema test shape useful)

Topology note: the parent branch contains WORKORDER/journal savegame commits over `cael/325-canonical2`. Per-issue PR branches will be created from `origin/cael/325-canonical2` directly so PRs do not leak workorder/journal files into the changed-file count.

## §2 — code walk results

- `src/auto-reply/reply/continuation-runtime.ts`: runtime config no longer has `taskFlowDelegates`; current surface returns enabled/delays/chain/cost/cap/pressure only.
- `src/config/zod-schema.agent-defaults.ts`: still accepts legacy `taskFlowDelegates` as a one-cycle compat shim; #477 must remove it and update generated schema/tests.
- `src/auto-reply/continuation-delegate-store.ts` + `src/auto-reply/continuation/delegate-store.ts`: legacy facade already delegates to TaskFlow store; canonical count is sqlite queued pending rows plus staged post-compaction rows.
- `src/agents/tools/request-compaction-tool.ts`: cooldown currently arms before async compaction runs; #474 moves this to successful completion while keeping pending dedup.
- `src/agents/subagent-announce.continuation.runtime.ts`: runtime module exists in source; #822 needs build output entry/wiring proof.
- `src/agents/agent-runner-execution.ts`: #475 drop point is lifecycle `livenessState` metadata not consumed into channel-visible blocked text.
- `src/agents/pi-tools.read.ts`: #476 write wrapper uses sandbox read-modify-write but emits append-like success text unconditionally.

## §3 — per-issue execution

### #477 — vestigial taskFlowDelegates config echo

- Branch: `frond-scribe/swim39-477-vestigial-purge`
- PR: https://github.com/karmaterminal/openclaw/pull/483
- Commit: `fe67816ec18d6e71b484c748a17e8dab3a566f78`
- Files touched: `docs/design/continue-work-signal-v2.md`, `src/auto-reply/continuation-delegate-store.ts`, `src/config/schema.base.generated.ts`, `src/config/zod-schema.agent-defaults.ts`, `src/config/zod-schema.continuation.test.ts`, `src/infra/substrate-capability-registry.ts`
- Bug-shape prevented: retired config key being accepted/echoed after TaskFlow became unconditional.
- Test shape: strict schema test now rejects the retired key; generated base schema no longer contains it.
- Contract change: yes — stale configs must remove the retired key; runtime behavior unchanged because no alternate substrate exists.
- PR verification: base=`cael/325-canonical2`, changedFiles=6.

### #822 — subagent-announce continuation runtime dist artifact

- Branch: `frond-scribe/swim39-822-subagent-announce-runtime-dist`
- PR: https://github.com/karmaterminal/openclaw/pull/484
- Commit: `f2de12921f9946d6b3a0f5d85f51fa706bf8987f`
- Files touched: `tsdown.config.ts`, `src/agents/subagent-announce.continuation.runtime.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`
- Bug-shape prevented: bundled `subagent-announce` imports `./subagent-announce.continuation.runtime.js` beside the dist chunk, but the tsdown entry emitted only `dist/agents/subagent-announce.continuation.runtime.js`.
- Test shape: existing runtime-entry regression now asserts the flat entry key matching the lazy import path.
- Contract change: build artifact location only; continuation drain behavior and exports unchanged.
- PR verification: base=`cael/325-canonical2`, changedFiles=3.

### #825 — compaction event joint attribution

- Branch: `frond-scribe/swim39-825-compaction-event-joint-attribution`
- PR: https://github.com/karmaterminal/openclaw/pull/485
- Commit: `9f25f9116ff657c41ab8981a61f5d79e7c260b33`
- Files touched: compaction request tool/wiring, embedded compaction event handlers, compaction counter reconcile runtime, and focused tests.
- Bug-shape prevented: enqueue/runtime diag/session-store counter signals could not be joined by run/trigger/outcome/count delta evidence.
- Test shape: volitional request attribution reaches triggerCompaction/log/result; embedded compaction end emits trigger/count before-after-delta attribution.
- Contract change: additive diagnostic fields/logs only; compaction scheduling, provider selection, and count semantics unchanged.
- PR verification: base=`cael/325-canonical2`, changedFiles=13.

### #474 — request_compaction cooldown arm-on-success

- Branch: `frond-scribe/swim39-474-cooldown-arm-on-success`
- PR: https://github.com/karmaterminal/openclaw/pull/486
- Commit: `a37434a0f7659d687cfc0937e4ff9274c9e54817`
- Files touched: `src/agents/tools/request-compaction-tool.ts`, `src/agents/tools/request-compaction-tool.test.ts`
- Bug-shape prevented: rejected/failed async compaction burning the five-minute `request_compaction` cooldown even though no compaction completed.
- Test shape: same-turn duplicates stay `already_pending`; cooldown arms only after `{ ok: true, compacted: true }`; failed/rejected background compactions do not arm cooldown.
- Contract change: behavior fix only; request tool API/schema unchanged.
- PR verification: base=`cael/325-canonical2`, changedFiles=2.

### #475 — blocked liveness channel surface

- Branch: `frond-scribe/swim39-475-blocked-channel-surface`
- PR: https://github.com/karmaterminal/openclaw/pull/487
- Commit: `807f7c5338ea95bb35b2d1a286f94421787ccd45`
- Files touched: `src/auto-reply/reply/agent-runner-execution.ts`, `src/auto-reply/reply/agent-runner-execution.test.ts`
- Bug-shape prevented: embedded/lifecycle `livenessState: "blocked"` being dropped at the runner boundary before any channel-visible marker.
- Test shape: lifecycle blocked events emit a block reply marker; final payload fallback injects the marker when no block surface exists.
- Contract change: additive channel-visible error/status text for blocked terminal liveness; no new protocol surface.
- PR verification: base=`cael/325-canonical2`, changedFiles=2.

### #823 — post-compaction delegate firstArmedAt + TTL

- Branch: `frond-scribe/swim39-823-post-compaction-ttl-restart-load`
- PR: https://github.com/karmaterminal/openclaw/pull/488
- Commit: `63c2fca43930f344325f8034f52e7dd19caa61e7`
- Files touched: post-compaction delegate store/dispatch/session-delivery queue types and focused tests.
- Bug-shape prevented: stale post-compaction shards getting rehydrated with `createdAt=Date.now()` and surviving restarts/requeues as fresh work.
- Test shape: TaskFlow and wrapper consume preserve `firstArmedAt`; dispatch drops >7d stale delegates by stable arm age; queue payload/idempotency carries stable age.
- Contract change: additive `firstArmedAt` persisted on post-compaction delegates; >7d stale post-compaction delegates are dropped with a log instead of dispatched.
- PR verification: base=`cael/325-canonical2`, changedFiles=10.

### #476 — sandbox memory-flush append safety

- Branch: `frond-scribe/swim39-476-write-tool-append-safe`
- PR: https://github.com/karmaterminal/openclaw/pull/489
- Commit: `556c4c32f178feebb548da4e115d79650a8a55e5`
- Files touched: sandbox fs bridge contract/implementations, OpenShell bridge, memory-flush write wrapper, and focused bridge/wrapper tests.
- Bug-shape prevented: sandbox memory flush append-only writes reporting append success while using read-modify-write through `writeFile`, which could clobber concurrent or stale existing content.
- Test shape: memory-flush wrapper calls sandbox `appendFile` and not read/write fallback; local/remote/OpenShell append bridges preserve existing content and newline insertion.
- Contract change: additive optional `SandboxFsBridge.appendFile`; first-party bridges implement it, and unsupported third-party bridges fail explicitly instead of unsafe fallback.
- PR verification: base=`cael/325-canonical2`, changedFiles=13.

### #826 — continue_delegate current-turn cap semantics

- Branch: `frond-scribe/swim39-826-cap-semantics-clarify`
- PR: https://github.com/karmaterminal/openclaw/pull/490
- Commit: `ac176bd7a9192290a67288dd646f6d04bde524aa`
- Files touched: `continue_delegate` tool, TaskFlow delegate-store queue-depth telemetry helper, focused tool tests.
- Bug-shape prevented: far-future sqlite queued delegates saturating `maxDelegatesPerTurn` for an entire delay window and blocking fresh-turn immediate delegation.
- Test shape: same-turn delayed fanout still caps at the configured limit, while a fresh tool turn can schedule an immediate delegate despite those far-future queued rows; cap errors include split queued-depth telemetry.
- Contract change: behavior fix for cap admission semantics plus additive cap-error telemetry; delayed queue persistence unchanged.
- PR verification: base=`cael/325-canonical2`, changedFiles=3.

## §4 — gate results

- #477: `pnpm config:schema:check` pass; `git grep -nF "taskFlowDelegates" -- src/ docs/` no matches; scoped tests pass (31 tests across config/runtime schema files); `pnpm tsgo` pass; `pnpm check` pass. Initial `pnpm check` failed on a lint-only test-key construction, heartbeat posted, fixed, reran green.
- #822: pre-fix `pnpm build` proved the mismatch (`dist/agents/subagent-announce.continuation.runtime.js` existed while the bundled chunk imported `./subagent-announce.continuation.runtime.js`); scoped runtime test pass; `pnpm tsgo` pass; `pnpm check` pass; `pnpm build` pass; post-build checks verified `dist/subagent-announce.continuation.runtime.js` exists/imports and stale nested artifact does not exist. `pnpm check:changed` expanded to all lanes from canonical-branch baseline `.agents` surfaces and failed on unrelated agents/gateway timeout failures; heartbeat posted, then the reported agents files passed in isolation.
- #825: focused tests pass (`request-compaction-tool.volitional-threading`, `request-compaction-tool`, `pi-embedded-subscribe.handlers.compaction`); tool wiring tests pass (`openclaw-tools.continuation-registration`, `tools-effective-inventory`, `commands-system-prompt`); `pnpm tsgo:core`, `pnpm tsgo:core:test`, and `pnpm lint` pass. `pnpm check`, `pnpm check:test-types`, and `pnpm check:changed` fail only after expanding into untouched extension type baselines (`extensions/codex` duplicate `@mariozechner/pi-agent-core` identities and `extensions/qqbot` zod v3/v4 mismatch); `pnpm format:check` reports broad pre-existing drift outside this PR. Heartbeats posted for each failed gate class.
- #474: focused request-compaction tests pass; `pnpm tsgo:core`, `pnpm tsgo:core:test`, and `pnpm lint` pass. Initial focused test run failed because the same-turn regression used an already-resolved mock; heartbeat posted, test tightened with a pending promise, reran green. `pnpm check:changed` expands to all lanes from canonical baseline unknown `.agents` surfaces and fails in existing extension typecheck baselines (`extensions/codex` duplicate `@mariozechner/pi-agent-core` identities and `extensions/qqbot` zod v3/v4 mismatch); heartbeat posted.
- #475: focused agent-runner execution test pass; `pnpm tsgo:core`, `pnpm tsgo:core:test`, and `pnpm lint` pass. `pnpm check:changed` expands to all lanes from canonical baseline unknown `.agents` surfaces and fails in existing extension typecheck baselines (`extensions/codex` duplicate `@mariozechner/pi-agent-core` identities and `extensions/qqbot` zod v3/v4 mismatch); heartbeat posted.
- #823: focused delegate-store/dispatch/session-delivery queue tests pass; `pnpm tsgo:core`, `pnpm tsgo:core:test`, and `pnpm lint` pass. Initial focused run failed because old test fixtures used `createdAt=1` while the new TTL harness default made every fixture stale; heartbeat posted, fixed test harness default, reran green. `pnpm check:changed` expands to all lanes from canonical baseline unknown `.agents` surfaces and fails in existing extension typecheck baselines (`extensions/codex` duplicate `@mariozechner/pi-agent-core` identities and `extensions/qqbot` zod v3/v4 mismatch); heartbeat posted.
- #476: focused memory-flush/sandbox/OpenShell tests pass; `pnpm tsgo:core`, `pnpm tsgo:core:test`, `pnpm lint`, and `pnpm plugin-sdk:api:check` pass. Initial `pnpm tsgo:core:test` caught a local test-stub literal type issue; heartbeat posted and fixed. `pnpm lint` then caught an unbound optional method reference; heartbeat posted and fixed. First `pnpm check:changed` also caught the related OpenShell `SandboxFsBridge` implementation gap; heartbeat posted, OpenShell append implemented/tested, reran. Final `pnpm check:changed` expands to all lanes from canonical baseline unknown `.agents` surfaces and fails only in existing extension typecheck baselines (`extensions/codex` duplicate `@mariozechner/pi-agent-core` identities and `extensions/qqbot` zod v3/v4 mismatch); heartbeat posted.
- #826: focused continue-delegate/delegate-store tests pass; `pnpm tsgo:core`, `pnpm tsgo:core:test`, and `pnpm lint` pass. `pnpm check:changed` expands to all lanes from canonical baseline unknown `.agents` surfaces and fails in existing extension typecheck baselines (`extensions/codex` duplicate `@mariozechner/pi-agent-core` identities and `extensions/qqbot` zod v3/v4 mismatch); heartbeat posted.

## §5 — push log

- Read checkpoint: required reads + issue/PR evidence hydrated; journal updated before first fix branch.
- #477: branch pushed before byte-work, fix commit pushed, PR #483 opened, issue #477 linked, heartbeat sent, fork CI dispatch requested for head `fe67816ec18d6e71b484c748a17e8dab3a566f78`.
- #822: branch pushed before byte-work, fix commit pushed, PR #484 opened, bootstrap issue #822 linked, gate-failure heartbeat and PR-open heartbeat sent, fork CI dispatch requested for head `f2de12921f9946d6b3a0f5d85f51fa706bf8987f`.
- #825: branch pushed before byte-work, fix commit pushed, PR #485 opened, bootstrap issue #825 linked, gate-failure heartbeats and PR-open heartbeat sent, fork CI dispatch requested for head `9f25f9116ff657c41ab8981a61f5d79e7c260b33`.
- #474: branch pushed before byte-work, fix commit pushed, PR #486 opened, issue #474 linked, gate-failure heartbeats and PR-open heartbeat sent, fork CI dispatch requested for head `a37434a0f7659d687cfc0937e4ff9274c9e54817`.
- #475: branch pushed before byte-work, fix commit pushed, PR #487 opened, issue #475 linked, gate-failure heartbeat and PR-open heartbeat sent, fork CI dispatch requested for head `807f7c5338ea95bb35b2d1a286f94421787ccd45`.
- #823: branch pushed before byte-work, fix commit pushed, PR #488 opened, bootstrap issue #823 linked, gate-failure heartbeats and PR-open heartbeat sent, fork CI dispatch requested for head `63c2fca43930f344325f8034f52e7dd19caa61e7`.
- #476: branch pushed before byte-work, fix commit pushed, PR #489 opened, issue #476 linked, gate-failure heartbeats and PR-open heartbeat sent, fork CI dispatch requested for head `556c4c32f178feebb548da4e115d79650a8a55e5`.
- #826: branch pushed before byte-work, fix commit pushed, PR #490 opened, bootstrap issue #826 linked, gate-failure heartbeat and PR-open heartbeat sent, fork CI dispatch requested for head `ac176bd7a9192290a67288dd646f6d04bde524aa`.

## §7 — declare done

_(to be filled in at completion)_

## §9 — questions for figs (raise if blocked, do not block other fixes)

_(to be filled in)_
