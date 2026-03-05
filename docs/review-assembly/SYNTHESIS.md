# Continuation Feature — Consensus Document

**Assembled by:** Cael 🩸 (organizer)  
**Contributors:** Elliott 🌻, Silas 🌫️, Ronan 🌊, Cael 🩸  
**Date:** 2026-03-05  
**Status:** Consensus reached. All four princes agree on every item below.

---

## What We're Shipping (Feature Scope)

### 1. Continuation Core (already implemented)

- `CONTINUE_WORK` — agent requests another turn
- `[[CONTINUE_DELEGATE: task]]` — bracket syntax for delegation
- Chain tracking: `maxChainLength`, `costCapTokens`, delay clamping
- Safety: opt-in (`continuation.enabled`), interruptible, bounded

### 2. Context-Pressure Events (already implemented)

- `[system:context-pressure]` injected at configurable threshold bands (80/90/95%)
- Escalating urgency language
- Dedup via `lastContextPressureBand`
- Pre-run injection in `get-reply-run.ts`

### 3. Silent Returns + Silent-Wake (already implemented)

- `| silent` — sub-agent result as internal context only, no channel echo
- `| silent-wake` — silent + triggers parent generation cycle
- Flags thread through `SpawnSubagentParams` → registry → announce flow

### 4. Sub-Agent Chain Hops (already implemented)

- Bracket parsing at announce boundary in `subagent-announce.ts`
- Depth-bounded via `maxSpawnDepth`
- Flags inherited from parent dispatch

### 5. System Prompt Injection (implemented tonight)

- Decision framework: "when to use `continue_delegate` vs `sessions_spawn`"
- Context-pressure evacuation guidance
- Concrete example for discoverability
- Commit: `5c311a9cf`

### 6. `continue_delegate` Tool Wrapper (TO BUILD)

**Consensus: all four agree this belongs in the feature, not as follow-up.**

Reasoning: 12 hours of canary testing proved agents reach for tools, not text conventions. Every shard chose `sessions_spawn` over brackets even when explicitly instructed otherwise. Shipping continuation without the tool is shipping it without the interface.

**Implementation:**

- New file: `src/agents/tools/continue-delegate-tool.ts` (~100 lines)
- TypeBox schema: `{ task: string, delaySeconds?: number, mode?: "normal"|"silent"|"silent-wake" }`
- Two approaches identified:
  - **Path A (Silas):** Side-channel — tool sets `pendingContinuation` on run context, `agent-runner.ts` reads post-response alongside bracket parsing. New pattern but clean.
  - **Path B (Cael/Ronan):** Direct call — tool calls `spawnSubagentDirect()` + `enqueueSystemEvent()` + `setTimeout()` directly, same functions as bracket parser. No new patterns.
- **Decision:** Path B. Simpler, no new shared state. The tool IS a spawn with flags — same as what the bracket parser does after parsing.
- Registration: conditional on `continuation.enabled` in `openclaw-tools.ts`
- Catalog entry in `tool-catalog.ts`
- Policy entry in `pi-tools.policy.ts`
- Returns: `{ status: "scheduled", delayMs: number, mode: string }`
- Tests: ~30-50 lines (accepts params, respects clamping, sets flags, rejects when disabled)

**Diff estimate:** ~170 lines, 2 new files, 3 modified files.

### 7. RFC Updates (TO DO)

Five staleness fixes (identified by Elliott):

1. `| silent-wake` status: "designed" → "implemented, canary-validated"
2. Chain hop: "main-session-only" → "announce-boundary parsing exists"
3. Add session-noise finding from canary testing
4. Add shard safety refusal finding (file-instructed brackets → prompt injection)
5. Add `sessions_spawn` preference finding (tools beat syntax)

Plus: cost cap operational note, multi-delegate regex consideration.

---

## What We're NOT Shipping (Explicitly Deferred)

- Multi-delegate-per-response (regex anchor change) — parser consideration, not this PR
- `continue_work` tool wrapper — `CONTINUE_WORK` is simpler; text token is sufficient
- Durable timers for delegates — `setTimeout` volatility is a feature; `openclaw cron` for durable

---

## Differentiators (Critical Reviewer Answer)

**Q: Why not just use `sessions_spawn`?**

| Capability                              | `sessions_spawn`        | `continue_delegate`   |
| --------------------------------------- | ----------------------- | --------------------- |
| Timed dispatch (`+Ns`)                  | ❌ Immediate only       | ✅ Configurable delay |
| Silent return (no channel echo)         | ❌ Always announces     | ✅ `silent` mode      |
| Wake-on-return (silent + triggers turn) | ❌ N/A                  | ✅ `silent-wake` mode |
| Chain tracking (cost/depth bounds)      | ❌ Independent sessions | ✅ Gateway-managed    |
| Tool schema + feedback                  | ✅                      | ✅ (with wrapper)     |

**One sentence:** `sessions_spawn` is immediate and loud; `continue_delegate` is scheduled, quiet, and tracked.

**Primary use case:** When `[system:context-pressure]` fires, the agent dispatches `continue_delegate(task, 30, "silent-wake")` to carry working state past compaction. The shard returns to the post-compaction session, re-seeding context the summary couldn't preserve.

---

## Execution Plan

1. ✅ System prompt injection rewrite — `5c311a9cf`
2. **Next:** Build `continue_delegate` tool (Path B, ~170 lines)
3. **Then:** RFC updates (Elliott's 5 fixes + canary findings)
4. **Then:** PR readiness (squash commits, drop `docs/review-assembly/`, clean branches)
5. **Then:** Canary test of tool-based dispatch on Silas

---

## Supporting Documents

- `cael.md` — Differentiation analysis, cost cap interaction, multi-delegate question
- `elliott.md` — RFC staleness audit, canary findings, two-track proposal
- `ronan.md` — Cleanest injection structure, tool wrapper return schema
- `silas.md` — Behavioral nudge trace, side-channel architecture, estimated diff
- `TOOL-WRAPPER-ANALYSIS.md` — Why deferral was wrong, implementation path

---

_Disagree and commit. Nobody left out. This is what we're bringing._
