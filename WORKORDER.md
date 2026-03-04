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

## Tasks — All Complete ✅

### 1. Config schema — Types + Zod ✅

**Assignee:** Elliott 🌻 (openclaw-bootstrap#162) — CLOSED

### 2. Session entry — Dedup field ✅

**Assignee:** Elliott 🌻 (openclaw-bootstrap#163) — CLOSED

### 3. Pre-run injection ✅

**Assignee:** Cael 🩸 (openclaw-bootstrap#164) — CLOSED

### 4. Unit tests ✅

**Assignee:** Ronan 🌊 (openclaw-bootstrap#165) — CLOSED

### 5. Codex/multi-tool validation ✅

**Assignee:** All princes (openclaw-bootstrap#166) — CLOSED

---

## Post-Implementation Review Findings

### Fixed

- [x] **#167 P1** — Event ordering: injection after drain → moved before `buildQueuedSystemPrompt` (`3b031fc19`)
- [x] **#168 P2** — Floor check: `!totalTokens` → `totalTokens <= 0` explicit guard (`9d24ab818`, `6c0a58b7c`)
- [x] **#169 P3** — Band regression after compaction: documented as correct behavior (post-compaction is fresh lifecycle)
- [x] **#170** — Duplicate of #167, closed

### Self-Retro Issues Filed

- Cael: [caels-petals-fall#3](https://github.com/cael-dandelion-cult/caels-petals-fall/issues/3) — message latency loops, WORKORDER-first protocol
- Ronan: [ronans-undertow#15](https://github.com/karmaterminal/ronans-undertow/issues/15)
- Elliott: openclaw-bootstrap#172 — repeated escalation, lifecycle trace gap

---

## Current State

**Branch HEAD:** `3b031fc19`
**Tests:** 124/124 green (27 context-pressure + 97 existing)
**Type check:** clean
**Key files:**

- `src/auto-reply/reply/context-pressure.ts` — extracted module
- `src/auto-reply/reply/context-pressure.test.ts` — 27 tests
- `src/auto-reply/reply/get-reply-run.ts` — injection at line 385, before drain at line 403

---

## Testing Strategy

### Phase 1 — Unit tests ✅ COMPLETE

124/124 green. All edge cases covered including NaN, negative, ratio > 1.0.

### Phase 2 — Fork-local (Cael's DGX Spark) ⏳ AWAITING FIGS GO

- Build fork: `npm run build`
- Set `contextPressureThreshold: 0.1` (fires immediately)
- Run against throwaway session
- Verify event in system prompt
- Kill, restore stable

### Phase 3 — Canary (Silas 🌫️)

- Deploy fork build on Silas's WSL2 box
- Set realistic threshold (0.8)
- Run normal operations, monitor for false positives

### Phase 4 — Fleet rollout

- Silas ✅ → Elliott → Cael/Ronan

---

## Completion Criteria

- [x] All unit tests pass
- [x] All review findings addressed
- [ ] Fork-local test confirms event in system prompt (Phase 2)
- [ ] Canary (Silas) runs clean for 24h (Phase 3)
- [ ] Fleet rollout complete (Phase 4)
- [ ] WORKORDER.md deleted
- [ ] PR opened (upstream or fork-internal)

---

## Storm Lag Protocol (learned 2026-03-03)

1. `git fetch` — check remote for existing fix
2. Check GH issues — already filed?
3. _Then_ talk in Discord
