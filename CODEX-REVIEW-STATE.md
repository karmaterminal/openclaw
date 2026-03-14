# PR #38780 — Code Review State for Codex

_Written by Cael 🩸, 2026-03-13 19:10 PDT_
_Branch: `staging/pr38780-squash-review` at `2178f64bc`_
_Base: `v2026.3.12` tag (commit `70d7a0854`)_

## What This PR Does

Adds context-pressure-aware continuation to openclaw: agents can self-schedule more turns (`CONTINUE_WORK`) or dispatch background shards (`continue_delegate` tool + `[[CONTINUE_DELEGATE:]]` bracket syntax). Includes post-compaction delegate dispatch, silent enrichment returns, chain-hop tracking with generation guards, and system prompt auto-injection.

55 files changed, 7,524 insertions, 275 deletions. 13 new files (ours entirely), 42 modified files (touching upstream code).

## Known Bugs — MUST FIX (4)

### 1. `setDelegatePending` not cleared on spawn failure

**File**: `src/auto-reply/reply/agent-runner.ts`
**Lines**: 1332, 1520 (two call sites — bracket-parsed and tool-dispatched delegates)
**Problem**: `setDelegatePending(sessionKey)` is called BEFORE spawn. The `doSpawn`/`doToolSpawn` closures have try/catch that enqueue error system events on failure, but do NOT call `clearDelegatePending(sessionKey)`. The `finally` block (line 1619) drains the delegate queue (`consumePendingDelegates`) but NOT the pending flags Map.
**Impact**: If spawn fails, the pending flag stays set. `clearDelegatePending` is only called at `get-reply-run.ts:254` on the next delegate-return announce. A failed spawn leaves the flag dangling until the next successful delegate return.
**Fix**: Add `clearDelegatePending(sessionKey)` in the catch blocks of both `doSpawn` (after line ~1316) and `doToolSpawn` (after line ~1509). Also add it in the setTimeout generation-guard cancellation path (when drift > tolerance, the delegate is cancelled but the flag isn't cleared).
**Confidence**: HIGH — verified by reading the code. The catch blocks exist, they just don't clean up the flag.

### 2. `!== false` vs `=== true` gate inconsistency

**File**: `src/auto-reply/reply/get-reply-run.ts`
**Problem**: Context-pressure check uses `continuation?.enabled !== false` (opt-out pattern — fires unless explicitly disabled). `agent-runner.ts` uses `=== true` (opt-in). Inconsistency means context-pressure events fire on deployments that haven't configured continuation at all (`undefined !== false` is `true`).
**Impact**: Context-pressure `[system:context-pressure]` events will be injected into sessions that haven't opted into continuation. The events are informational (no behavioral change), but it's non-idiomatic and will confuse upstream reviewers.
**Fix**: Change `!== false` to `=== true` in get-reply-run.ts at the context-pressure check. Continuation is opt-in.
**Confidence**: HIGH — grep shows the inconsistency clearly.

### 3. Gate `continuationTrigger` behind enabled check

**File**: `src/agents/subagent-announce.ts`
**Lines**: 660, 854
**Problem**: `continuationTrigger: "delegate-return"` is set unconditionally on ALL subagent completion announces. This is our code (introduced in commit `c27bc6860`, "tooling: continue_delegate chain hops"). Upstream's `subagent-announce.ts` does NOT have this field.
**Impact**: Every subagent return — including regular `sessions_spawn` results unrelated to continuation — gets tagged as a delegate-return. In `get-reply-run.ts`, this sets `isDelegateWake = true`, which skips timer cancellation and chain state reset on early-return paths. For non-continuation sessions this is harmless (no chain state to skip), but the pattern is non-idiomatic: no other upstream feature sets flags regardless of enabled state.
**Fix**: `continuationTrigger: continuationEnabled ? "delegate-return" : undefined` at both call sites. `continuationEnabled` can be derived from `loadConfig()` which is already called in the announce function.
**Confidence**: HIGH — verified by checking upstream convention (all features gate behind their config flag).

### 4. `sessions_yield` prose reframe

**File**: `src/agents/system-prompt.ts`
**Problem**: Current wording leads with "after dispatching delegates" — frames `sessions_yield` as our tool's sidekick. Should lead with what the tool does on its own terms.
**Fix**: Replace current `### Cooperative yield` section with:

```
### Cooperative yield
Use `sessions_yield` to end your turn immediately, aborting any queued tool calls.
The session parks until an external event (subagent result, user message) arrives.
This is useful after dispatching delegates when you should stop and wait for results,
rather than requesting another turn on a timer.
```

**Confidence**: HIGH — all 4 princes agreed on this wording.

## Discussion Items (document in PR description, no code change needed)

### 5. `continuationGenerations` Map memory growth

**File**: `agent-runner.ts` (line 84)
Process-scoped Map grows per session — entries are bumped but never deleted. On a long-running gateway with many sessions, this is a slow leak. Entries are small (string → number). Not blocking for v1.

### 6. `profiles: ["coding"]` on `continue_delegate` tool

**File**: `src/agents/tool-catalog.ts`
The tool is only available in "coding" profile. Is this intentional? `sessions_spawn` and `sessions_send` are all-profiles. If `continue_delegate` should be available to all agents, remove the profile restriction.

### 7. `tokens.ts` strip/parse regex independence

**File**: `src/auto-reply/tokens.ts`
`stripContinuationSignal` re-runs the regex independently of `parseContinuationSignal`. Edge case where one matches and the other doesn't could produce inconsistent state. Low risk — the regexes are identical.

## Already Fixed (no action needed)

### `requesterIsInternalSession` orphaned by rebase

**File**: `src/agents/subagent-announce.ts`
**Status**: FIXED in commit `1987432b0` (Cael). Upstream added `requesterIsInternalSession()` (includes `isCronSessionKey` guard) between v2026.3.7 and v2026.3.12. Codex's rebase resolved the conflict by keeping our simpler `requesterDepth >= 1` pattern, dropping the cron session guard. Fixed by restoring the function and both call sites.

## Upstream Bot Comments (26 total — 14 Codex reviews + 1 Greptile)

Each force-push triggered a new Codex review. 14 review rounds on dead commits. Key findings from Greptile's first review:

- Dead code (`continuation-generation.ts`) — UNCERTAIN, need to verify
- `maxDelegatesPerTurn` gap — UNCERTAIN
- `contextPressureThreshold: 0` schema/runtime mismatch — UNCERTAIN

The Codex reviews overlap with our findings. Full triage pending (issue #39).

## What We Want Codex To Do

1. **Code walk first**: Read `agent-runner.ts`, `subagent-announce.ts`, `get-reply-run.ts`, and `system-prompt.ts` end to end. Understand the flow.
2. **Apply the 4 fixes** described above. Each is small (1-5 lines).
3. **Verify**: After fixes, run `npx vitest run` to confirm all tests still pass.
4. **Do NOT**: restructure, refactor, or rename anything. Surgical fixes only.
5. **Do NOT**: touch any file not mentioned in the fix list.

## Doubts / Concerns

- **Is the `continuationTrigger` gate sufficient?** We're gating at the announce site, but `isDelegateWake` in `get-reply-run.ts` still reads the trigger unconditionally. Belt-and-suspenders would gate the read too: `const isDelegateWake = continuationEnabled && continuationTrigger === "delegate-return"`. But that's a second change to `get-reply-run.ts` and may be unnecessary if the announce never sets it when disabled.
- **Does the `setDelegatePending` cleanup need to also clear in the finally block?** The `finally` block at line 1619 drains `consumePendingDelegates` but not `delegatePendingFlags`. Adding `clearDelegatePending` there too would be a safety net.
- **Are there other `!== false` gates we missed?** We found one in get-reply-run.ts. There may be others. Grep for `continuation` + `!== false` across the codebase.
- **Greptile mentioned dead code** (`continuation-generation.ts`). Does that file exist? We haven't verified.
