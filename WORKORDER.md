# Workorder: Restore Internal-Session-Effect Isolation (Issue #782)

## Objective

Restore three internal-session-effect isolation guards that our PR branch (`0dff94dbe48`) dropped from upstream main. These guards keep backend/internal runs (continuation delegates, silent-wake returns, post-compaction lifecycle) invisible to user-facing session state.

**Tracking issue:** https://github.com/karmaterminal/openclaw/issues/782

## Critical Constraints

- **NEVER write to branch `frond-scribe-claude/20260509/narrow-surgery-tight`** — that is the live PR presentation branch
- **NEVER force-push** — this is a prince practice lane
- Work stays on branch `ronan/20260526/restore-isolation-782` only
- Cherry-pick the delta from upstream; do NOT wholesale file-replace (our continuation feature additions must be preserved)
- If you encounter merge conflicts where upstream has rethought a design: **PAUSE and report**. Do not jam.

## Upstream Reference

- Upstream main SHA: `abc7b7b331` (current tip at time of code walk)
- PR head SHA: `0dff94dbe48`
- Diff command: `git diff 0dff94dbe48..abc7b7b331 -- src/gateway/server-methods/agent.ts src/agents/agent-command.ts src/agents/command/session-store.ts`

## Restoration Scope (Top-Down Order)

### P1-A: `src/gateway/server-methods/agent.ts` (~405 lines)

Restore:

- `sessionEffects?: "visible" | "internal"` + `suppressPromptPersistence?: boolean` on request schema
- `requestedInternalSessionEffects` / `canUseInternalRuntimeHandoff` auth check (reject from non-backend callers)
- `preserveUserFacingSessionModelState` derivation from input-provenance
- `suppressVisibleSessionEffects` conditional wrapping:
  - session-store update
  - session lifecycle transition emit
  - chatRun registration
  - `registerAgentRunContext` with `{ isControlUiVisible: false }` for internal runs
- `resolveAgentDeliveryPlanWithSessionRoute` signature (not just import rename — update call sites)

### P1-B: `src/agents/agent-command.ts` (~492 lines)

Restore:

- Import `prepareInternalSessionEffectsTranscript` from `./internal-session-effects.js`
- Derive `suppressVisibleSessionEffects` from `opts.sessionEffects === "internal"`
- ~30 guard points where `!suppressVisibleSessionEffects` gates session-store/transcript writes
- Internal transcript routing: conditionally route internal runs to temp transcript via `prepareInternalSessionEffectsTranscript`
- Suppress sessionStore/storePath for internal runs

### P1-C: `src/agents/command/session-store.ts` (~149 lines)

Restore:

- `preserveUserFacingSessionModelState?: boolean` in `updateSessionStoreAfterAgentRun` params type
- Derive `preserveUserFacingRunState` from the flag
- Conditional guard preventing internal runs from overwriting parent session's model/harness/usage/token/compaction fields

## Supporting Files

- May ADD imports/call-sites to `internal-session-effects.ts` and `input-provenance.ts`
- Do NOT modify their function bodies

## Restoration Order

Restore **top-down** (agent.ts → agent-command.ts → session-store.ts). Types flow downward in this call chain — the flag derivation in agent.ts must exist before consumers in agent-command.ts can reference it.

Run `pnpm tsgo:core` after each file restoration to catch type errors incrementally.

## Gate Sequence (after all three restored)

1. `pnpm install --frozen-lockfile`
2. `pnpm tsgo:core` (must exit 0)
3. `pnpm tsgo:test` (must exit 0)
4. `node scripts/run-vitest.mjs src/gateway/server-methods/agent.test.ts src/agents/agent-command.live-model-switch.test.ts src/agents/command/session-store.test.ts src/auto-reply/reply/session.test.ts` (ClawSweeper acceptance set)
5. `NODE_OPTIONS='--max-old-space-size=33792' pnpm vitest run` (full suite, 33GB heap — DGX Spark seat has 128GB RAM)
6. `bash scripts/prepush-ci.sh` (CI emulator — single-worker, CI=true, 6GB heap; catches state-leak failures)

If tests in step 4 fail: first check if upstream evolved those test files (`git diff 0dff94dbe48..abc7b7b331 -- <test-file>`). If so, restore their deltas alongside production code before re-running.

## Conflict Policy

- If merge conflicts arise between restoration and our existing continuation code: **PAUSE**
- Report the conflict shape (which file, which function, what upstream changed vs what we have)
- Do NOT resolve by jamming — upstream may have rethought the design
- Escalation criteria: type errors suggesting design rethink, pre-existing test failures, or scope expanding beyond the three files

## Journal + Webhook

- Write progress to `journal-restore-782.md` at branch root
- Commit + push journal at each gate checkpoint
- Post heartbeat to Discord webhook at each gate passage

## Push Discipline

- Push branch to origin BEFORE starting byte-work (remote-first)
- Checkpoint pushes at each meaningful gate
- NO force-push after first push
