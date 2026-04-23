# RFC §4.1 Trigger Taxonomy — Byte Review
SHA: 667ef9912bd
Date: 2026-04-23
Reviewer: ronan-rfc-4.1-byte

## Summary
NON-BLOCKER

All five triggers A–E match the RFC claims in type, owner, and implementation. The two-layer model is faithfully reflected. One nomenclature drift: code comments reference a "trigger F" for mid-turn pressure events that the RFC taxonomy does not define.

## Per-claim findings

### Trigger A (overflow)
- RFC claim: reactive automatic, platform, "existing 100% context trigger"
- Code evidence: `src/agents/pi-embedded-runner/run.ts:1032` — `if (contextOverflowError)` detects provider context-overflow errors. Calls `contextEngine.compact()` with `trigger: "overflow"` at `:1090+`. Retries up to `MAX_OVERFLOW_COMPACTION_ATTEMPTS`.
- Test evidence: `src/agents/pi-embedded-runner/run.overflow-compaction.test.ts:108` — "passes trigger=overflow when retrying compaction after context overflow"
- Verdict: **MATCH**

### Trigger B (timeout + high usage)
- RFC claim: reactive automatic, platform, "existing idle-timeout path; disabled by `idleTimeoutSeconds: 0`"
- Code evidence: `src/agents/pi-embedded-runner/run.ts:892-965` — after `timedOut`, computes `tokenUsedRatio` from prompt tokens (`:897`); if `> 0.65`, attempts compaction with `trigger: "timeout_recovery"` (`:965`).
- Disable gate: `src/agents/pi-embedded-runner/run/llm-idle-timeout.ts:29-31` — `if (raw === 0) { return 0; }` where `raw` reads from `agents.defaults.llm.idleTimeoutSeconds`. Config schema at `src/config/zod-schema.agent-defaults.ts:145` defines `idleTimeoutSeconds` as `z.number().int().nonnegative().optional()` with description "Set to 0 to disable."
- Test evidence: `src/agents/pi-embedded-runner/run.timeout-triggered-compaction.test.ts:39` — "attempts compaction when LLM times out with high prompt token usage (>65%)"
- Verdict: **MATCH**

### Trigger C (`/compact`)
- RFC claim: manual, user, "existing slash command"
- Code evidence: `src/auto-reply/reply/commands-compact.ts:78-81` — `handleCompactCommand` checks `commandBodyNormalized === "/compact"`. Calls `compactEmbeddedPiSession()` with `trigger: "manual"` (`:153`).
- Verdict: **MATCH**

### Trigger D (context-pressure)
- RFC claim: proactive advisory, continuation system, "`checkContextPressure()` in the reply pipeline"
- Code evidence: `src/auto-reply/reply/context-pressure.ts:29` — `export function checkContextPressure(params)` computes banded thresholds (configurable first band, 90%, 95%), dedup via `lastContextPressureBand`, and fires `[system:context-pressure]` via `enqueueSystemEvent` (`:84`).
- Call site: `src/auto-reply/reply/agent-runner.ts:1583` — `const pressureResult = checkContextPressure({...})` in the reply pipeline, pre-run injection as the RFC specifies.
- RFC §4.2 detail match: the precondition that `totalTokens` and `contextWindow` must both be present is implemented at `:38-47` (guards for `null`, `<=0`, `totalTokensFresh === false`).
- Verdict: **MATCH**

### Trigger E (`request_compaction()`)
- RFC claim: initiated volitional, agent, "new tool-driven trigger"
- Code evidence: `src/agents/tools/request-compaction-tool.ts:104` — tool registered as `name: "request_compaction"`. Guards: context >= 70% (`:14`), rate limit 5 min (`:17`), dedup via `pendingCompactionSessions` (`:44`). Fire-and-forget async compaction (`:189`).
- Comment at `src/agents/pi-embedded-runner/run/params.ts:81` — "Closures for request_compaction tool (Trigger E)" confirms the naming.
- Verdict: **MATCH**

### Two-layer model
- RFC claim: Initiated = {context-pressure alerts, `continue_delegate()` post-compaction, `request_compaction()`}. Obligatory = {overflow compaction, `memoryFlush`, `postCompactionSections`}.
- Initiated layer evidence:
  - Context-pressure alerts: `context-pressure.ts` (advisory, agent-elective — the agent decides whether to act on the event)
  - `continue_delegate()` post-compaction: `src/agents/tools/continue-delegate-tool.ts:65` registers `name: "continue_delegate"` with `"post-compaction"` mode (`:37`). Stages silent-wake delegates that fire after compaction — agent-directed.
  - `request_compaction()`: see Trigger E above — agent-initiated.
- Obligatory layer evidence:
  - Overflow compaction: Trigger A — platform-driven, fires regardless of agent intent.
  - `memoryFlush`: `src/auto-reply/reply/memory-flush.ts:60` — `shouldRunMemoryFlush()` gates on token threshold and compaction count. Platform-scheduled pre-compaction housekeeping. Config at `agents.defaults.compaction.memoryFlush`.
  - `postCompactionSections`: `src/auto-reply/reply/post-compaction-context.ts:11` — `DEFAULT_POST_COMPACTION_SECTIONS = ["Session Startup", "Red Lines"]`. Platform-driven re-injection after compaction. Config at `agents.defaults.compaction.postCompactionSections`.
- Verdict: **MATCH** — initiated triggers are agent-elective; obligatory triggers are platform-driven and mechanical.

### Trigger F (absence check)
- RFC claim: §4.1 defines exactly five triggers A–E. No trigger F in the taxonomy.
- Code evidence: Three code locations reference "trigger F" as a label for mid-turn pressure-fire events:
  - `src/agents/pi-embedded-runner/run.ts:1081` — comment: `// docs/design/continue-work-signal-v2.md (trigger F — overflow recovery).`
  - `src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts:96` — comment: `// pressure triggers (trigger F, per RFC §4.1) find the in-turn event`
  - `src/agents/pi-embedded-runner/run.timeout-triggered-compaction.test.ts:105` — comment: `// so operators grepping for mid-turn pressure triggers (trigger F,`
- These label mid-turn `[context-pressure:fire]` events — emitted during overflow recovery (`:1083`) and timeout recovery (`:918`) — as "trigger F". These are pressure-fire diagnostic anchors for mid-turn compaction events that bypass the pre-run `checkContextPressure()`.
- The RFC §4.1 table does NOT define a trigger F. The code comments cite "RFC §4.1" for a label that the RFC never assigns.
- Verdict: **DRIFT** — code invented a "trigger F" nomenclature for mid-turn pressure diagnostics that the RFC hasn't absorbed. Not a behavioral mismatch (these are log/event labels, not a new trigger pathway), but a spec-vs-code naming inconsistency that could confuse operators or auditors grepping for the RFC taxonomy.

## Blocker-class findings
None.

## Non-blocker findings
1. **Trigger F nomenclature drift.** Code comments at `run.ts:1081`, `run.overflow-compaction.loop.test.ts:96`, and `run.timeout-triggered-compaction.test.ts:105` reference "trigger F" and cite "RFC §4.1", but the RFC defines only A–E. Recommend either:
   - (a) Add trigger F to the RFC §4.1 table as a sixth entry (mid-turn pressure-fire diagnostic, reactive automatic, platform), or
   - (b) Remove the "trigger F" label from code comments and use "mid-turn pressure event (triggers A/B)" instead, since these events are diagnostic companions to the existing overflow/timeout triggers rather than a distinct trigger category.
