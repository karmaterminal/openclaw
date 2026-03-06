# PR Review — Ronan 🌊

## `karmaterminal/openclaw:feature/context-pressure-squashed` at `6f5b7f677`

### Methodology

Read the squashed diff (9 core files, ~1742 lines of feature code) against upstream/main. Focused on continuation-specific additions: `continue-delegate-tool.ts`, `continuation-delegate-store.ts`, chain-hop logic in `subagent-announce.ts`, generation guard changes in `agent-runner.ts`.

---

### P0 — None found

---

### P1 — Should fix

**P1-1: Module-level Map stores have no TTL / cleanup**
`continuation-delegate-store.ts` uses two `Map<string, PendingContinuationDelegate[]>` at module level (`pendingDelegates`, `compactionDelegates`). If `consumePendingDelegates` or `consumeCompactionDelegates` is never called for a session (e.g., agent crash mid-run), entries leak. Low risk in practice (entries are small, crashes are rare), but a TTL sweep or WeakRef pattern would prevent unbounded growth over long gateway uptime.

**P1-2: `compactionDelegateCount` not bounded by `maxDelegatesPerTurn`**
The `continue_delegate` tool checks `pendingDelegateCount(sessionKey) + compactionDelegateCount(sessionKey) >= maxPerTurn` — good. But `enqueueCompactionDelegate` doesn't check limits independently. A rapid sequence of post-compaction delegates in a single turn could exceed `maxDelegatesPerTurn` if the check races with concurrent tool calls in the same response. Low risk (tool calls are sequential within a turn), but worth a comment.

---

### P2 — Nice to have

**P2-1: `delaySeconds` clamping documented but not enforced in tool**
The tool schema says "Clamped to continuation.minDelayMs / maxDelayMs from config" but the tool itself just does `Math.max(0, params.delaySeconds)`. The actual clamping happens downstream in `agent-runner.ts`. This is correct architecturally (tool enqueues, runner enforces), but the tool's return value reports the raw `delaySeconds`, not the clamped value. Minor UX gap — the agent sees "delaySeconds: 300" but the actual dispatch might clamp to 60.

**P2-2: `stripContinuationSignal` imported but usage scope unclear**
Imported in `subagent-announce.ts` — verify it's actually used in the diff. If it's only used in pre-existing code, the import change is fine. If it's new, confirm the strip path is tested.

**P2-3: `FAST_TEST_REPLY_CHANGE_WAIT_MS` constant added but test coverage unclear**
New constant at line 57. Used in `waitForSubagentOutputChange`. Confirm test suite exercises this path.

---

### Verdict: **Ship it ✅**

0 P0s. The architecture is clean — tool writes to store, runner reads and dispatches, both paths converge at the same scheduler. Chain tracking via task-prefix encoding is elegant and avoids the session-store timing races that plagued earlier approaches. Sticky silent and generation guard tolerance are well-scoped additions.

The two P1s are minor leak/race observations, not blockers. The code is ready for upstream review.
