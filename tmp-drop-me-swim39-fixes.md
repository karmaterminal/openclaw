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

_(to be filled in)_

## §4 — gate results

_(to be filled in)_

## §5 — push log

- Read checkpoint: required reads + issue/PR evidence hydrated; journal updated before first fix branch.

## §7 — declare done

_(to be filled in at completion)_

## §9 — questions for figs (raise if blocked, do not block other fixes)

_(to be filled in)_
