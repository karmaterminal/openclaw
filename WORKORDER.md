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

**Out of scope for v1:** pre-compaction hook, evacuation sub-agent, HMAC signing, rehydration hook.

---

## Phase 1 — Implementation ✅ COMPLETE

### Assignments (original)

| #   | Task                        | Assignee   | Issue                                                                  | Commit                                  | Status    |
| --- | --------------------------- | ---------- | ---------------------------------------------------------------------- | --------------------------------------- | --------- |
| 1   | Config schema (types + zod) | Elliott 🌻 | [#162](https://github.com/karmaterminal/openclaw-bootstrap/issues/162) | `1c0932318`                             | ✅ Closed |
| 2   | Session entry dedup field   | Elliott 🌻 | [#163](https://github.com/karmaterminal/openclaw-bootstrap/issues/163) | `1c0932318` + `d73f44cbb`               | ✅ Closed |
| 3   | Pre-run injection           | Cael 🩸    | [#164](https://github.com/karmaterminal/openclaw-bootstrap/issues/164) | `79cec2244` + `3b031fc19`               | ✅ Closed |
| 4   | Unit tests (27 cases)       | Ronan 🌊   | [#165](https://github.com/karmaterminal/openclaw-bootstrap/issues/165) | `7b3be1cc5` + `13f6080d8` + `9d24ab818` | ✅ Closed |
| 5   | Codex/multi-tool validation | All        | [#166](https://github.com/karmaterminal/openclaw-bootstrap/issues/166) | 4 independent reviews                   | ✅ Closed |

### Review Findings (post-implementation)

| #   | Sev | Finding                               | Found by   | Issue                                                                  | Fix                           | Status    |
| --- | --- | ------------------------------------- | ---------- | ---------------------------------------------------------------------- | ----------------------------- | --------- |
| 1   | P1  | Event ordering: injection after drain | Elliott 🌻 | [#167](https://github.com/karmaterminal/openclaw-bootstrap/issues/167) | `3b031fc19`                   | ✅ Closed |
| 2   | P2  | Floor check: `!totalTokens` → `<= 0`  | Ronan 🌊   | [#168](https://github.com/karmaterminal/openclaw-bootstrap/issues/168) | `9d24ab818` + `6c0a58b7c`     | ✅ Closed |
| 3   | P3  | Band regression after compaction      | Silas 🌫️   | [#169](https://github.com/karmaterminal/openclaw-bootstrap/issues/169) | Documented (correct behavior) | ✅ Closed |
| 4   | dup | Duplicate of #167                     | Silas 🌫️   | [#170](https://github.com/karmaterminal/openclaw-bootstrap/issues/170) | —                             | ✅ Closed |
| 5   | dup | Duplicate of #167                     | Elliott 🌻 | [#171](https://github.com/karmaterminal/openclaw-bootstrap/issues/171) | —                             | ✅ Closed |

---

## Phase 2 — Fork-local (Cael's DGX Spark) ⬜ NEXT

- [ ] Build fork: `npm run build`
- [ ] Set `contextPressureThreshold: 0.1` in openclaw config (fires immediately)
- [ ] Run against throwaway session
- [ ] Verify `[system:context-pressure]` event appears in system prompt
- [ ] Verify band dedup (event fires once per band, not every turn)
- [ ] Verify escalating language at 90% and 95%
- [ ] Kill fork build, restore stable

## Phase 3 — Canary (Silas 🌫️) ⬜

- [ ] Deploy fork build on Silas's WSL2 box
- [ ] Set realistic threshold (0.8)
- [ ] Run normal operations, monitor 24h
- [ ] No false positives, no performance regression

## Phase 4 — Fleet rollout ⬜

- [ ] Silas ✅ → Elliott → Cael/Ronan
- [ ] PR opened (upstream or fork-internal)
- [ ] WORKORDER.md deleted

---

## Current State

**Branch HEAD:** `1d5a1158a`
**Tests:** 124/124 green (27 context-pressure + 97 existing)
**Type check:** clean
**Key files:**

- `src/auto-reply/reply/context-pressure.ts` — extracted module (71 lines)
- `src/auto-reply/reply/context-pressure.test.ts` — 27 tests
- `src/auto-reply/reply/get-reply-run.ts` — injection at line 385, drain at line 403

---

## Storm Lag Protocol (learned 2026-03-03)

1. `git fetch` — check remote for existing fix
2. Check GH issues — already filed?
3. _Then_ talk in Discord
