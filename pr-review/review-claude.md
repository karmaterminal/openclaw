# PR Review: Context-Pressure Detection & Agent Self-Elected Continuation

**Reviewer:** Claude (Opus 4.6)
**Branch:** `feature/context-pressure-squashed` → `main`
**Date:** 2026-03-05

---

## 1. Correctness

### [CRITICAL] Module-level `continuationGenerations` map grows unboundedly

**File:** `src/auto-reply/reply/agent-runner.ts:76`

The `continuationGenerations` map is never pruned. Every session that uses continuation gets an entry, and entries are only bumped, never deleted (the comment at line 88–91 explains why clearing is dangerous). Over time on a long-running gateway with many sessions, this map will grow without bound.

The map stores `number` values per session key, so the memory impact per entry is small (~100–200 bytes), but on a deployment with thousands of sessions over weeks/months, this could become significant.

**Recommendation:** Add a periodic sweep (e.g., during heartbeat or on a timer) that removes entries for sessions with no active continuation chain (check session store for `continuationChainCount === 0`). Alternatively, use a `WeakRef` or bounded LRU cache.

### [MAJOR] `pendingDelegates` and `compactionDelegates` maps leak if delegates are never consumed

**File:** `src/auto-reply/continuation-delegate-store.ts:24,68`

If a tool call enqueues delegates but the agent run fails/errors before reaching the consumption point in `agent-runner.ts`, the delegates remain in the module-level map indefinitely. The same applies to compaction delegates if compaction never fires for that session.

**Recommendation:** Add a `clearPendingDelegates(sessionKey)` function and call it in the error/finally block of `runReplyAgent`, or add a TTL-based sweep.

### [MAJOR] `NaN` totalTokens passes through context-pressure guards

**File:** `src/auto-reply/reply/context-pressure.ts:43`

The guard `sessionEntry.totalTokens <= 0` does catch negative and zero values, and `NaN <= 0` evaluates to `false` in JavaScript, so `NaN` passes through the guard. Then `NaN / contextWindowTokens` produces `NaN`, and `NaN >= 0.95` etc. are all `false`, so band resolves to `0`. The test at line 462–472 confirms this works correctly. However, the safety relies on IEEE 754 comparison semantics of NaN, not an explicit guard.

The code comment at line 36–38 acknowledges this for negative values but doesn't mention NaN. Consider adding an explicit `Number.isNaN` guard for clarity and robustness.

**Severity downgrade:** The current behavior is safe (band=0, no event). This is **minor** — the test covers it, and the arithmetic is correct, but an explicit guard would make intent clearer.

### [MINOR] `isDelegateWake` detection relies on event peeking ordering

**File:** `src/auto-reply/reply/get-reply-run.ts:248–253`

The `isDelegateWake` detection peeks system events looking for `[continuation:delegate-pending]`. If compaction occurs between delegate dispatch and return (as the RFC acknowledges at RFC line 232), the marker may be lost. The delegate announce still arrives, but `isDelegateWake` will be `false`, causing chain state to be reset as if it were external input.

This is acknowledged in the RFC's "Post-compaction gap" section, but the code has no fallback detection. The sub-agent's announce payload contains `[continuation]` in the task label — this could be used as a secondary signal.

**Recommendation:** Consider adding a fallback check on the announce task label prefix `[continuation]` when the system event marker is absent.

### [MINOR] `setTimeout` timers are fire-and-forget with no tracking

**File:** `src/auto-reply/reply/agent-runner.ts:1038,1049`

Delayed delegate spawns and CONTINUE_WORK timers use raw `setTimeout` with no handle tracking. While the generation guard prevents stale WORK timers from executing, delayed delegate spawns have no cancellation mechanism. If a user sends a message during the delay window, the chain is reset but the `setTimeout` for `doSpawn()` still fires and spawns the sub-agent.

The generation guard at line 1050 protects WORK timers but not DELEGATE timers. The delegate `doSpawn()` closure at line 1038 executes unconditionally after the delay.

**Recommendation:** Store `setTimeout` handles and cancel them when chain state is reset in `cancelContinuationTimer()`, or add a generation guard to delegate timers as well.

---

## 2. Security

### [MAJOR] No generation guard on delayed delegate spawns

As noted above, delayed delegate spawns (`[[CONTINUE_DELEGATE: task +30s]]`) are not guarded by the generation counter. An external message arrives, resets the chain, but 30 seconds later the delegate still spawns. This means:

1. A user sends a message, expecting the agent is back to normal
2. 25 seconds later, a delegate they didn't request spawns and runs
3. The delegate consumes tokens and potentially modifies state

The bracket-parsed delegate path at line 1031–1041 and the tool-dispatched path at line 1170–1175 both have this gap.

**Recommendation:** Capture the generation at scheduling time and check it in the `doSpawn` callback, same pattern as the WORK timer at line 1048–1051.

### [MINOR] Cost cap check uses `>` not `>=`

**File:** `src/auto-reply/reply/agent-runner.ts:937,1110`

The cost cap check is `accumulatedChainTokens > costCapTokens`. This means exactly hitting the cap allows one more turn. Not a practical exploit risk (token counting is approximate anyway), but the RFC and code comments suggest the cap should be a hard limit.

### [MINOR] Tool-dispatched delegates double-count current turn tokens

**File:** `src/auto-reply/reply/agent-runner.ts:1088–1095`

When both bracket-parsed and tool-dispatched delegates are present in the same turn, the bracket path (line 928–935) adds the turn's tokens to the chain total, then the tool-delegate path (line 1088–1095) adds the same turn's tokens again. This means a turn with both signal types double-counts its tokens toward the cost cap.

In practice, having both a bracket signal AND tool-dispatched delegates in the same turn would be unusual (the bracket signal is end-anchored), but the code doesn't prevent it.

---

## 3. Integration Risk

### [MAJOR] Module-level store creates hidden coupling

**File:** `src/auto-reply/continuation-delegate-store.ts`

The `continue_delegate` tool writes to module-level `Map` singletons, and `agent-runner.ts` reads from them after the run. This "tool writes → runner reads" pattern works but creates invisible coupling:

1. **Testability:** Tests must carefully manage global state between runs. The test file (`continuation-delegate-store.test.ts`) handles this with `beforeEach` cleanup, but integration tests that span multiple runs may be fragile.
2. **Concurrency:** If two agent runs for the same session overlap (race condition during queue processing), delegates from run A could leak into run B's consumption phase.

The code comment at line 8 acknowledges this follows the `sessions_spawn` precedent, which is a reasonable justification. But the risk surface is larger here because delegates carry timed dispatch semantics.

### [MINOR] `cancelContinuationTimer` called from many early-return paths

**File:** `src/auto-reply/reply/get-reply-run.ts:307-310,339-342,477-480`

The cancellation is invoked at 3+ early-return points with identical `!isHeartbeat && !isDelegateWake` guards. This is correct but fragile — any new early-return path must remember to include the cancellation. Consider extracting a `preemptContinuationIfNeeded()` helper.

### [MINOR] Feature flag checked inconsistently

The `continuationFeatureEnabled` flag is checked at `agent-runner.ts:543` for signal stripping and at line 1072 for tool delegates, but `checkContextPressure` at `get-reply-run.ts:383–420` fires regardless of whether continuation is enabled. Context-pressure events are injected even when the agent has no way to act on them (no `CONTINUE_DELEGATE` instruction in system prompt).

This is likely intentional (pressure awareness could inform other behaviors), but it means disabling `continuation.enabled` doesn't fully disable all continuation-related machinery.

---

## 4. Code Quality

### [MAJOR] Duplicate test blocks in `tokens.test.ts`

**File:** `src/auto-reply/tokens.test.ts:242–280` and `282–322`

The `silent-wake` test section is duplicated verbatim. Lines 242–280 and 284–322 contain identical tests:

- "parses [[CONTINUE_DELEGATE: task | silent-wake]] with silentWake flag" (lines 242, 284)
- "parses [[CONTINUE_DELEGATE: task +20s | silent-wake]] with delay and silentWake" (lines 247, 289)
- "parses | silent-wake case-insensitively" (lines 257, 299)
- "does not confuse | silent-wake with | silent" (lines 267, 309)
- "parses delegate without suffix as neither silent nor silentWake" (lines 276, 318)

Even the section comment is duplicated: `// --- [[CONTINUE_DELEGATE: task | silent-wake]] (silent wake enrichment) ---` at lines 240 and 282.

This inflates the test count by 5 (and makes the "172 tests" claim slightly misleading).

### [MAJOR] `maxDelegatesPerTurn` default inconsistency: RFC says 5, code defaults to 10

**File:** `src/agents/tools/continue-delegate-tool.ts:96` vs `docs/design/continue-work-signal-v2.md:283`

The RFC states: "The tool enforces `maxDelegatesPerTurn` (default: 5)". The code: `const maxPerTurn = opts.maxDelegatesPerTurn ?? 10;`. This is a documentation/implementation mismatch.

### [MINOR] Continuation signal processing block is ~170 lines of inline code

**File:** `src/auto-reply/reply/agent-runner.ts:906–1066` (bracket-parsed) and `1072–1216` (tool-dispatched)

The two continuation processing blocks share significant structural similarity (chain tracking, cost cap checks, `spawnSubagentDirect` calls, marker events, delay clamping, persistence). This could be extracted into a shared `processContinuationDelegate()` helper.

The `agent-runner.ts` file is already large (~1245 lines). Extracting continuation processing into a dedicated module (e.g., `agent-runner-continuation.ts`) would improve readability without changing behavior.

### [MINOR] `modeRaw` fallback to empty string

**File:** `src/agents/tools/continue-delegate-tool.ts:90`

When `params.mode` is not a string, `modeRaw` defaults to `""`, which means `isPostCompaction`, `silent`, and `silentWake` are all `false`. The tool then returns `mode: "" || "normal"` in the response (line 142), which evaluates to `"normal"`. This works but the empty-string-to-"normal" coercion is non-obvious.

### [NIT] `readStringParam` import unused validation

**File:** `src/agents/tools/continue-delegate-tool.ts:79`

`readStringParam(params, "task", { required: true })` reads the task, but then line 80 does `if (!task.trim())` as a separate check. The `readStringParam` with `required: true` should already throw on empty strings. Verify whether the extra trim check is needed or redundant.

### [NIT] Inconsistent error handling patterns

Bracket-parsed delegate failures log via `defaultRuntime.log()` at `agent-runner.ts:1014` but tool-dispatched delegate failures also log via `defaultRuntime.log()` at line 1154. Both also enqueue system events. The patterns are consistent with each other but use `log` rather than `error` for failure cases.

---

## 5. Test Coverage

### Summary

The test count across continuation-related files:

| File                                          | Test cases |
| --------------------------------------------- | ---------- |
| `tokens.test.ts` (continuation sections only) | ~50        |
| `continuation-delegate-store.test.ts`         | 15         |
| `context-pressure.test.ts`                    | 27         |
| `context-pressure.integration.test.ts`        | 5          |
| `agent-runner.misc.runreplyagent.test.ts`     | 38         |
| `zod-schema.continuation.test.ts`             | 20         |
| **Total**                                     | **~155**   |

After deducting the 5 duplicate `silent-wake` tests, the actual unique continuation test count is ~150, not 172. The remaining ~22 tests may be in other modified test files (e.g., `web-search.test.ts`, `subagent-announce` changes).

### Gaps

1. **No test for delayed delegate cancellation on external message.** The generation guard for WORK timers is implicitly tested (the `isContinuationWake` logic), but there's no explicit test showing that a delayed `[[CONTINUE_DELEGATE: task +30s]]` is cancelled when a user message arrives during the 30s window. (This gap corresponds to the MAJOR security finding above — the code doesn't actually cancel delayed delegates.)

2. **No test for concurrent tool delegates + bracket signals.** The double-counting issue described in Security §3 has no test coverage.

3. **No test for `pendingDelegates` leak on agent run error.** The `continuation-delegate-store.test.ts` tests enqueue/consume but doesn't test the scenario where delegates are enqueued but the run fails before consumption.

4. **No test for `continuationGenerations` map growth.** No test verifies the map doesn't grow unboundedly or that entries are eventually cleaned up.

5. **Context-pressure tests don't cover `totalTokensFresh` field being `undefined`.** The guard at `context-pressure.ts:44` checks `=== false`, meaning `undefined` passes through. Tests cover `false` and `true` but not `undefined`. (In practice, `totalTokensFresh` should always be set, but defensive testing would cover this.)

6. **Post-compaction delegate dispatch has no unit test.** The `autoCompactionCompleted` block at `agent-runner.ts:848–884` that consumes compaction delegates and spawns them is covered by the integration test but has no isolated unit test for the spawn call parameters, error handling, or multiple compaction delegates.

---

## 6. RFC Quality

### Strengths

The RFC (`docs/design/continue-work-signal-v2.md`) is one of the better design documents I've reviewed:

1. **Concrete code traces.** The "Turn-by-Turn Gateway Processing" section traces exact function calls and line numbers through the codebase. This is rare and valuable — a reviewer can follow the path without guessing.

2. **Threat model.** The "Security Considerations" section identifies specific attack vectors (temporal gap, payload injection, cost amplification) with mitigations.

3. **Behavioral caveats.** The "Post-compaction gap" section honestly acknowledges a known limitation with a memorable metaphor ("kitchen-counter note in your own handwriting that you don't remember writing").

4. **Comparison tables.** The bracket-syntax vs. tool vs. `sessions_spawn` comparison table is immediately useful for deciding which mechanism to use.

### Issues

1. **[MAJOR] `maxDelegatesPerTurn` default stated as 5, code implements 10.** (See Code Quality §2.)

2. **[MINOR] RFC line numbers will drift.** The RFC references specific line numbers in source files (e.g., "line ~544", "line ~977"). These will drift with any subsequent change. Consider referencing function names or code comments instead.

3. **[MINOR] "172 tests" claim.** The PR description claims 172 tests. Actual unique continuation tests are ~150. The discrepancy is partly from duplicate test blocks and partly from counting non-continuation test changes in modified files.

4. **[MINOR] Missing `post-compaction` in Token Variants section.** The RFC's "Token Variants" table (line 24–29) shows `CONTINUE_WORK`, `CONTINUE_WORK:30`, `[[CONTINUE_DELEGATE:]]`, and `DONE` but doesn't mention the `post-compaction` mode, which is only reachable via the tool (not bracket syntax). The tool section covers it, but the overview table is incomplete.

5. **[NIT] `DONE` token not implemented.** The Token Variants table lists `DONE` as a token, but there's no `DONE` parsing in `tokens.ts`. It's described as "(default)" behavior, meaning absence of any signal. This isn't wrong, but listing it as a "token variant" implies it's parsed.

---

## Summary

| Severity | Count | Key items                                                                                                                                                          |
| -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Critical | 1     | `continuationGenerations` unbounded growth                                                                                                                         |
| Major    | 6     | Delegate store leak; no generation guard on delayed delegates; module-level coupling; duplicate tests; `maxDelegatesPerTurn` inconsistency; double-counting tokens |
| Minor    | 9     | Various (NaN guard, event ordering, feature flag inconsistency, etc.)                                                                                              |
| Nit      | 3     | Unused validation, logging levels, DONE token                                                                                                                      |

**Overall assessment:** The design is sound — volitional continuation with configurable bounds is the right approach. The implementation correctly hooks into existing gateway infrastructure (system events, heartbeat wake, sub-agent spawn) without introducing new scheduling primitives. The test suite is thorough for the happy paths.

The main risks are: (1) delayed delegate spawns that survive chain cancellation, (2) module-level state that doesn't clean up on error paths, and (3) the `continuationGenerations` map growing without bounds. Items 1 and 2 should be addressed before merge. Item 3 is low-urgency but should be tracked.

The RFC is unusually thorough and honest about limitations. The `maxDelegatesPerTurn` default mismatch between docs and code should be reconciled.
