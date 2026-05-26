# WORKORDER: Restore Internal-Session-Effect Isolation (Issue #782)

## §1 — Identity

- **Prince:** Emeric🕯 (`emeric-dandelion-cult`)
- **Issue:** https://github.com/karmaterminal/openclaw/issues/782
- **Branch:** `emeric/20260526/restore-isolation-782`
- **Worktree:** `/tmp/emeric-restore-isolation-782`
- **PR head (start point):** `0dff94dbe4`
- **Upstream main (source of guards):** `upstream/main` (fetched shallow)
- **PR presentation branch (DO NOT TOUCH):** `frond-scribe-claude/20260509/narrow-surgery-tight`

## §2 — Problem Statement

PR #85651 drifted from upstream main during rebase. Internal-session-effect isolation guards that upstream added AFTER our merge-base were silently dropped — no merge conflict, just textual resolution deleting them because our branch didn't have them. These guards prevent backend-plumbing (continuation delegates, silent-wake returns, post-compaction lifecycle) from polluting user-facing session state.

ClawSweeper verdict: "patch is incorrect" at 0.9 confidence (receipt: `#issuecomment-4524413167`).

## §3 — Scope (Three P1 Restorations — RESTORE TOP-DOWN)

Restore in this order so types flow correctly at each checkpoint:

### P1-A (FIRST): `src/gateway/server-methods/agent.ts` (~405 line delta)

Upstream has, we don't:
- `sessionEffects?: "visible" | "internal"` + `suppressPromptPersistence?: boolean` in request schema
- Auth guard: reject `sessionEffects:"internal"` from non-backend callers
- `suppressVisibleSessionEffects` flag derivation + propagation
- `AgentSendSessionLifecycleTransition` type + `emitAgentSendSessionLifecycleTransition()`
- `emitGatewaySessionEndPluginHook` / `emitGatewaySessionStartPluginHook` imports
- `resolveAgentDeliveryPlanWithSessionRoute` (replaces `resolveAgentDeliveryPlan`)
- `normalizeStringEntries` / `uniqueStrings` imports
- `shouldPreserveUserFacingSessionStateForInputProvenance` import
- `PluginHookSessionEndReason` type import
- Removal of `consumeSubagentTraceparentHandoff` (deprecated)

### P1-B (SECOND): `src/agents/agent-command.ts` (~492 line delta)

Upstream has, we don't:
- `prepareInternalSessionEffectsTranscript` import from `./internal-session-effects.js`
- `suppressVisibleSessionEffects` flag consumed from `opts.sessionEffects === "internal"`
- ~30 branch points gating session-store/transcript writes on `!suppressVisibleSessionEffects`
- `createEmptySkillsSnapshot()` helper
- Internal transcript routing via `attemptSessionFile`
- Delivery/pending-delivery cleanup gated on `!suppressVisibleSessionEffects`
- Removal of `runWithDiagnosticTraceparent` wrapper (deprecated)

### P1-C (THIRD): `src/agents/command/session-store.ts` (~149 line delta)

Upstream has, we don't:
- `preserveUserFacingSessionModelState?: boolean` parameter
- `preserveUserFacingRunState` derived flag
- `preserveRuntimeModel` includes `|| preserveUserFacingRunState`
- Agent-harness/CLI-session-binding/aborted/systemPromptReport block gated on `!preserveUserFacingRunState`
- Usage/compaction-count tracking gated
- Minimal metadata patch when preserving
- Direct `sessionStore[sessionKey]` access (replaces `resolveSessionStoreEntry`)
- Conditional `undefined` return when no existing entry + preserving

### Supporting files (already exist on our branch — verify, don't modify):
- `src/agents/internal-session-effects.ts` ✅
- `src/sessions/input-provenance.ts` — `shouldPreserveUserFacingSessionStateForInputProvenance` ✅

## §4 — Fix Shape

**Cherry-pick the delta, not wholesale file-replace. Restore top-down.**

For each file (in order A → B → C):
1. Read upstream main's version
2. Read our branch's version
3. Apply missing additions (imports, types, functions, guards) to our version
4. Remove deprecated paths upstream removed
5. `pnpm tsgo:core` — must pass before moving to next file

**Conflict policy:** If upstream rethought a design shape that conflicts with our continuation feature — PAUSE and report. Do not jam. Integration, not overwrite.

## §5 — DO NOT TOUCH

- **`frond-scribe-claude/20260509/narrow-surgery-tight`** — NO writes, NO pushes, NO merges.
- Do not modify files outside the three P1 targets + their direct import dependencies.
- Do not refactor. Do not redesign. Restore only.

## §6 — Acceptance Criteria

```bash
# Fast feedback (ClawSweeper test set):
node scripts/run-vitest.mjs \
  src/gateway/server-methods/agent.test.ts \
  src/agents/agent-command.live-model-switch.test.ts \
  src/agents/command/session-store.test.ts \
  src/auto-reply/reply/session.test.ts

# Full Gate 3 battery:
pnpm install
pnpm tsgo:core
pnpm tsgo:test
pnpm tsgo:extensions
pnpm lint
pnpm lint:extensions:bundled
pnpm package-boundary:compile
NODE_OPTIONS=--max-old-space-size=8192 pnpm vitest run
```

All must exit 0.

## §7 — Journal + Heartbeat

Maintain `tmp-drop-me-emeric.md` in worktree root. Commit + push at each gate checkpoint.

Discord webhook for passive heartbeats:
```bash
WEBHOOK=$(gh variable get WEBHOOK_SCRIBE_NOTIFY --repo karmaterminal/emeric-holds-the-lamp)
```

Post at: branch creation ✅, each gate pass, each gate fail, completion.

## §8 — Branch Discipline

- Branch: `emeric/20260526/restore-isolation-782`
- Push BEFORE byte-work starts ✅ (done)
- Checkpoint pushes at each meaningful gate
- No force-push after first push
- PR (if opened) closes #782

## §9 — Escalation

PAUSE and report via journal + webhook if:
- Merge conflict not obviously resolvable
- Type error suggesting upstream design rethink
- Test failure predating our changes
- Any uncertainty: "restore" vs "redesign"

## §10 — Model + Timeout

- Model: `claude-opus-4-7` (max think) via copilot
- Outer timeout: 444 minutes
- Checkpoint: every 30 min or at each gate boundary
