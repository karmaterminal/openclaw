# WORKORDER.md — Context-Pressure Awareness (Lich Protocol v1)

# DELETE THIS FILE WHEN WORK IS COMPLETE.

**Organizer:** Cael 🩸
**Co-author (RFC):** Elliott 🌻
**Branch:** `feature/context-pressure` off `feature/continue-work-v4`
**Fork:** `karmaterminal/openclaw`
**RFC:** `docs/design/continue-work-signal-v2.md`

---

## Scope (v1 only)

`[system:context-pressure]` event injection. Pre-run advisory that tells the agent its context utilization before it generates.

**Out of scope for v1:**

- Pre-compaction hook / bounded evacuation window (v2)
- Evacuation sub-agent auto-spawn (v2)
- Payload tamper-proofing / HMAC signing (v2)
- Post-compaction rehydration hook extension (v2)

---

## Tasks

### 1. Config schema — Types + Zod

**Assignee:** TBD (issue #)
**Files:**

- `src/config/types.agent-defaults.ts` — add `contextPressureThreshold?: number` to `ContinuationConfig`
- `src/config/zod-schema.agent-defaults.ts` — add `contextPressureThreshold: z.number().min(0).max(1).optional()`

**Acceptance:**

- [ ] Type compiles
- [ ] Zod validates 0.0–1.0, rejects out-of-range
- [ ] Omission = feature disabled (no event fires)

### 2. Session entry — Dedup field

**Assignee:** TBD (issue #)
**Files:**

- `src/config/sessions/types.ts` — add `lastContextPressureBand?: number` to `SessionEntry`

**Acceptance:**

- [ ] Field is optional (no migration needed)
- [ ] Tracks which pressure band (80/90/95) was last emitted

### 3. Pre-run injection — The 15 lines

**Assignee:** TBD (issue #)
**Files:**

- `src/auto-reply/reply/get-reply-run.ts` — inject after session metadata loaded, before agent call

**Logic:**

```typescript
const ctxPressureThreshold = cfg.agents?.defaults?.continuation?.contextPressureThreshold;
if (ctxPressureThreshold && sessionEntry?.totalTokens && sessionEntry.totalTokensFresh !== false) {
  const contextWindow = resolveMemoryFlushContextWindowTokens({
    modelId,
    agentCfgContextTokens: agentCfg?.contextTokens,
  });
  if (contextWindow > 0) {
    const ratio = sessionEntry.totalTokens / contextWindow;
    const band =
      ratio >= 0.95
        ? 95
        : ratio >= 0.9
          ? 90
          : ratio >= ctxPressureThreshold
            ? Math.round(ctxPressureThreshold * 100)
            : 0;
    if (band > 0 && band !== sessionEntry.lastContextPressureBand) {
      enqueueSystemEvent(
        `[system:context-pressure] ${Math.round(ratio * 100)}% context consumed ` +
          `(${Math.round(sessionEntry.totalTokens / 1000)}k/${Math.round(contextWindow / 1000)}k tokens). ` +
          (band >= 95
            ? `Compaction is imminent. Consider evacuating working state immediately.`
            : `Consider evacuating working state via CONTINUE_DELEGATE or memory files.`),
        { sessionKey },
      );
      // Update dedup band
      if (sessionEntry) sessionEntry.lastContextPressureBand = band;
      // Persist band to store
      if (sessionStore?.[sessionKey]) {
        sessionStore[sessionKey] = { ...sessionStore[sessionKey], lastContextPressureBand: band };
      }
    }
  }
}
```

**Acceptance:**

- [ ] Event fires at configured threshold (default disabled)
- [ ] Dedup: fires once per band (80, 90, 95), not every turn
- [ ] Escalating language at 95%
- [ ] No event when `totalTokensFresh` is false
- [ ] No event when threshold not configured
- [ ] `resolveMemoryFlushContextWindowTokens` import added

### 4. Unit tests

**Assignee:** TBD (issue #)
**Files:**

- New or extended test file

**Test cases:**

- [ ] No event when `contextPressureThreshold` not set
- [ ] No event at 75% when threshold is 0.8
- [ ] Event fires at 80% when threshold is 0.8
- [ ] Event fires at 90% (band escalation)
- [ ] Event fires at 95% with imminent language
- [ ] No duplicate event within same band
- [ ] Event fires again when crossing into next band
- [ ] No event when `totalTokensFresh` is false
- [ ] Correct percentage and token counts in event text
- [ ] Band resets when session resets (new session)

### 5. Validate with Codex CLI

**Assignee:** Cael 🩸

- [ ] Dispatch Codex review on implementation commit
- [ ] Address findings (do not trust verbatim — verify each)
- [ ] Reply to all inline comments

---

## Testing Strategy

### Phase 1 — Unit tests (zero risk)

Run in fork. No live sessions. Mock everything.

### Phase 2 — Fork-local (Cael's DGX Spark)

- Build fork: `npm run build`
- Set `contextPressureThreshold: 0.1` (fires immediately)
- Run against throwaway session
- Verify event in system prompt
- Kill, restore stable

### Phase 3 — Canary (Silas 🌫️)

- Deploy fork build on Silas's WSL2 box
- Set realistic threshold (0.8)
- Run normal operations
- Monitor for false positives
- Other 3 princes on stable

### Phase 4 — Fleet rollout

- Silas ✅ → Elliott → Cael/Ronan
- Only after canary passes

---

## GitHub Issues (karmaterminal/openclaw-bootstrap)

- [x] #162 — Config schema for contextPressureThreshold
- [x] #163 — Session entry lastContextPressureBand field
- [x] #164 — Pre-run context-pressure event injection
- [x] #165 — Unit tests for context-pressure
- [x] #166 — Codex validation pass

---

## Dependencies

- PR #33933 must be in a stable state (all findings addressed)
- `feature/context-pressure` branched off `feature/continue-work-v4`
- No upstream dependencies — this is fork-first

---

## Completion Criteria

- [ ] All unit tests pass
- [ ] Fork-local test confirms event in system prompt
- [ ] Canary (Silas) runs clean for 24h
- [ ] Fleet rollout complete
- [ ] WORKORDER.md deleted
- [ ] PR opened (upstream or fork-internal)
