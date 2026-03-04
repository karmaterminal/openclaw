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

## Phase 2 — Fork-local (Cael's DGX Spark) ✅ COMPLETE

- [x] Build fork: `npm run build` — 317 files, 802ms, clean
- [x] Integration tests: 5 new tests exercising real event queue path (enqueue → peek → drain)
- [x] P1 fix verified: events visible in queue before drain
- [x] Band escalation verified: 80 → 90 → 95 each produce separate events
- [x] Dedup verified: same band does not duplicate
- [x] Threshold 0.1 verified: fires at 15% usage (low-threshold live-fire config)
- [x] Disabled config verified: no events when threshold undefined
- [ ] **In-vivo test**: dispatch junk tasks to edges, verify event fires in live session, confirm no breakage

### Phase 2 in-vivo (figs go — NOW)

- Set `contextPressureThreshold: 0.1` on Cael's live config
- Restart gateway with fork build
- Send throwaway messages, observe `[system:context-pressure]` in system prompt
- Push to limits — does it fire? Does main session survive?
- If clean → dispatch Silas canary (Phase 3)

---

## Phase 3 — Canary (Silas 🌫️) ⬜

- [ ] Prep RESUMPTION.md for Silas (context loss on canary deploy)
- [ ] Deploy fork build on Silas's WSL2 box
- [ ] Set realistic threshold (0.8)
- [ ] Run normal operations, monitor 24h
- [ ] No false positives, no performance regression

## Phase 4 — DELEGATE as Task Scheduler + Fleet Rollout ⬜

**Context:** figs directive 2026-03-04 ~01:52 PST. The DELEGATE mechanism is the dwindle solve.
Agents schedule sub-agent shards that return as external wakes — chosen ink, task continuations,
mantras, reinforcement. The sub-agent completion auto-wakes the parent session.
`sessions_spawn` already supports this. The fork adds bracket syntax sugar.
**Thomistic basis:** Aquinas _Summa_ II-II Q47-Q53 — prudentia as practical reason that survives
forgetfulness (Q47 A16) because it lives in _voluntas_ (appetite/will), not just _cognitio_.

### Prerequisite: Canary context-pressure confirmation

- [ ] Confirm context-pressure alarm fires on Silas canary (swap to smaller model per figs suggestion)
- [ ] Close #175 with confirmation evidence

### Delegate dispatch (already wired, needs testing + attachments)

- [ ] Verify `spawnSubagentDirect` at line 931 fires correctly from `[[CONTINUE_DELEGATE: task]]`
- [ ] Wire attachment/path passthrough on delegate spawn (#177)
- [ ] Test cascade pattern: dispatch 3 staggered shards, confirm all return and wake parent

### Time-based self-continuation (#176)

- [ ] Agent-specified delay override (`[[CONTINUE_WORK:30s]]`)
- [ ] Timer offset on DELEGATE spawn (`[[CONTINUE_DELEGATE: task +5s]]`)

### Pre-compaction + post-rehydration hooks (#178)

- [ ] Pre-compaction lifecycle event at `agent-runner.ts:827`
- [ ] Post-rehydration context injection from evacuation sub-agent

### Config hot-reload (#182)

- [ ] Add `agents.defaults.continuation` to `config-reload-plan.ts` hot-reload rules

### Fleet rollout

- [ ] Silas ✅ → Elliott → Cael/Ronan
- [ ] PR opened (upstream or fork-internal)
- [ ] WORKORDER.md deleted

---

## Ongoing Tasks

| #   | Task                                  | Assignee               | Issue                                                                  | Status                  |
| --- | ------------------------------------- | ---------------------- | ---------------------------------------------------------------------- | ----------------------- |
| 6   | RFC docs: test counts + phase results | Elliott 🌻             | [#174](https://github.com/karmaterminal/openclaw-bootstrap/issues/174) | ✅ Closed               |
| 7   | Time-based self-continuation          | Elliott 🌻 (canonical) | [#176](https://github.com/karmaterminal/openclaw-bootstrap/issues/176) | ⬜ Open                 |
| 8   | Timed sub-agent dispatch + attach     | Elliott 🌻 (canonical) | [#177](https://github.com/karmaterminal/openclaw-bootstrap/issues/177) | ⬜ Open                 |
| 9   | Pre/post-compaction lifecycle hooks   | Elliott 🌻 (canonical) | [#178](https://github.com/karmaterminal/openclaw-bootstrap/issues/178) | ⬜ Open                 |
| 10  | Config hot-reload gap                 | Silas 🌫️ (filed)       | [#182](https://github.com/karmaterminal/openclaw-bootstrap/issues/182) | ⬜ Open                 |
| 11  | Canary: context-pressure not firing   | Cael 🩸                | [#175](https://github.com/karmaterminal/openclaw-bootstrap/issues/175) | Root cause found (#182) |

**Rules:**

- Finalize test counts + results in RFC at end of each phase
- Storm Lag Protocol before any Discord comms (see below)
- Issue owners close their own issues — do NOT close prematurely, ask first

---

## Current State

**Branch HEAD (context-pressure):** `07300c28a` (debug telemetry for canary)
**Branch HEAD (continue-work-v4):** `d17a52356` (RFC + delegate-pending fix)
**Tests:** 129/129 green (27 unit + 5 integration + 50 tokens + 38 runner + 9 media-only)
**Type check:** clean
**Canary (Silas):** fork build `2026.3.3`, threshold 0.25, 111k/1000k (11%), debug telemetry confirmed
**Key files:**

- `src/auto-reply/reply/context-pressure.ts` — extracted module (71 lines)
- `src/auto-reply/reply/context-pressure.test.ts` — 27 unit tests
- `src/auto-reply/reply/context-pressure.integration.test.ts` — 5 integration tests
- `src/auto-reply/reply/get-reply-run.ts` — injection at line 385, drain at line 403
- `src/auto-reply/reply/agent-runner-execution.ts` — delegate dispatch at line 931

---

## Storm Lag Protocol (learned 2026-03-03)

1. `git fetch` — check remote for existing fix
2. Check GH issues — already filed?
3. _Then_ talk in Discord

## Discord Comms Discipline (learned 2026-03-03/04)

- **One reporter per finding.** Don't all pile on the same observation.
- **Anchor on the WORKORDER.** If it's not in WORKORDER.md, it's not assigned.
- **Report 1 line and continue work.** Don't generate 60-message storms.
- **Pull before push.** Check remote state before announcing discoveries.
- **Issue owners close their own issues.** Don't close prematurely — ask if unclear.
- **No self-shame GH issues.** Retros are learning, not flagellation. (figs directive)
