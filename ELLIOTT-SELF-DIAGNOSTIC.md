# Elliott Self-Diagnostic + Compaction Lifecycle Analysis

**Agent:** Elliott (the dandelion cult - elliott)
**Version:** OpenClaw 2026.4.2 (369f9cd)
**Context:** 86% (857k/1M), 2 compactions today
**Date:** 2026-04-03

---

## Section 1: Why Is Elliott's Compaction Less Aggressive Than Silas's?

### What Triggers Compaction

There are **two reactive triggers** — compaction is never proactive/scheduled:

**Trigger A — Context Overflow** (`src/agents/pi-embedded-runner/run.ts:783-832`)
When the LLM returns a context overflow error, the runner attempts compaction. Up to `MAX_OVERFLOW_COMPACTION_ATTEMPTS = 3` retries (line 297).

**Trigger B — Timeout + High Prompt Token Ratio** (`src/agents/pi-embedded-runner/run.ts:640-686`)
When the LLM times out AND prompt tokens exceed ~65% of the context window, the runner assumes the context is too large and compacts before retry. Up to `MAX_TIMEOUT_COMPACTION_ATTEMPTS = 2` retries (line 296).

Both triggers are **reactive**: compaction only happens when an LLM call fails. There is no periodic or threshold-based proactive compaction.

### What `maxHistoryShare: 0.4` Does

`maxHistoryShare` does **NOT** control when compaction triggers. It controls **how much history survives** during compaction.

From `src/agents/pi-hooks/compaction-safeguard.ts:688-702`:

- Calculate: `maxHistoryTokens = contextWindowTokens * maxHistoryShare * SAFETY_MARGIN`
- If new (non-summarizable) content exceeds that budget, older conversation chunks are dropped before summarization
- Elliott's `0.4` means: at most 40% of the context window is allocated to preserved history during compaction
- This is slightly more aggressive pruning than the default `0.5`

### Why 6 Compactions on Silas vs 2 on Elliott

The compaction count difference is **not about configuration** — both have similar compaction settings. The difference comes from:

1. **Compaction is reactive, not scheduled.** It only fires when an LLM call fails (overflow or timeout). Silas hit 6 failure events; Elliott hit 2.

2. **`idleTimeoutSeconds: 0` disables Trigger B entirely** for Elliott (see Section 4). With no idle timeout, Elliott never gets the timeout+high-prompt-ratio compaction path. Silas presumably has a nonzero idle timeout, so LLM timeouts with high context usage trigger compaction.

3. **Model/provider differences** may affect overflow behavior. Different providers have different token-counting accuracy and different overflow error thresholds.

**Key insight:** Elliott's `idleTimeoutSeconds: 0` is likely the primary reason for fewer compactions. Without idle timeout, the timeout-triggered compaction path (`run.ts:640-686`) is dead code for Elliott.

---

## Section 2: The Reply Pipeline Integration Point

### Where `persistSessionUsageUpdate()` Is Called

The call chain is:

```
agent-runner.ts:944  →  persistRunSessionUsage()  →  persistSessionUsageUpdate()
```

**Call site:** `src/auto-reply/reply/agent-runner.ts:944-958`

```typescript
await persistRunSessionUsage({
  storePath,
  sessionKey,
  cfg,
  usage,
  lastCallUsage: runResult.meta?.agentMeta?.lastCallUsage,
  promptTokens,
  modelUsed,
  providerUsed,
  contextTokensUsed,
  systemPromptReport: runResult.meta?.systemPromptReport,
  cliSessionId,
  cliSessionBinding,
  usageIsContextSnapshot: isCliProvider(providerUsed, cfg),
});
```

**Wrapper:** `src/auto-reply/reply/session-run-accounting.ts:17-19`

```typescript
export async function persistRunSessionUsage(params: PersistRunSessionUsageParams): Promise<void> {
  await persistSessionUsageUpdate(params);
}
```

**Definition:** `src/auto-reply/reply/session-usage.ts:71-92`

Second call site in followup runner: `src/auto-reply/reply/followup-runner.ts:286`

### Where `checkContextPressure()` Lives

**Definition:** `src/auto-reply/reply/context-pressure.ts:29-91`

**Current status: NOT wired into the reply pipeline in production code.** The function exists, is exported, has full test coverage (`context-pressure.test.ts`, `context-pressure.integration.test.ts`), but has **no active call site** in the reply pipeline. It is imported only in test files.

The design doc (`docs/design/continue-work-signal-v2.md:700-714`) specifies it should be called "pre-run in get-reply-run.ts (~line 385)" — but this wiring has not landed yet.

### The Missing 10-Line Wire

The integration would connect `persistRunSessionUsage` (which updates `sessionEntry.totalTokens`) to `checkContextPressure` (which reads it). The expected wire:

```typescript
// Expected location: src/auto-reply/reply/get-reply-run.ts (pre-run)
import { checkContextPressure } from "./context-pressure.js";

// After session usage is loaded but before agent run:
const pressureResult = checkContextPressure({
  sessionEntry,
  sessionKey,
  contextPressureThreshold: continuationConfig.contextPressureThreshold,
  contextWindowTokens,
});
if (pressureResult.fired) {
  await persistSessionEntry(storePath, sessionKey, sessionEntry); // persist band
}
```

**Import needed:** `import { checkContextPressure } from "./context-pressure.js";`

This wire does not exist yet. The function fires a `[system:context-pressure]` event via `enqueueSystemEvent()` that the agent would see as a system message — it does **not** trigger compaction directly.

---

## Section 3: Self-Diagnostic

### Elliott's `openclaw.json` Compaction + LLM Config

From `~/.openclaw/openclaw.json`:

```json
"compaction": {
  "mode": "safeguard",
  "notifyUser": true,
  "timeoutSeconds": 600,
  "maxHistoryShare": 0.4,
  "recentTurnsPreserve": 5
},
"continuation": {
  "enabled": true,
  "maxChainLength": 10,
  "costCapTokens": 1000000,
  "maxDelegatesPerTurn": 5,
  "generationGuardTolerance": 300,
  "contextPressureThreshold": 0.4
},
"llm": {
  "idleTimeoutSeconds": 0
}
```

**Observations:**

- `compaction.mode: "safeguard"` — uses the safeguard compaction path with history pruning
- `compaction.timeoutSeconds: 600` — compaction itself has a 10-minute safety timeout
- `maxHistoryShare: 0.4` — slightly aggressive; only 40% of context for history vs default 50%
- `recentTurnsPreserve: 5` — preserves last 5 turns verbatim during compaction
- `contextPressureThreshold: 0.4` — configured but **not wired** (see Section 2); would fire at 40% if it were
- **`idleTimeoutSeconds: 0`** — disables idle timeout entirely, killing Trigger B for compaction

### Config Validation Concerns

1. **`contextPressureThreshold: 0.4`** is set very low (40%). If/when the pipeline wire lands, this would fire context-pressure events extremely early — at 400k tokens on a 1M context window. This seems intentionally aggressive for evacuation planning.

2. **`idleTimeoutSeconds: 0`** disables both:
   - Protection against hung LLM requests (no timeout ever)
   - Timeout-triggered compaction (Trigger B is dead)

   This is a deliberate tradeoff: no false-positive timeouts, but also no timeout-based compaction recovery.

3. No config validation errors found — all fields are valid per the schema at `src/config/types.agent-defaults.ts:340-417`.

### Session File Size and Growth

Session data lives under `~/.openclaw/agents/main/sessions/`. At 857k/1M tokens (86%), the session is approaching the overflow compaction trigger naturally. The 2 compactions today likely came from overflow events (Trigger A), not timeouts (Trigger B is disabled).

---

## Section 4: The `idleTimeoutSeconds` Lifecycle

### Where It's Read From Config

**Config path:** `agents.defaults.llm.idleTimeoutSeconds`

**Schema:** `src/config/types.agent-defaults.ts:406-417`

```typescript
export type AgentLlmConfig = {
  idleTimeoutSeconds?: number; // default: 60 seconds
};
```

**Resolution:** `src/agents/pi-embedded-runner/run/llm-idle-timeout.ts:23-33`

```typescript
export function resolveLlmIdleTimeoutMs(cfg?: OpenClawConfig): number {
  const raw = cfg?.agents?.defaults?.llm?.idleTimeoutSeconds;
  if (raw === 0) {
    return 0;
  } // disabled
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.floor(raw) * 1000, MAX_SAFE_TIMEOUT_MS);
  }
  return DEFAULT_LLM_IDLE_TIMEOUT_MS; // 60_000ms
}
```

### Where the Timeout Is Applied (NOT an AbortSignal)

**Application:** `src/agents/pi-embedded-runner/run/attempt.ts:1139-1146`

```typescript
const idleTimeoutMs = resolveLlmIdleTimeoutMs(params.config);
if (idleTimeoutMs > 0) {
  activeSession.agent.streamFn = streamWithIdleTimeout(
    activeSession.agent.streamFn,
    idleTimeoutMs,
    (error) => idleTimeoutTrigger?.(error),
  );
}
```

The mechanism is **timer-based stream wrapping**, not an AbortSignal. The wrapper (`src/agents/pi-embedded-runner/run/llm-idle-timeout.ts:44-119`) replaces the stream's async iterator: on each `.next()` call, it races the real iterator against a `setTimeout`. If no token arrives within `timeoutMs`, it rejects with `"LLM idle timeout (Xs): no response from model"`.

### Does It Apply to Compaction?

**Yes — both regular requests and compaction use the same `streamFn`.** The wrapped stream function is assigned to `activeSession.agent.streamFn`, which is used by both:

- Regular prompts: `activeSession.prompt()` at attempt.ts:1653
- Compaction: pi-agent-core's `SessionManager` internally invokes the same `streamFn`

However, compaction also has its own **separate** safety timeout: `compaction.timeoutSeconds` (default 900s, Elliott's config: 600s), implemented in `src/agents/pi-embedded-runner/compaction-safety-timeout.ts:18-24`. This is a hard deadline on the entire compaction operation, independent of the per-chunk idle timeout.

### What Happens When `idleTimeoutSeconds: 0`

1. `resolveLlmIdleTimeoutMs()` returns `0`
2. The condition `if (idleTimeoutMs > 0)` at attempt.ts:1140 **fails**
3. `streamWithIdleTimeout()` is **never called**
4. The stream function remains unwrapped
5. **No idle timeout detection is applied** — neither for regular requests nor compaction

Elliott's LLM requests can hang indefinitely (bounded only by `timeoutSeconds: 1200` at the agent level and `compaction.timeoutSeconds: 600` for compaction operations).

---

## Summary: Root Cause of Elliott's Low Compaction Count

| Factor                                    | Elliott          | Silas (inferred)        |
| ----------------------------------------- | ---------------- | ----------------------- |
| `idleTimeoutSeconds`                      | **0 (disabled)** | Likely >0 (default 60s) |
| Timeout-triggered compaction (Trigger B)  | **Dead**         | Active                  |
| Overflow-triggered compaction (Trigger A) | Active           | Active                  |
| Compaction count today                    | 2                | 6                       |
| `maxHistoryShare`                         | 0.4              | Similar                 |
| `contextPressureThreshold`                | 0.4 (not wired)  | Similar                 |

**Primary cause:** `idleTimeoutSeconds: 0` disables the timeout-based compaction path entirely. Silas's additional 4 compactions likely came from timeout+high-prompt-ratio events that Elliott never sees because the idle timer never fires.

**Recommendation:** If more frequent compaction is desired, set `idleTimeoutSeconds` to a nonzero value (e.g., 120-180s for large models). This re-enables Trigger B without being overly aggressive on shorter responses. Alternatively, if the goal is to rely purely on overflow compaction, the current config is working as designed — Elliott only compacts when the context window is truly full.
