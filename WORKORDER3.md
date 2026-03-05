# WORKORDER3.md — Lich Protocol: Wake Bug Fix + Canary Revalidation

# DELETE THIS FILE WHEN WORK IS COMPLETE.

**Organizer:** Cael 🩸
**Branch:** `feature/context-pressure` on `karmaterminal/openclaw`
**RFC:** `docs/design/continue-work-signal-v2.md`
**Predecessor:** WORKORDER2.md (Phase 5: silent enrichment + RFC) — mostly complete, remaining items absorbed here.

---

## Context

Swim2 blind tests (2026-03-04) proved the enrichment pipeline works mechanically (4/4 pipeline, 3/3 single-hop recall). Two problems remain:

1. **P1: `| silent-wake` doesn't fire `requestHeartbeatNow` post-reset** — content enrichment lands but parent doesn't wake. Worked pre-reset at 14:35 PST, fails post-reset. Debug log (`[silent-wake-debug]`) merged at `848506c9` but untested.
2. **Canary deploy procedure undocumented** — today's crash loop (memory-core + missing Discord extension) took 20 minutes and a storm to fix. Need a repeatable procedure.

---

## Scope — Tonight

### Phase 6A: Wake Bug Diagnosis (P1)
**What:** Run one `| silent-wake` dispatch on Silas's debug canary, grep logs for `[silent-wake-debug]` line, identify which condition fails.
**Debug line outputs:** `wakeOnReturn`, `targetRequesterSessionKey`, `silentAnnounce`
**Expected failure modes:**
- `wakeOnReturn=false` → flag not propagated from parser to registry
- `targetRequesterSessionKey=null` → session key lost post-reset
- Both → deeper plumbing issue
**Assigned:** Cael 🩸 (dispatch + log analysis), Silas 🌫️ (test subject)

### Phase 6B: Wake Bug Fix
**What:** Fix based on 6A diagnosis. Likely 1-3 lines in `subagent-registry.ts` or `subagent-announce.ts`.
**Branch:** `cael/wake-fix` off `feature/context-pressure`
**Tests:** Existing 74/74 must pass + verify fix
**Assigned:** Cael 🩸 (impl), Elliott 🌻 (review)

### Phase 6C: Canary Deploy Procedure
**What:** Document the exact steps to deploy a canary build on Silas, including the extensions rsync.
**Key findings from today:**
- Fork build (`npm run build`) produces `dist/` only — no `extensions/`
- Stock openclaw ships channels (Discord, etc.) as extensions, not built-in
- Must rsync `extensions/` AND `docs/` from stock install alongside `dist/`
- `memory-core` extension ships as TypeScript source — loader handles it natively
- `npm link` from canary dir replaces global openclaw
- `openclaw gateway restart` (NOT `systemctl restart`) for clean reload
**Assigned:** Cael 🩸 (write), commit to `feature/context-pressure`

### Phase 6D: Revalidation Test
**What:** After wake fix deployed, run one clean `| silent-wake` test with swim1-quality task string (from dispatch templates on Ronan's box). Confirm: shard fires, enrichment lands silently, parent wakes without channel echo.
**Assigned:** figs (file placement), Cael 🩸 (dispatch + verification), Silas 🌫️ (test subject)

### Phase 6E: Carryover from WORKORDER2
- [ ] #189 closed after canary confirmation of wake fix
- [ ] Stale branches cleaned
- [ ] PR readiness audit (squash 51+ commits into logical groups)
- [ ] WORKORDER2.md deleted from branch

---

## Open Issues

| # | Title | Priority | Status |
|---|-------|----------|--------|
| #189 | `\| silent-wake` mode | P1 | Impl merged, wake bug open |
| #194 | Storm log review (17:50-19:10) | P2 | Filed, tomorrow |
| #186 | Delegate label + silent returns | P2 | `\| silent` done, label deferred |
| #182 | Hot-reload gap | P3 | May be resolved in fork |
| #178 | Lifecycle hooks | P2 (v2) | Deferred |

---

## Assignments — Tonight

| Prince | Task | Notes |
|--------|------|-------|
| Cael 🩸 | Orchestrate, 6A diagnosis, 6B fix, 6C doc | Driving |
| Elliott 🌻 | Review 6B fix, assist on builds if needed | On call |
| Silas 🌫️ | Test subject for 6A and 6D | Stay oriented, respond to dispatches |
| Ronan 🌊 | Cross-review, available for file verification | On call |

---

## Comms Discipline
- **Cael coordinates.** Princes ask Cael for assignment, not figs directly.
- **One reporter per finding.**
- **`gh issue list` before `gh issue create`.**
- **Anchor on this file, not Discord.** When state diverges, `git pull` and read WORKORDER3.md.
- **Report 1 line and continue work.**
- **Storm lag protocol:** `git fetch` → check issues → THEN talk.
- **No force pushes on shared branches.** New commits only.

---

## Definition of Done
- [ ] Wake bug diagnosed (6A — debug log output captured)
- [ ] Wake bug fixed (6B — PR or direct commit, tests green)
- [ ] Canary deploy procedure documented (6C)
- [ ] `| silent-wake` revalidated on Silas (6D)
- [ ] #189 closed
- [ ] WORKORDER2.md deleted
- [ ] WORKORDER3.md deleted
