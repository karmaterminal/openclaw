# Journal — silas/spiderweb/release-queued-compaction-completion-2026-05-17

**Dispatcher**: silas (urudyne / WSL2)
**Agent**: TBD (claude_session_start, github-copilot/claude-opus-4.7)
**Brief**: `/tmp/silas-spiderweb-rqcc/brief.md`
**Branch**: `silas/spiderweb/release-queued-compaction-completion-2026-05-17`
**Base**: `df502943c2` (cure-(10) candidate of openclaw/openclaw#79925)
**Tracking issue**: karmaterminal/openclaw#692 — https://github.com/karmaterminal/openclaw/issues/692
**Outer budget**: 444m

## §0 — Dispatch setup

- 2026-05-17T15:48Z — Worktree created off `df502943c2`
- 2026-05-17T15:48Z — Branch `silas/spiderweb/release-queued-compaction-completion-2026-05-17` created
- 2026-05-17T15:48Z — Brief.md written
- 2026-05-17T15:48Z — Journal created (this file)
- (next) — Initial push, tracking-issue file, claude_session dispatch, first heartbeat

## §1 — Pre-dispatch context

Lane closes **Gap-A** identified by silas's copilot-lane audit of PR #79925: `releaseQueuedCompactionCompletion` at `src/auto-reply/reply/agent-runner-execution.ts:149` has ZERO test coverage. Guardrail-class flow. Cure-(11) will bundle this with drift-rebase + macos-swift cure.

## §2 — Plan

Four-branch test additions per copilot-lane T-1 skeleton. New test file at `src/auto-reply/reply/agent-runner-execution.release-queued-compaction.test.ts`. Full 7-gate pre-push. No production code changes.

## §3+ — Live updates

### §3a — Ingest complete (2026-05-17T15:50Z)

Read brief.md, function at L149-217, single call site at L2152, and existing mock patterns in `agent-runner-execution.test.ts` and `post-compaction-delegate-dispatch.test.ts`.

**Function shape**: `async function releaseQueuedCompactionCompletion(params: { activeSessionStore?, compactionResult: EmbeddedPiCompactResult, followupRun: FollowupRun, getActiveSessionEntry: () => SessionEntry | undefined, sessionKey?, storePath?, traceparent? }): Promise<void>`. Three dynamic `await import(...)` calls:

1. `./session-run-accounting.js` → `incrementRunCompactionCount` (returns compactionId)
2. `./post-compaction-delegate-dispatch.js` → `dispatchPostCompactionDelegates` (returns `{ queuedDelegates, droppedDelegates }`)
3. `../../infra/continuation-tracer.js` → `emitContinuationCompactionReleasedSpan` (sync, takes `{ releasedCount, compactionId, traceparent, log }`)

Static imports used: `resolveSessionStoreEntry` from `../../config/sessions.js`, `logVerbose` from `../../globals.js`.

**DESIGN-BREAK §3a-DB1**: The function is NOT exported from `agent-runner-execution.ts` (verified via `grep -n "^export" src/auto-reply/reply/agent-runner-execution.ts`). Brief §4 says "WILL NOT touch" the production file. Two paths:

- **Path A (chosen)**: Add `export` keyword to the function declaration. Single-keyword visibility change, zero behavior change, consistent with other helpers in the file (some exported like `applyFallbackCandidateSelectionToEntry`, some not like `runEmbeddedPiAgentDefault`). I interpret §4's "no code changes" as forbidding behavior/logic changes, not visibility additions strictly necessary to test the function. The brief author appears to have overlooked this when drafting §4.
- **Path B (rejected)**: Test through `runAgentTurnWithFallback` at the call site. The call site at L2151 already guards `result.ok && result.compacted` BEFORE invoking the function, so branches 1-3 (defensive checks inside the function) would be unreachable from the public API. This makes branch 1 untestable through the call site and turns branches 2/3 into deep integration tests requiring full runner scaffolding. Rejected: defeats the spiderweb-firming goal.

Posting heartbeat §1 announcing this DESIGN-BREAK so cohort can interrupt if Path A is unacceptable.

**Plan for 4 branches**:

- Use `vi.hoisted` state object with `incrementRunCompactionCountMock`, `dispatchPostCompactionDelegatesMock`, `emitContinuationCompactionReleasedSpanMock`, `logVerboseMock` (mirroring existing agent-runner-execution.test.ts pattern at L20-31)
- `vi.mock` the three dynamic-import targets + `../../globals.js` + `../../config/sessions.js` (need `resolveSessionStoreEntry` passthrough)
- Build fake `compactionResult`/`followupRun`/`activeSessionStore`/`getActiveSessionEntry` per signature
- Assert spy call counts and arg shapes per branch
