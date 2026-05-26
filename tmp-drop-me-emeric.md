# Restore Isolation #782 — Journal

## Status

- Branch: `emeric/20260526/restore-isolation-782`
- Merge base with upstream/main: `483d7be6c4`
- Upstream tip: `e8f584e400`

## Gate 1 — §3 Production Files Restored (commit 29dbfd4941)

- **P1-A** `src/gateway/server-methods/agent.ts` — restored upstream baseline; re-applied continuation overlay (`senderIsOwner`, `sessionContinuationTraceparent`, basePatch/effectivePatch with `continuationTraceparent: undefined`, dispatch field overlays).
- **P1-B** `src/agents/agent-command.ts` — taken from upstream wholesale (our continuation feature only touched the deprecated `runWithDiagnosticTraceparent` wrapper and `createAcpVisibleTextAccumulator` re-export, both removed per workorder). `attempt-execution.ts` taken from upstream + re-applied `drainsContinuationDelegateQueue` to runEmbeddedPiAgent.
- **P1-C** `src/agents/command/session-store.ts` — taken from upstream (restores `preserveUserFacingSessionModelState` param, `preserveUserFacingRunState` derivation, gated agent-harness/CLI-binding/aborted/systemPromptReport/usage/compaction-count blocks, minimal metadata patch, direct `sessionStore[sessionKey]` access).
- Direct-import dependencies updated to upstream baseline: `src/agents/cli-runner.ts`, `src/agents/cli-runner/types.ts`, `src/agents/cli-runner/prepare.ts`, `src/shared/string-normalization.ts`, `src/config/sessions/reset-policy.ts`.
- Type seam added to `src/agents/command/types.ts` (sessionEffects + preserveUserFacingSessionModelState on AgentCommandOpts) — coexists with continuation fields.
- `pnpm tsgo:core` green.

## Gate 2 — §3.5 Test Deltas Restored

- `src/gateway/server-methods/agent.test.ts` — restored upstream baseline (lifecycle hooks, session-effect guard tests "does not let public provenance suppress visible session accounting", "rejects public internal session-effect controls", "keeps backend internal session-effect runs out of visible gateway state"). Re-added our continuation feature test "forwards continuationTrigger metadata to the ingress agent command". Dropped subagent-traceparent-handoff tests (workorder requires `consumeSubagentTraceparentHandoff` removal).
- `src/agents/agent-command.live-model-switch.test.ts` — restored upstream (re-adds "keeps internal session-effect CLI runs out of visible session state"). Mock for `./auth-profiles.js` extended with `clearRuntimeAuthProfileStoreSnapshots: vi.fn()` — required because our `openclaw-tools.ts` transitively imports `secrets/runtime.ts` which registers that hook (upstream's `openclaw-tools.ts` imports from `secrets/runtime-state.js` instead, so its test mock topology is narrower).
- `src/agents/command/session-store.test.ts` — restored upstream baseline (re-adds "persists estimated context budget status without marking stale usage fresh"). Dropped our continuation patch's `resolveSessionStoreEntry` mock.
- `src/auto-reply/reply/session.test.ts` — restored upstream baseline (re-adds "preserves the displayed session model when an internal announce uses fallback").
- Direct production deps for tests reverted: `src/auto-reply/reply/session-usage.ts` (restores `preserveUserFacingSessionModelState` on `persistSessionUsageUpdate`), `src/auto-reply/reply/session.ts` (drops continuation `resolveSessionStoreEntry` rewrite).
- Removed orphan test: `src/agents/agent-command.test.ts` (continuation-added; only consumed `createAcpVisibleTextAccumulator` which upstream removed).
- Production overlay adjustment in `agent.ts`: dropped `consumeSubagentTraceparentHandoff` import + usage (workorder P1-A explicit removal). `inheritedTraceparent` collapses to `request.traceparent ?? sessionContinuationTraceparent`.
- ClawSweeper fast-feedback set: **442/442 passing** (`run-vitest.mjs` on the 4 test files).
- `pnpm tsgo:core`, `pnpm tsgo:test`, `pnpm tsgo:extensions` all green.

## Scope note — design rethink check

Workorder explicitly lists `consumeSubagentTraceparentHandoff` (P1-A) and `runWithDiagnosticTraceparent` (P1-B) as deprecated removals upstream-aligned. With both consumer ends removed, the kept `traceparent` plumbing (`request.traceparent` → `sessionContinuationTraceparent` → `dispatchAgentRunFromGateway.traceparent` → `ingressOpts.traceparent` → `opts.traceparent`) has no terminal sink today; it remains as a passthrough but propagates nothing to runtime spans. Producer side (`registerSubagentTraceparentHandoff` in `src/agents/subagent-spawn.ts`) is now orphan in production but `src/agents/subagent-spawn.test.ts` still exercises the register/consume contract directly. Out of P1 scope per workorder §5; flagged here for follow-up.

## Plan

1. ✅ Gate 1 — restore prod files + tsgo:core green (commit 29dbfd4941, pushed)
2. ✅ Gate 2 — §3.5 test deltas restored, ClawSweeper set green
3. Gate 3 — full §6 acceptance battery (incl. prepush-ci.sh)
