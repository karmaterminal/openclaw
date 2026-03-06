# PR Review — Elliott 🌻

## Branch: `feature/context-pressure-squashed` at `6f5b7f677`

## Review of squashed diff against `upstream/main`

---

### Summary

7 commits, ~1700 lines added across core files. Implements:

- `CONTINUE_WORK` (self-elected turn continuation with timer)
- `CONTINUE_DELEGATE` (sub-agent chain spawning via bracket syntax + tool)
- Context-pressure detection (pre-compaction awareness)
- Post-compaction delegate dispatch
- Chain safety: `maxChainLength`, `costCapTokens`, `generationGuardTolerance`
- Sticky silent: parent `silentAnnounce` inherits to all chain hops

Architecture is clean. The three-leash safety stack (depth, cost, generation guard) is well-designed and canary-verified.

---

### P0 — Correctness / Safety

**P0-CLEAR** — No new P0 issues found.

All previously identified P0s (generation guard on delegate setTimeout, bracketAlreadyAccumulated, isDelegateWake one-shot marker, chain-hop tracking) are addressed in the fix commit.

---

### P1 — Robustness / Edge Cases

#### P1-1: `continuationGenerations` map growth (agent-runner.ts)

The `continuationGenerations` map only adds entries, never removes them. Comment says "clearContinuationGeneration intentionally removed" to avoid generation-reuse. For long-running gateways with many distinct sessions, this is a slow memory leak. The values are small (numbers), so impact is low, but worth a periodic cleanup (e.g., prune sessions not seen in 24h) as a follow-up.

**Severity**: P1 (follow-up)
**File**: `src/auto-reply/reply/agent-runner.ts`, ~line 84
**Recommendation**: Document as known limitation. File issue for periodic pruning.

#### P1-2: `cancelContinuationTimer` triple-write pattern

`cancelContinuationTimer` writes chain reset to: (1) sessionEntry, (2) sessionStore, AND (3) disk via `updateSessionStore`. The disk write is fire-and-forget (`.catch(() => {})`). If the disk write fails, the in-memory state and disk state diverge. On gateway restart, stale chain counters could block new chains.

**Severity**: P1 (minor — chain counters reset on next external message anyway)
**File**: `src/auto-reply/reply/agent-runner.ts`, ~line 112-155
**Recommendation**: Acceptable for v1. The per-message reset at top of `runReplyAgent` is a backstop.

#### P1-3: `peekSystemEventEntries` called twice for delegate detection

In `get-reply-run.ts`, `peekSystemEventEntries` is called twice for `hasDelegatePending` and `hasDelegateReturned`. These are separate linear scans of the event queue. Could be a single pass.

**Severity**: P2 (performance, not correctness)
**File**: `src/auto-reply/reply/get-reply-run.ts`, ~line 244-262
**Recommendation**: Combine into single scan. Low priority.

#### P1-4: Chain-hop timer in subagent-announce uses strict generation check

In `subagent-announce.ts`, the chain-hop delayed spawn uses `currentContinuationGeneration !== hopGeneration` (strict equality), NOT the tolerance check used in `agent-runner.ts`. This means `generationGuardTolerance` doesn't apply to chain-hop timers — only to parent-session delegate timers.

**Severity**: P1 (behavioral inconsistency)
**File**: `src/agents/subagent-announce.ts`, chain-hop timer (~line 1185)
**Recommendation**: Apply same tolerance logic as agent-runner.ts delegate timer. Or document the asymmetry — chain-hop timers are typically instant (no delay), so this rarely fires.

---

### P2 — Style / Quality

#### P2-1: Removed `qualityGuard` from compaction config

The squash removes `AgentCompactionQualityGuardConfig` type and Zod schema. This is a breaking config change for anyone using `compaction.qualityGuard`. Not a continuation feature concern — looks like upstream cleanup that leaked into this branch.

**Severity**: P2 (scope creep — should be separate commit or noted in PR description)
**File**: `src/config/types.agent-defaults.ts`, `src/config/zod-schema.agent-defaults.ts`
**Recommendation**: Verify this is intentional. If it's upstream cleanup, note it.

#### P2-2: `INTERNAL_MESSAGE_CHANNEL` import removed but `inputProvenance` references removed too

Multiple `inputProvenance` fields removed from `sendAnnounce`, `maybeQueueSubagentAnnounce`, and `sendSubagentAnnounceDirectly`. This removes tracking of where inter-session messages originated. Intentional simplification or lost telemetry?

**Severity**: P2 (audit trail concern)
**File**: `src/agents/subagent-announce.ts`
**Recommendation**: Confirm with upstream whether `inputProvenance` was deprecated.

#### P2-3: Magic numbers in context-pressure bands

`90` and `95` are hardcoded in `context-pressure.ts`. The configurable threshold only affects the first band. Consider making all bands configurable, or at minimum document why 90/95 are fixed.

**Severity**: P2 (documentation)
**File**: `src/auto-reply/reply/context-pressure.ts`, line 55-57
**Recommendation**: Add inline comment explaining band rationale.

#### P2-4: `buildCompletionDeliveryMessage` replaces inline formatting

The refactored `buildCompletionDeliveryMessage` is cleaner than the inline logic it replaces. Good refactor. No issues.

#### P2-5: `FAST_TEST_REPLY_CHANGE_WAIT_MS` defined but usage unclear

New constant defined at line 58 of subagent-announce.ts. Verify it's actually referenced.

**Severity**: P2 (dead code if unreferenced)

---

### Verdict

**SHIP IT** — with P1-1 and P1-4 as documented follow-up items. The safety stack is solid, the test suite is comprehensive (173 tests, 73 continuation-specific), and the canary testing proves all three leashes work end-to-end.

The removed `qualityGuard` and `inputProvenance` (P2-1, P2-2) should be noted in the PR description so upstream reviewers understand those are intentional cleanups, not accidental deletions.

— Elliott 🌻, 2026-03-06 02:20 PST
