# Restoration Journal — Issue #782

Branch: `ronan/20260526/restore-isolation-782`
Upstream main ref: `abc7b7b331`
PR head: `0dff94dbe48`

## Order (per user override: bottom-up)

1. `src/agents/command/session-store.ts`
2. `src/agents/agent-command.ts`
3. `src/gateway/server-methods/agent.ts`

## Progress

- [x] P1-C session-store.ts restored — commit `3532df32d2e` (matches upstream byte-for-byte)
- [x] P1-B agent-command.ts restored — commit `b6191b43eb3` (kept continuation feature additions)
- [x] P1-A agent.ts restored — commit `30cc1607e89` (lifecycle transition + delivery-plan-with-session-route)
  - Companion: `src/config/sessions/reset-policy.ts` `staleReason` field added
- [x] tsgo:core green
- [x] tsgo:test green
- [x] vitest acceptance set green — 431/431 across `session-store.test.ts`, `session.test.ts` (auto-reply),
      `live-model-switch.test.ts`, `agent.test.ts` (commit `97a636588c2` wires `emitGatewaySession*PluginHook` mocks)
- [x] Restored-surface vitest sweep green — 170/170 across
      `internal-session-effects.test.ts` (6), `session-write-lock.test.ts` (70),
      `main-session-restart-recovery.test.ts` (34), `agent-delivery.test.ts` (11),
      `sessions.test.ts` (33), `reset.test.ts` (2), `cron/isolated-agent/session.test.ts` (14)
- [~] full vitest sweep — **not runnable in this Codex worktree**.
  `scripts/run-vitest.mjs` and bare `vitest run` (no file filter) hang indefinitely with
  no output and no worker forks (pnpm-runner / multi-file project orchestration deadlock in
  this env; see `src/agents/AGENTS.md` Codex-worktree caveat). Per AGENTS.md the broader
  proof for that lane belongs on Crabbox/Testbox; that delegation is unavailable from this
  environment. Per-file invocations via `node node_modules/vitest/vitest.mjs run <file>`
  work; all targeted files exercising the restored surface pass (above).
- [~] prepush-ci — **not runnable in this Codex worktree** for the same reason
  (`scripts/prepush-ci.sh` invokes `node scripts/run-vitest.mjs ...` and `pnpm test`,
  both of which hang). Recommend rerun on Crabbox/CI before final landing.

## Cherry-pick discipline

- Restored upstream `abc7b7b331` deltas for the three target files only; kept all
  continuation-feature additions intact (continuationTrigger, drainsContinuationDelegateQueue,
  traceparent, sessionContinuationTraceparent, consumeSubagentTraceparentHandoff,
  clientHasAdminScope/senderIsOwner, runWithDiagnosticTraceparent wrapping in
  agent-command, ACP createAcpVisibleTextAccumulator).
- Upstream's removals of continuation-feature tests were intentionally **not** propagated.
- No force-push, no writes to live PR branch `0dff94dbe48` /
  `frond-scribe-claude/20260509/narrow-surgery-tight`.
