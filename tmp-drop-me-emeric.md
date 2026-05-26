# Restore Isolation #782 — Journal

## Status

- Branch: `emeric/20260526/restore-isolation-782`
- Merge base with upstream/main: `483d7be6c4`
- Upstream tip: `e8f584e400`

## Gate 1 — §3 Production Files Restored

- **P1-A** `src/gateway/server-methods/agent.ts` — restored upstream baseline; re-applied continuation overlay (`consumeSubagentTraceparentHandoff`, traceparent fields, `senderIsOwner`, `sessionContinuationTraceparent`, basePatch/effectivePatch with `continuationTraceparent: undefined`, dispatch field overlays).
- **P1-B** `src/agents/agent-command.ts` — taken from upstream wholesale (our continuation feature only touched the deprecated `runWithDiagnosticTraceparent` wrapper and `createAcpVisibleTextAccumulator` re-export, both removed per workorder). `attempt-execution.ts` taken from upstream + re-applied `drainsContinuationDelegateQueue` to runEmbeddedPiAgent.
- **P1-C** `src/agents/command/session-store.ts` — taken from upstream (restores `preserveUserFacingSessionModelState` param, `preserveUserFacingRunState` derivation, gated agent-harness/CLI-binding/aborted/systemPromptReport/usage/compaction-count blocks, minimal metadata patch, direct `sessionStore[sessionKey]` access).
- Direct-import dependencies updated to upstream baseline: `src/agents/cli-runner.ts`, `src/agents/cli-runner/types.ts`, `src/agents/cli-runner/prepare.ts`, `src/shared/string-normalization.ts`, `src/config/sessions/reset-policy.ts`.
- Type seam added to `src/agents/command/types.ts` (sessionEffects + preserveUserFacingSessionModelState on AgentCommandOpts) — coexists with continuation fields.
- `pnpm tsgo:core` green.

## Plan

1. ✅ Gate 1 — restore prod files + tsgo:core green
2. Gate 2 — restore §3.5 test deltas
3. Gate 3 — full §6 acceptance battery (incl. prepush-ci.sh)
