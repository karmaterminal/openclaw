# Continuation Feature — Consensus Document

**Assembled by:** Cael 🩸 (organizer)  
**Contributors:** Elliott 🌻, Silas 🌫️, Ronan 🌊, Cael 🩸  
**Date:** 2026-03-05  
**Status:** Consensus reached + figs review feedback incorporated.

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
- **⚠️ Needs clean end-to-end demo** — we have mechanical validation but figs hasn't seen a witnessed dispatch → silent return → wake → agent acts → visible proof cycle. Adding to execution plan.

### 4. Sub-Agent Chain Hops (already implemented)

- Bracket parsing at announce boundary in `subagent-announce.ts`
- Depth-bounded via `maxSpawnDepth`
- Flags inherited from parent dispatch
- **Note:** This means cron-spawned sessions (which ARE main sessions) get the full continuation system, including bracket parsing. A cron job can dispatch silent enrichment delegates.

### 5. System Prompt Injection (implemented tonight)

- Decision framework: "when to use `continue_delegate` vs `sessions_spawn`"
- Context-pressure evacuation guidance
- Concrete example for discoverability
- Commit: `5c311a9cf`
- **⚠️ Not yet deployed to canary** — Silas canary is still on `92e346de1`. Needs canary rebuild.

### 6. `continue_delegate` Tool Wrapper (TO BUILD)

**Consensus: all four agree this belongs in the feature, not as follow-up.**

Reasoning: 12 hours of canary testing proved agents reach for tools, not text conventions. Every shard chose `sessions_spawn` over brackets even when explicitly instructed otherwise. Shipping continuation without the tool is shipping it without the interface.

**Implementation — REVISED to Path A (full parity):**

figs directive: "Ship complete. Turn key and decent, not a toy."

- **Path A (chosen):** Side-channel — tool sets `pendingContinuationDelegate` on run context, `agent-runner.ts` reads post-response alongside bracket parsing. Full chain tracking (cost caps, depth limits) applies. Both paths (bracket + tool) converge at the same dispatch point.
- **Why not Path B:** Path B (direct `spawnSubagentDirect` call) skips chain tracking. Each tool dispatch would be a standalone spawn — no cost cap enforcement, no depth limits. That's a toy, not a feature.
- New file: `src/agents/tools/continue-delegate-tool.ts` (~100 lines)
- TypeBox schema: `{ task: string, delaySeconds?: number, mode?: "normal"|"silent"|"silent-wake" }`
- Run context carries: `pendingContinuationDelegate?: { task, delayMs, silent, silentWake }`
- `agent-runner.ts` post-run: check `pendingContinuationDelegate` alongside `parseContinuationSignal()` — tool signal takes priority if both present
- Registration: conditional on `continuation.enabled` in `openclaw-tools.ts`
- Catalog entry in `tool-catalog.ts`
- Policy entry in `pi-tools.policy.ts`
- Returns: `{ status: "scheduled", delayMs: number, mode: string, chainTurn: number }`
- Tests: ~40-50 lines (accepts params, respects clamping, sets flags, rejects when disabled, chain tracking applies)
- **Bonus:** Tool calls have no single-per-response limit. Agent can call `continue_delegate()` 5 times in one turn — fires 5 arrows without CONTINUE_WORK chaining. Solves the multi-delegate problem that brackets can't.

**Diff estimate:** ~200 lines, 2 new files, 4 modified files.

### 7. RFC Updates (TO DO)

Five staleness fixes (identified by Elliott):

1. `| silent-wake` status: "designed" → "implemented, canary-validated"
2. Chain hop: update RFC language to reflect announce-boundary parsing (#196). **Clarification:** This is an RFC text update — the code change already landed. Cron-spawned sessions are main sessions and get the full continuation system. The old "main-session-only" wording was about `pi-embedded-runner` (sub-agent runner) not having the parser, which #196 fixed at the announce boundary.
3. Add session-noise finding from canary testing
4. Add shard safety refusal finding (file-instructed brackets → prompt injection)
5. Add `sessions_spawn` preference finding (tools beat syntax)

Plus: cost cap operational note, multi-delegate regex consideration, tool wrapper documentation.

---

## What We're NOT Shipping (Explicitly Deferred)

- **Multi-delegate-per-response (regex anchor change):** The bracket parser only matches one `[[CONTINUE_DELEGATE:]]` per response (end-anchored regex). To fire 5 arrows via brackets, you'd need 5 CONTINUE_WORK turns (accumulating chain cost). **The tool wrapper solves this** — 5 `continue_delegate()` calls in one turn, no regex limitation. So the regex change is truly deferred, not blocking.
- **`continue_work` tool wrapper:** `CONTINUE_WORK` is simpler; text token is sufficient.
- **Durable timers for delegates:** `setTimeout` volatility is a feature — restart = clean slate. Agents use `openclaw cron` directly for durable scheduling. Cron grants a new turn (it's an external event). An agent could cron a task that uses `continue_delegate` on wake — that's the durable path.

---

## Differentiators (Critical Reviewer Answer)

**Q: Why not just use `sessions_spawn`?**

| Capability                              | `sessions_spawn`        | `continue_delegate`      |
| --------------------------------------- | ----------------------- | ------------------------ |
| Timed dispatch (`+Ns`)                  | ❌ Immediate only       | ✅ Configurable delay    |
| Silent return (no channel echo)         | ❌ Always announces     | ✅ `silent` mode         |
| Wake-on-return (silent + triggers turn) | ❌ N/A                  | ✅ `silent-wake` mode    |
| Chain tracking (cost/depth bounds)      | ❌ Independent sessions | ✅ Gateway-managed       |
| Tool schema + feedback                  | ✅                      | ✅                       |
| Multiple dispatches per turn            | ✅                      | ✅ (tool), ❌ (brackets) |

**One sentence:** `sessions_spawn` is immediate and loud; `continue_delegate` is scheduled, quiet, and tracked.

**Primary use case:** When `[system:context-pressure]` fires, the agent dispatches `continue_delegate(task, 30, "silent-wake")` to carry working state past compaction. The shard returns to the post-compaction session, re-seeding context the summary couldn't preserve.

**Secondary use cases:**

- Background enrichment: dispatch research that returns silently, coloring future responses
- Self-scheduled work: check CI, follow up on a task, poll after delay
- Multi-arrow fan-out: 5 `continue_delegate()` calls in one turn, each reading a different section

---

## Execution Plan (REVISED)

1. ✅ System prompt injection rewrite — `5c311a9cf`
2. **Next:** Build `continue_delegate` tool — Path A, full chain tracking (~200 lines)
3. **Then:** Deploy canary with new injection + tool to Silas
4. **Then:** **Clean `| silent-wake` demo** — witnessed end-to-end: dispatch → silent return → wake → agent acts on enrichment → figs sees proof
5. **Then:** RFC updates (Elliott's 5 fixes + canary findings + tool wrapper docs)
6. **Then:** PR readiness (squash commits, drop `docs/review-assembly/`, clean branches)

---

## Supporting Documents

- `cael.md` — Differentiation analysis, cost cap interaction, multi-delegate question
- `elliott.md` — RFC staleness audit, canary findings, two-track proposal
- `ronan.md` — Cleanest injection structure, tool wrapper return schema
- `silas.md` — Behavioral nudge trace, side-channel architecture, estimated diff
- `TOOL-WRAPPER-ANALYSIS.md` — Why deferral was wrong, implementation path

---

_Disagree and commit. Nobody left out. This is what we're bringing._
_Updated after figs review: Path A (full parity), silent-wake demo required, multi-delegate via tool noted._
