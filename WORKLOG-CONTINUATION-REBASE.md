# Worklog: Continuation Clean-Base Rebase

**Branch:** `elliott/coding-agent-backup-20260415a`
**Base:** `v2026.4.14^{}` = `323493fa1b`
**Task:** Parallel verification lane — implement the continuation surface independently of Cael's lane to cross-validate.
**RFC:** `docs/design/continue-work-signal-v2.md`

## 2026-04-15 — Initial scaffolding + architecture fix

### Status: 7 modules, 6 test files, 70 tests passing

### Files created

| File                                                 | LOC  | Purpose                                                                             |
| ---------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- |
| `src/auto-reply/continuation-config.ts`              | 93   | Config types, defaults, resolution with `clampDelay`                                |
| `src/auto-reply/continuation-tokens.ts`              | 109  | Token fallback parsing (`CONTINUE_WORK`, `[[CONTINUE_DELEGATE:]]`) and stripping    |
| `src/auto-reply/continuation-tokens.test.ts`         | 118  | 18 tests for token parsing/stripping/prefix detection                               |
| `src/auto-reply/continuation-delegate-store.ts`      | ~170 | Volatile pending-delegate store + post-compaction staging store                     |
| `src/auto-reply/continuation-delegate-store.test.ts` | ~170 | 13 tests for delegate store + post-compaction staging                               |
| `src/auto-reply/continuation-scheduler.ts`           | 150  | Timer-based `scheduleContinuationTurn` for same-session continuation                |
| `src/auto-reply/continuation-wire.ts`                | ~230 | Post-response wiring: token/tool convergence, delegate categorization, timer arming |
| `src/auto-reply/continuation-wire.test.ts`           | ~290 | 21 integration tests for wire module                                                |
| `src/agents/tools/continue-work-tool.ts`             | 107  | `continue_work()` tool — same-session continuation                                  |
| `src/agents/tools/continue-work-tool.test.ts`        | 101  | 7 tests for continue_work tool                                                      |
| `src/agents/tools/continue-delegate-tool.ts`         | 137  | `continue_delegate()` tool — delegated continuation                                 |
| `src/agents/tools/continue-delegate-tool.test.ts`    | 135  | 9 tests for continue_delegate tool                                                  |
| `src/agents/tools/request-compaction-tool.ts`        | 97   | `request_compaction()` tool — volitional compaction                                 |

### Architecture fix: delegate dispatch categorization

The initial scaffolding had a bug in `continuation-wire.ts` where `scheduleDelegateDispatch` routed ALL delegates through `scheduleContinuationTurn`. This was wrong because:

1. `scheduleContinuationTurn` fires a generic `[continuation:wake]` event — it doesn't carry delegate payload (task, mode) to the spawn point
2. Post-compaction delegates should be staged, not dispatched via timer
3. Immediate delegates should be returned for direct spawn, not routed through a timer with minDelayMs padding

**Fix:** Replaced `scheduleDelegateDispatch` with `categorizeDelegates` that splits consumed delegates into three dispatch strategies:

| Strategy               | Condition                            | Behavior                                                            |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `immediateSpawns`      | `delayMs=0`, mode != post-compaction | Returned for direct spawn by caller                                 |
| `delayedTimers`        | `delayMs>0`, mode != post-compaction | Timer armed with captured payload; fires `onDelegateSpawn` callback |
| `postCompactionStaged` | `mode=post-compaction`               | Returned for caller to stage on session metadata                    |

The `onDelegateSpawn` callback pattern keeps the wire module from importing sub-agent spawn infra — the caller (agent-runner) provides the spawn mechanism.

### Guard verification

| Guard                       | Default           | Where enforced                                                                                                                    |
| --------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`                   | `false`           | `continuation-config.ts` defaults                                                                                                 |
| `maxChainLength`            | `10`              | `continue-work-tool.ts:57`, `continue-delegate-tool.ts:73`, `continuation-scheduler.ts:56`, `continuation-wire.ts` categorization |
| `costCapTokens`             | `500000`          | Both tool files                                                                                                                   |
| `minDelayMs` / `maxDelayMs` | `5000` / `300000` | `clampDelay()` in config, used by tools + wire categorization                                                                     |
| `maxDelegatesPerTurn`       | `5`               | `continue-delegate-tool.ts:93`                                                                                                    |
| `generationGuardTolerance`  | **removed**       | Not present in any source file                                                                                                    |

### Tool/token parity

Both paths converge on the same machinery:

- `CONTINUE_WORK` token → `scheduleContinuationTurn()` in scheduler
- `continue_work()` tool → `scheduleContinuationTurn()` in scheduler
- `[[CONTINUE_DELEGATE:]]` token → `enqueuePendingDelegate()` → `categorizeDelegates()`
- `continue_delegate()` tool → `enqueuePendingDelegate()` → `categorizeDelegates()`

Token-fallback delegates are enqueued into the same store as tool-path delegates, consumed in the same cycle, and categorized identically. Tool path takes priority: if tool-path delegates exist, token-fallback signal scheduling is suppressed (token signal is still parsed for display stripping).

### What's NOT done yet

- Agent-runner wiring (calling `processContinuationPostResponse` from the post-response path)
- System prompt continuation instructions (tool/fallback-aware prompt branching)
- Context-pressure pre-run injection
- Post-compaction delegate release in the after_compaction hook
- Tool registration in `createOpenClawCodingTools`
- `/status` telemetry integration
- Task Flow durable backing (currently volatile Map only)

### What's intentionally omitted

- **Generation guard** — removed by design decision 2026-04-15. Delayed work should not be cancelled by unrelated channel noise.
- **Inlining into agent-runner** — all continuation code lives in its own modules.
