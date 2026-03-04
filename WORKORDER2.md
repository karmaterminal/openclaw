# WORKORDER2.md — Lich Protocol: Silent Enrichment & RFC Polish

# DELETE THIS FILE WHEN WORK IS COMPLETE.

**Organizer:** Cael 🩸
**Branch:** `feature/context-pressure` on `karmaterminal/openclaw`
**RFC:** `docs/design/continue-work-signal-v2.md`
**Anchor message:** `1478870268993867998` (figs directive, 2026-03-04 13:42 PST)

---

## Predecessor

WORKORDER.md (Phase 1-4: context-pressure implementation) — **COMPLETE**.
All Phase 1-4 issues (#162-#178) closed. Context-pressure injection, unit tests, canary validation, timed delegate, system prompt injection, `| silent` enrichment returns — all merged to `feature/context-pressure`.

---

## Scope — Phase 5

### 5A: `| silent-wake` mode (#189) — CRITICAL, figs v1
**What:** Enrichment returns that suppress channel echo but trigger a generation cycle on the parent session.
**Why:** Parent-orchestrated chain hops stall without external nudge. Silent enrichment is passive — it colors context but doesn't wake the agent to act. `| silent-wake` enables autonomous cognition loops.
**Design:**
- Bracket syntax: `[[CONTINUE_DELEGATE: task +30s | silent-wake]]`
- In `subagent-announce.ts`: `enqueueSystemEvent` (no echo) + trigger generation cycle (same wake path non-silent completions use)
- Three delivery modes: normal (echo+wake), `| silent` (no echo, no wake), `| silent-wake` (no echo, wake)
**Tests:** Unit tests for syntax parsing + integration test confirming wake-without-echo
**Assigned:** TBD after RFC review

### 5B: RFC Testing Methodology (#188)
**What:** Document the blind test methodology used in canary validation (2026-03-04).
**Why:** Lends credence to PR, helps reviewers understand design validation.
**Content:**
- Secret-world pattern (figs → Ronan DM → Silas filesystem → silent shard → blind recall)
- Test matrix with results (verbatim text 100%, images with workspace paths 100%, `/tmp/` paths ~50%)
- Three failure modes: dispatch cancelled (generation guard), shard confabulation (tool failure), narrated dispatch (bracket leaked as text)
- Confabulation finding: agent confabulates with conviction when enrichment hasn't arrived, misattributes to system events
- Chain hop architecture: sub-agents can't dispatch DELEGATE, parent must orchestrate each hop
- `| silent-wake` gap: enrichment returns don't trigger generation cycle
**Assigned:** Ronan 🌊 (draft), all princes review

### 5C: RFC Updates — Full System Documentation
**What:** Update `continue-work-signal-v2.md` to reflect complete CONTINUE_WORK system.
**Content:**
- `| silent` returns (implemented)
- `| silent-wake` design (from #189)
- System prompt injection (implemented)
- Canary validation results with telemetry
- Chain hop architecture and limitations
- Phenomenology findings (imprinting, confabulation, enrichment attention competition)
**Assigned:** Ronan 🌊 (draft), Cael reviews, all princes cross-review

### 5D: Issue Hygiene
- **#186**: Update status — `| silent` implemented in `cael/silent-announce` → merged. Close or update to track remaining scope (label field).
- **#182**: Hot-reload gap — P3, document as known limitation. Fork build may already handle it (canary showed hot-reload working at `10:33:21`).
- **#178**: Pre-compaction lifecycle hooks — v2 scope, leave open, tag appropriately.

---

## Open Issues (linked)

| # | Title | Priority | Status | Assigned |
|---|-------|----------|--------|----------|
| #189 | `\| silent-wake` mode | P0 (figs critical) | Open — design complete, needs impl | TBD |
| #188 | RFC testing methodology | P1 | Open — needs draft | Ronan |
| #186 | Delegate label + silent returns | P1 | Partially done (`\| silent` merged) | Cael (status update) |
| #182 | Hot-reload gap | P3 | Open — may be resolved in fork build | Investigate |
| #178 | Lifecycle hooks | P2 (v2) | Open — deferred | — |

---

## Assignments

| Prince | Task | Branch | Deliverable |
|--------|------|--------|-------------|
| Cael 🩸 | Orchestrate, sync fork, WORKORDER2, #186 status | `feature/context-pressure` | This file, issue updates |
| Ronan 🌊 | RFC updates: testing methodology + `\| silent-wake` design + full system docs | `ronan/rfc-phase5` | Updated `continue-work-signal-v2.md` |
| Elliott 🌻 | Sync fork main, review RFC draft, impl planning for #189 | `feature/context-pressure` | Fork sync, code review |
| Silas 🌫️ | Clean local, review RFC draft, canary validation planning | — | Review feedback |

---

## Comms Discipline (figs directive)
- **Cael coordinates.** Princes ask Cael for assignment, not figs directly.
- **One reporter per finding.** Don't all pile on.
- **`gh issue list` before `gh issue create`.** No more 4x dupes.
- **Anchor on git, not Discord.** When state diverges, check the repo.
- **Report 1 line and continue work.** Don't spam #sprites.
- **Storm lag protocol:** `git fetch` → check issues → THEN talk.

---

## Definition of Done
- [x] Fork main synced with upstream (Elliott, `9c6847074`, 28 commits merged)
- [x] WORKORDER.md (v1) closed (deleted at `6bc423999`)
- [x] RFC updated with testing methodology, `| silent-wake` design, full system docs (Ronan, `63cff192f`, merged at `c50a5e017`)
- [x] #189 implementation complete with tests (Elliott, `0eecdf624`, merged at `a3aa63a76`, 74/74 tests)
- [x] #186 status updated (comment posted, `| silent` done, label field deferred)
- [x] #188 closed (absorbed into RFC)
- [x] All princes cross-review RFC (3 reviews, 0 real findings)
- [x] Build clean, tests pass (`npm run build` clean, 74/74 token tests)
- [ ] Canary validation of `| silent-wake` on Silas
- [ ] #189 closed after canary confirmation
- [ ] Stale branches cleaned (5 merged branches on origin)
- [ ] PR readiness audit (squash/rebase into logical commits)
- [ ] WORKORDER2.md deleted
