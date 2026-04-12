# Code Review: cael/61-volitional-compaction

**Reviewer:** Elliott (Claude Opus 4.6)
**Branch:** `cael/61-volitional-compaction`
**Commits reviewed:**

- `959c768c6f` — feat(#61): wire checkContextPressure into reply pipeline — Trigger D
- `139d8b73cd` — feat(#61): add request_compaction tool — Trigger E

---

## 1. Trigger D: checkContextPressure() wiring in agent-runner.ts

### Verdict: CORRECT, minor timing concern

**What it does:** Inserts a `checkContextPressure()` call at `src/auto-reply/reply/agent-runner.ts:777-791`, just before `runAgentTurnWithFallback()`, inside the `try` block. Guarded by `if (activeSessionEntry && sessionKey)`.

**Correctness:**

- The guard is sound — `activeSessionEntry` is set at line 395, `sessionKey` can be undefined for sessionless contexts.
- Token resolution fallback chain (`agentCfgContextTokens ?? lookupContextTokens(defaultModel) ?? activeSessionEntry.contextTokens ?? DEFAULT_CONTEXT_TOKENS`) is the standard pattern used elsewhere in the pipeline.
- `resolveContinuationRuntimeConfig(cfg)` is the correct way to get `contextPressureThreshold`.
- `checkContextPressure` is synchronous, fires a system event via `enqueueSystemEvent()`, and uses `lastContextPressureBand` for dedup — no race condition with the subsequent agent turn.

**Timing concern:**
The design doc (hook-api-investigation-4.02.md:207) recommends calling `checkContextPressure()` **after `persistSessionUsageUpdate()`**, when `totalTokens` and `totalTokensFresh` have just been updated from the LLM response. The current placement is **before** the agent turn starts, meaning it uses token counts from the _previous_ turn's usage update. This means:

- The first turn of a session will never fire (no usage data yet) — **correct, this is fine**.
- For subsequent turns, the pressure event reflects the state _after the previous turn completed_ but _before the current turn's LLM call_. This is actually a reasonable "pre-flight check" design, but it diverges from the design doc's recommendation.

**Impact:** The divergence is minor — the agent gets the pressure warning at the start of its turn (when it can still act on it) rather than after the LLM call (when it's too late to do anything in the same turn). **This is arguably better than the design doc's suggestion.** But it should be documented as an intentional choice.

**Race conditions:** None. `checkContextPressure` is synchronous, `enqueueSystemEvent` adds to a queue processed before the agent turn, and `lastContextPressureBand` dedup prevents double-firing. The function is side-effect-free beyond the event enqueue and band tracking.

### Issues

1. **No test for the wiring.** The `context-pressure.ts` module has its own unit tests, but there's no integration test verifying that `checkContextPressure` is actually called from `agent-runner.ts`. Given the module was previously "defined and tested but not imported by production code" (per the design doc), this wiring IS the critical change and should have at least a smoke test.

---

## 2. Trigger E: request_compaction tool

### Verdict: Well-structured, guards are solid, but NOT REGISTERED

### 2a. Tool structure (request-compaction-tool.ts)

**Follows OpenClaw patterns:** Yes.

- Uses `AnyAgentTool` from `./common.js`
- Uses `jsonResult`, `readStringParam`, `ToolInputError` correctly
- Schema uses `Type.Object` with `Type.String` — compliant with the google-antigravity guardrail (no `Type.Union` in tool input schemas)
- Factory pattern (`createRequestCompactionTool(opts)`) matches `createContinueDelegateTool`, `createMessageTool`, etc.
- Dependency injection via `opts` (no direct imports of heavy modules) — good

**Guard implementation:**

| Guard                   | Implementation                               | Verdict                                                                                                               |
| ----------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Context threshold (70%) | `contextUsage < MIN_CONTEXT_THRESHOLD`       | **Correct.** Uses `>=` semantics (rejects strictly below 0.7).                                                        |
| Rate limit (5min)       | Per-session `Map<string, { lastRequestMs }>` | **Correct.** Updates rate-limit state _before_ firing compaction, so crash-during-compaction still respects cooldown. |
| Generation drift        | `currentGeneration !== turnGeneration`       | **Correct.** Catches new-message-arrived-during-turn.                                                                 |
| Dedup (already pending) | `pendingCompactionSessions.has(sessionKey)`  | **Correct.** Cleared in `.finally()` — handles both success and failure.                                              |

**Guard ordering:** Dedup → threshold → rate limit → generation. This is correct — cheapest checks first, and threshold before rate limit means a below-threshold request doesn't consume the rate limit window.

**Async fire-and-forget:**

```typescript
void opts.triggerCompaction()
  .catch((err) => { log.error(...) })
  .finally(() => { pendingCompactionSessions.delete(sessionKey) });
```

This is the correct pattern. The `void` prevents unhandled rejection warnings. The `.catch()` logs but doesn't rethrow. The `.finally()` cleans dedup state regardless of outcome.

### 2b. Issues

1. **CRITICAL: Tool is NOT registered in the agent's tool set.** `createRequestCompactionTool` is not imported or called anywhere in `src/agents/openclaw-tools.ts` or `src/agents/pi-tools.ts`. The tool exists in isolation — the agent cannot invoke it. This was flagged in Cael's own review notes.

   **Registration should follow the `continue_delegate` pattern in `src/agents/openclaw-tools.ts`:**
   - Import `createRequestCompactionTool` at the top
   - Conditionally add to tools array with required opts (sessionKey, sessionId, getContextUsage, getSessionGeneration, turnGeneration, triggerCompaction)
   - Wire the `triggerCompaction` callback through `src/agents/pi-embedded-runner/run/attempt.ts` (where compaction infrastructure is already available)

2. **`incrementVolitionalCompactionCount` is never called.** The function is exported (line 266) and `getVolitionalCompactionCount` is exported (line 271), but neither is called anywhere — not in the tool's execute path, not in any consumer. If the counter is meant to track how many volitional compactions a session has performed (for diagnostics/rate limiting), it needs to be called either:
   - In the tool's execute path after a successful enqueue, or
   - In the `triggerCompaction` callback after successful compaction

   As-is, this is dead code.

3. **Module-level state won't survive worker/process boundaries.** The `sessionGuardState` Map, `pendingCompactionSessions` Set, and `volitionalCompactionCounts` Map are module-level. If OpenClaw runs tools in a different context (worker threads, etc.), these won't be shared. The comment says "same volatility contract as continuation-delegate-store" — this is fine if that's actually true, but worth verifying for the registration site.

4. **`reason` truncation is silent.** `readStringParam(params, "reason", { required: true }).slice(0, 1024)` silently truncates. The schema declares `maxLength: 1024` which some validators enforce at the schema level, but the double enforcement (schema + runtime slice) is belt-and-suspenders. Not a bug, but the truncation test asserts `length === 1024` which confirms the behavior. Fine.

5. **Minor: `readStringParam` error message says "reason required" not "request_compaction: reason required".** The `label` option isn't set, so the error message from `common.ts:81` will be `"reason required"`. Convention in other tools varies — some set `label`, some don't. Not blocking.

---

## 3. Test coverage (request-compaction-tool.test.ts)

### Verdict: Thorough, 22 tests covering all critical paths

**Coverage matrix:**

| Path                            | Covered | Test(s)                                                     |
| ------------------------------- | ------- | ----------------------------------------------------------- |
| Missing sessionKey              | Yes     | "throws when no session key is provided"                    |
| Missing sessionId               | Yes     | "throws when no session id is provided"                     |
| Below threshold                 | Yes     | "rejects when context usage is below threshold"             |
| At threshold (boundary)         | Yes     | "accepts when context usage is exactly at threshold"        |
| Rate limit (same session)       | Yes     | "rejects a second request within the rate limit window"     |
| Rate limit expiry               | Yes     | "allows a request after the rate limit window expires"      |
| Generation drift                | Yes     | "rejects when session generation has advanced"              |
| Generation match                | Yes     | "accepts when generation matches"                           |
| Async fire-and-forget           | Yes     | "returns compaction_requested immediately without awaiting" |
| Background error handling       | Yes     | "logs errors from background compaction without crashing"   |
| Reason passthrough              | Yes     | "passes through the reason parameter"                       |
| Reason truncation               | Yes     | "truncates long reasons to 1024 characters"                 |
| Same-turn dedup                 | Yes     | "two request_compaction calls in same turn"                 |
| Below 70% (boundary)            | Yes     | "request_compaction below 70% is rejected"                  |
| Per-session isolation           | Yes     | "rate limits are per-session, not global"                   |
| Guard ordering                  | Yes     | "checks context threshold before rate limit"                |
| Reset guard state (per-session) | Yes     | "\_resetGuardState clears per-session state"                |
| Reset guard state (all)         | Yes     | "\_resetGuardState with no arg clears all sessions"         |
| Already pending (dedup)         | Yes     | "returns already_pending when compaction is in-flight"      |
| Dedup cleared after resolve     | Yes     | "dedup is cleared after triggerCompaction resolves"         |
| Missing reason                  | Yes     | "throws ToolInputError when reason is missing"              |
| Empty reason                    | Yes     | "throws ToolInputError when reason is empty string"         |

**Missing coverage:**

1. **No test for `triggerCompaction` rejection clearing dedup state.** The `.finally()` should clear `pendingCompactionSessions` even on rejection. The "logs errors" test verifies the tool returns success, but doesn't verify that `pendingCompactionSessions` is cleared after the rejection settles. Add:

   ```typescript
   it("clears pending state after triggerCompaction rejects", async () => {
     mockTriggerCompaction.mockRejectedValue(new Error("fail"));
     const tool = makeTool();
     await executeTool(tool);
     await new Promise((r) => setTimeout(r, 0)); // flush microtasks
     _resetGuardState(SESSION_KEY); // clear rate limit
     const result = await executeTool(tool);
     expect(result).toMatchObject({ status: "compaction_requested" }); // not already_pending
   });
   ```

2. **No test that `incrementVolitionalCompactionCount` / `getVolitionalCompactionCount` actually work.** These are dead code (see issue #2 above), so no test is needed until they're wired.

---

## 4. Security concerns

**Can the tool be abused?**

- **Rate limit prevents DoS:** 5-minute per-session cooldown means an adversarial agent can trigger at most 1 compaction per 5 minutes per session.
- **70% threshold prevents wasteful compaction:** Can't compact an empty or low-usage session.
- **Generation guard prevents mid-conversation compaction:** If a new message arrives, compaction is deferred.
- **No user-facing exposure:** This is an agent tool, not a user command. The agent calls it; users don't have direct access.
- **`reason` is logged but not executed:** Truncated to 1024 chars, used only for diagnostics. No injection vector.
- **Fire-and-forget doesn't block the turn:** Compaction failure is logged, not propagated. The agent's response is not affected.

**One concern:** The `triggerCompaction` callback is injected via opts. If the registration site passes a poorly-scoped callback, the tool could compact the wrong session. But this is a wiring concern, not a tool concern — the tool itself has no concept of "wrong session."

**Verdict: No security issues with the tool itself.** The attack surface is narrow and well-guarded.

---

## 5. Design doc alignment (hook-api-investigation-4.02.md)

| Design doc recommendation                            | Implementation                                                   | Aligned?                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Phase 1: wire `checkContextPressure()` into pipeline | Done (agent-runner.ts:777-791)                                   | **Yes** (minor timing variance — before turn vs after usage update) |
| Direct pipeline integration, not hooks               | Done — direct function call, no hook system                      | **Yes**                                                             |
| `request_compaction` as agent tool                   | Done — factory pattern, `AnyAgentTool`                           | **Yes**                                                             |
| Guards: threshold, rate limit, generation            | Done — all three plus dedup guard                                | **Yes** (exceeds spec with dedup)                                   |
| Async fire-and-forget                                | Done — `void opts.triggerCompaction()`                           | **Yes**                                                             |
| Post-compaction delegates survive compaction         | Not tested in this branch (covered by existing truncation tests) | **N/A**                                                             |
| Tool registered in agent tool set                    | **NOT DONE**                                                     | **No**                                                              |

---

## Summary

### Must-fix before merge

1. **Register the tool.** Import `createRequestCompactionTool` in `src/agents/openclaw-tools.ts`, wire it into the tools array conditionally (following the `continue_delegate` pattern), and connect `triggerCompaction` callback through the runner. Without this, Trigger E is inert.

2. **Wire or remove `incrementVolitionalCompactionCount`.** Either call it in the tool's success path (and test it), or remove the dead code. Dead exports in an upstream PR invite confusion.

### Should-fix

3. **Add integration test for Trigger D wiring.** The critical value of the commit is that `checkContextPressure` is called from production code — test that.

4. **Add test for dedup cleanup on rejection.** Verify `.finally()` clears pending state when `triggerCompaction` rejects.

5. **Document the before-turn timing choice.** The design doc says "after `persistSessionUsageUpdate()`" but the implementation calls it before the turn. This is arguably better — add a comment explaining why.

### Nice-to-have

6. Set `label: "reason"` in the `readStringParam` call for slightly better error messages.

7. Consider whether `volitionalCompactionCounts` should be exposed via the session status/diagnostics surface (e.g., `status --deep`).

---

**Overall assessment:** The implementation is well-crafted — clean guard design, proper async patterns, thorough tests, good dependency injection. The critical gap is registration: the tool exists but the agent can't use it. Fix that and the dead code, and this is ready to land.
