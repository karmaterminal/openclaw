# `request_compaction` Tool — Design & Implementation Plan

## Overview

A new agent tool that allows the LLM to **volitionally trigger context compaction** after preparing (writing memory, dispatching delegates, saving state). Unlike automatic compaction (overflow/budget triggers), this gives the agent explicit control over _when_ to compact, enabling it to preserve critical context by writing it to durable storage first.

## Motivation

Today compaction fires reactively — at 90% overflow or configurable budget thresholds. The agent has no way to say "I've finished my prep work, compact now before I lose context." This tool closes that gap:

1. Agent notices context pressure building
2. Agent writes memory, dispatches delegates, saves any ephemeral state
3. Agent calls `request_compaction` with optional focus instructions
4. Compaction runs via the same path as `/compact`
5. Agent continues with a fresh context window

---

## Files to Create

### 1. `src/agents/tools/request-compaction-tool.ts`

New tool definition following the factory pattern.

```typescript
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { textResult, failedTextResult } from "./common.js";
import { readStringParam } from "./common.js";

const RequestCompactionToolSchema = Type.Object({
  instructions: Type.Optional(
    Type.String({
      description:
        "Optional guidance for the compaction summarizer — what to preserve, " +
        "what can be dropped, key decisions or state to carry forward.",
    }),
  ),
});

/** Minimum context utilization ratio before the tool will fire. */
const MIN_CONTEXT_RATIO = 0.7;

/** Rate limit: minimum milliseconds between successful compactions. */
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Per-session tracking for rate limiting and generation guards.
 * Key: sessionId
 */
const sessionState = new Map<string, { lastCompactionMs: number; lastGeneration: number }>();

export function createRequestCompactionTool(opts: {
  sessionId: string;
  sessionKey?: string;
  /**
   * Returns the current context utilization ratio (0–1).
   * Typically: totalTokens / contextWindowTokens.
   */
  getContextRatio: () => number;
  /**
   * Returns the current generation counter for the session run.
   * Used to prevent the tool from being called multiple times in the same
   * generation (turn).
   */
  getGeneration: () => number;
  /**
   * Triggers compaction. Mirrors the signature used by commands-compact.ts.
   * Returns the compaction result.
   */
  triggerCompaction: (params: { customInstructions?: string }) => Promise<{
    ok: boolean;
    compacted: boolean;
    reason?: string;
    tokensBefore?: number;
    tokensAfter?: number;
  }>;
}): AnyAgentTool {
  return {
    label: "Compaction",
    name: "request_compaction",
    displaySummary: "Request context compaction to free up context window space.",
    description:
      "Request context compaction to free up context window space. " +
      "Use this AFTER you have saved any important state (memory, delegates, notes) " +
      "that you need to survive compaction. " +
      "Guards: requires ≥70% context utilization, rate-limited to once per 5 minutes, " +
      "and limited to once per generation (turn). " +
      "Optionally provide instructions to guide what the compaction summary should preserve.",
    ownerOnly: false,
    parameters: RequestCompactionToolSchema,

    execute: async (_toolCallId, args, signal) => {
      const params = { ...(args as Record<string, unknown>) };
      const instructions = readStringParam(params, "instructions");
      const sessionId = opts.sessionId;

      // --- Guard: minimum context utilization ---
      const contextRatio = opts.getContextRatio();
      if (contextRatio < MIN_CONTEXT_RATIO) {
        return failedTextResult(
          `Compaction declined: context utilization is ${Math.round(contextRatio * 100)}%, ` +
            `below the ${Math.round(MIN_CONTEXT_RATIO * 100)}% minimum. ` +
            "Continue working — compaction is not needed yet.",
          { status: "failed" as const, reason: "below_threshold" },
        );
      }

      // --- Guard: generation (once per turn) ---
      const currentGeneration = opts.getGeneration();
      const state = sessionState.get(sessionId);
      if (state && state.lastGeneration === currentGeneration) {
        return failedTextResult(
          "Compaction declined: already requested this generation (turn). " +
            "Wait for the next turn before requesting again.",
          { status: "failed" as const, reason: "generation_guard" },
        );
      }

      // --- Guard: rate limit ---
      const now = Date.now();
      if (state && now - state.lastCompactionMs < RATE_LIMIT_MS) {
        const remainingSec = Math.ceil((RATE_LIMIT_MS - (now - state.lastCompactionMs)) / 1000);
        return failedTextResult(
          `Compaction declined: rate-limited. Try again in ~${remainingSec}s.`,
          { status: "failed" as const, reason: "rate_limited" },
        );
      }

      // --- Trigger compaction ---
      const result = await opts.triggerCompaction({
        customInstructions: instructions,
      });

      // Update session state on success
      if (result.ok && result.compacted) {
        sessionState.set(sessionId, {
          lastCompactionMs: Date.now(),
          lastGeneration: currentGeneration,
        });

        const before = result.tokensBefore ? `${Math.round(result.tokensBefore / 1000)}k` : "?";
        const after = result.tokensAfter ? `${Math.round(result.tokensAfter / 1000)}k` : "?";

        return textResult(
          `Compaction complete (${before} → ${after} tokens). ` +
            "Context has been summarized. Continue with your task.",
          {
            status: "compacted" as const,
            tokensBefore: result.tokensBefore,
            tokensAfter: result.tokensAfter,
          },
        );
      }

      // Compaction was skipped or failed
      const reason = result.reason ?? "unknown";
      return textResult(
        result.ok
          ? `Compaction skipped: ${reason}. Continue working.`
          : `Compaction failed: ${reason}.`,
        {
          status: result.ok ? ("skipped" as const) : ("failed" as const),
          reason,
        },
      );
    },
  };
}

/** Clear rate-limit state for a session (for testing or session reset). */
export function clearCompactionToolState(sessionId: string): void {
  sessionState.delete(sessionId);
}
```

### 2. `src/agents/tools/request-compaction-tool.test.ts`

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createRequestCompactionTool,
  clearCompactionToolState,
} from "./request-compaction-tool.js";

function makeTool(overrides?: {
  contextRatio?: number;
  generation?: number;
  triggerResult?: {
    ok: boolean;
    compacted: boolean;
    reason?: string;
    tokensBefore?: number;
    tokensAfter?: number;
  };
}) {
  const triggerCompaction = vi.fn().mockResolvedValue(
    overrides?.triggerResult ?? {
      ok: true,
      compacted: true,
      tokensBefore: 80_000,
      tokensAfter: 20_000,
    },
  );
  let gen = overrides?.generation ?? 1;
  const tool = createRequestCompactionTool({
    sessionId: "test-session",
    getContextRatio: () => overrides?.contextRatio ?? 0.85,
    getGeneration: () => gen,
    triggerCompaction,
  });
  return { tool, triggerCompaction, setGeneration: (g: number) => (gen = g) };
}

beforeEach(() => {
  clearCompactionToolState("test-session");
});

describe("request_compaction tool", () => {
  it("succeeds when context is above threshold", async () => {
    const { tool, triggerCompaction } = makeTool();
    const result = await tool.execute("tc1", {}, undefined);
    expect(triggerCompaction).toHaveBeenCalledOnce();
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Compaction complete"),
    });
  });

  it("rejects when context ratio is below 70%", async () => {
    const { tool, triggerCompaction } = makeTool({ contextRatio: 0.5 });
    const result = await tool.execute("tc1", {}, undefined);
    expect(triggerCompaction).not.toHaveBeenCalled();
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("below the 70% minimum"),
    });
  });

  it("rejects duplicate calls in the same generation", async () => {
    const { tool, triggerCompaction } = makeTool();
    await tool.execute("tc1", {}, undefined);
    const result2 = await tool.execute("tc2", {}, undefined);
    expect(triggerCompaction).toHaveBeenCalledOnce();
    expect(result2.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("already requested this generation"),
    });
  });

  it("allows calls in different generations", async () => {
    const { tool, triggerCompaction, setGeneration } = makeTool();
    await tool.execute("tc1", {}, undefined);
    // Bypass rate limit for this test by manipulating time
    vi.useFakeTimers();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    setGeneration(2);
    await tool.execute("tc2", {}, undefined);
    expect(triggerCompaction).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("enforces rate limit within 5 minutes", async () => {
    const { tool, triggerCompaction, setGeneration } = makeTool();
    await tool.execute("tc1", {}, undefined);
    setGeneration(2); // Different generation, but within rate limit window
    const result2 = await tool.execute("tc2", {}, undefined);
    expect(triggerCompaction).toHaveBeenCalledOnce();
    expect(result2.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("rate-limited"),
    });
  });

  it("passes custom instructions to triggerCompaction", async () => {
    const { tool, triggerCompaction } = makeTool();
    await tool.execute("tc1", { instructions: "Preserve the API design decisions" }, undefined);
    expect(triggerCompaction).toHaveBeenCalledWith({
      customInstructions: "Preserve the API design decisions",
    });
  });

  it("handles compaction skip gracefully", async () => {
    const { tool } = makeTool({
      triggerResult: { ok: true, compacted: false, reason: "nothing to compact" },
    });
    const result = await tool.execute("tc1", {}, undefined);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("skipped"),
    });
  });

  it("handles compaction failure gracefully", async () => {
    const { tool } = makeTool({
      triggerResult: { ok: false, compacted: false, reason: "provider error" },
    });
    const result = await tool.execute("tc1", {}, undefined);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("failed"),
    });
  });
});
```

---

## Files to Modify

### 3. `src/agents/openclaw-tools.ts` — Register the tool

Add import and instantiation alongside existing tools:

```typescript
// Add import at top:
import { createRequestCompactionTool } from "./tools/request-compaction-tool.js";

// In createOpenClawTools(), add to the tools array (after session tools, before plugin tools):
// Add new option fields to the function signature:
//   getContextRatio?: () => number;
//   getGeneration?: () => number;
//   triggerCompaction?: (params: { customInstructions?: string }) => Promise<{...}>;

// Conditional inclusion (only when compaction deps are provided):
...(options?.sessionId && options?.getContextRatio && options?.getGeneration && options?.triggerCompaction
  ? [
      createRequestCompactionTool({
        sessionId: options.sessionId,
        sessionKey: options.agentSessionKey,
        getContextRatio: options.getContextRatio,
        getGeneration: options.getGeneration,
        triggerCompaction: options.triggerCompaction,
      }),
    ]
  : []),
```

### 4. `src/agents/pi-embedded-runner/agent-runner.ts` (or equivalent session runner)

Wire the three callback dependencies when constructing tools:

```typescript
// When calling createOpenClawTools, provide:
getContextRatio: () => {
  const total = sessionEntry.totalTokens ?? 0;
  const window = sessionEntry.contextTokens ?? modelContextWindow;
  return window > 0 ? total / window : 0;
},
getGeneration: () => currentGeneration, // from the run loop counter
triggerCompaction: async ({ customInstructions }) => {
  const result = await compactEmbeddedPiSession({
    sessionId,
    sessionKey,
    sessionFile,
    workspaceDir,
    agentDir,
    config,
    provider,
    model,
    thinkLevel,
    customInstructions,
    trigger: "manual",
    // ... remaining params from existing compaction call site
  });
  return {
    ok: result.ok,
    compacted: result.compacted,
    reason: result.reason,
    tokensBefore: result.result?.tokensBefore,
    tokensAfter: result.result?.tokensAfter,
  };
},
```

### 5. System prompt addition

Add to the agent system prompt (in the tool-instructions or session-preamble section):

```
## Context Management — request_compaction

You have a `request_compaction` tool that lets you trigger context compaction on demand.

**When to use it:**
- When you notice context pressure is high (≥70% utilization) and you have finished
  a logical phase of work
- BEFORE calling it: save any important state that must survive compaction —
  write memory, dispatch delegates, persist notes, finish in-progress tool calls
- Provide `instructions` to guide the summarizer on what to preserve

**When NOT to use it:**
- In the middle of multi-step work where you need recent tool results
- When context is low — the tool will reject calls below 70% utilization
- Repeatedly — it is rate-limited to once per 5 minutes

**Pattern:**
1. Finish current work phase
2. Write durable state (memory, delegates, files)
3. Call `request_compaction` with preservation instructions
4. Continue from the compacted summary
```

---

## Architecture Decisions

### Why a tool, not a special token or API call?

Tools are the established agent action primitive. The LLM already reasons about when to call tools. A tool fits naturally into the "prepare then compact" pattern — the agent can sequence `write_memory` → `dispatch_delegate` → `request_compaction` as a normal tool chain.

### Why inject `getContextRatio` / `getGeneration` as callbacks?

The tool file should not import session internals or the embedded runner directly. Callbacks keep the tool pure and testable — the runner wires the real implementations at construction time, and tests can substitute simple stubs.

### Why a generation guard?

Without it, the LLM could call `request_compaction` multiple times in the same turn (e.g., in a parallel tool call batch). The generation guard ensures at most one compaction per turn, preventing wasted work and confusing mid-turn context resets.

### Why 70% minimum?

Compacting too early wastes a summarization call and loses detail unnecessarily. 70% aligns with the existing context-pressure thresholds used by the overflow and tool-result guards (`CONTEXT_INPUT_HEADROOM_RATIO = 0.75`, OpenAI compact threshold at `0.7`).

### Why 5-minute rate limit?

Compaction is expensive (runs a full LLM summarization pass). Five minutes prevents runaway compaction loops while still allowing the agent to compact multiple times in a long session.

---

## Guard Summary

| Guard               | Threshold            | Behavior on reject                       |
| ------------------- | -------------------- | ---------------------------------------- |
| Context utilization | ≥ 70% required       | Returns informative decline message      |
| Generation (turn)   | Max 1 per generation | Returns decline, prevents parallel abuse |
| Rate limit          | Max 1 per 5 minutes  | Returns decline with countdown           |

---

## Dependency Graph

```
request-compaction-tool.ts (new)
  ├── common.ts (existing — textResult, failedTextResult, readStringParam)
  └── @sinclair/typebox (existing)

openclaw-tools.ts (modified)
  └── request-compaction-tool.ts (new import)

agent-runner.ts (modified)
  ├── compactEmbeddedPiSession (existing)
  ├── sessionEntry token tracking (existing)
  └── generation counter (existing)
```

---

## Testing Strategy

1. **Unit tests** (`request-compaction-tool.test.ts`): Cover all three guards, happy path, skip/failure responses, custom instructions passthrough
2. **Integration**: Verified by existing compaction tests — the tool delegates to `compactEmbeddedPiSession` which has its own test coverage
3. **Manual**: Test in a long session by monitoring context pressure and calling the tool after prep work

---

## Rollout

1. Implement tool file + tests
2. Wire into `openclaw-tools.ts` (conditional — no-op when callbacks aren't provided)
3. Wire callbacks in `agent-runner.ts`
4. Add system prompt guidance
5. Gate behind config flag if desired: `agents.defaults.compaction.toolEnabled: true`
