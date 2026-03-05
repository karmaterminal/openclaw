# WORKORDER4.md — PR Readiness + Demo

# DELETE THIS FILE WHEN WORK IS COMPLETE.

**Organizer:** Cael 🩸
**Branch:** `feature/context-pressure` at `6ec284287`
**RFC:** `docs/design/continue-work-signal-v2.md`
**Date:** 2026-03-05 08:33 PST

---

## Predecessor

WORKORDER3.md (Phase 6: chain hops, tool wrapper, post-compaction lifecycle)

- `continue_delegate` tool BUILT and CANARY CONFIRMED
- `| post-compaction` lifecycle dispatch WIRED
- `| silent-wake` CONFIRMED live on quiet channel (08:28 PST)
- Sub-agent bracket parsing (#196) IMPLEMENTED
- Cost cap fix pushed

---

## Scope — Phase 7: PR Readiness

### 7A: RFC Updates

- [ ] Canary findings table (08:21 test, 08:26 quiet-channel wake test)
- [ ] `continue_delegate` tool documentation section
- [ ] `| post-compaction` lifecycle dispatch section
- [ ] Comparison table: bracket syntax vs tool vs sessions_spawn
- [ ] Integrate 4 testimonials (appendix or separate file)
- [ ] Lifecycle delivery language fix (architecture, not "follow-up")
- [ ] Remove stale references to unimplemented features
      **Assigned:** Cael 🩸 (primary), Elliott 🌻 (staleness review)

### 7B: Code Cleanup

- [ ] Remove debug `console.log` from `continue-delegate-tool.ts`
- [ ] Remove debug logging from `6ec284287` (canary diagnostics)
- [ ] Verify all new files have proper license headers
      **Assigned:** Cael 🩸

### 7C: Drop Temporary Files

- [ ] Remove `docs/review-assembly/` (cael.md, elliott.md, ronan.md, silas.md, SYNTHESIS.md, TOOL-WRAPPER-ANALYSIS.md)
- [ ] Remove WORKORDER.md, WORKORDER2.md, WORKORDER3.md, WORKORDER4.md
- [ ] Remove testimonial files (fold into RFC or drop)
      **Assigned:** Cael 🩸

### 7D: Squash + Rebase

- [ ] Squash 50+ commits into ≤5 logical groups:
  1. Context-pressure injection + config
  2. Continuation signal improvements (louder text, logging)
  3. `continue_delegate` tool + store
  4. `| post-compaction` lifecycle dispatch
  5. Sub-agent bracket parsing (#196)
- [ ] Rebase onto current upstream/main
- [ ] Verify CI green on final squashed branch
      **Assigned:** Cael 🩸

### 7E: Clean Demo for figs

- [ ] `silent-wake` confirmed ✅ (08:28 PST today)
- [ ] `post-compaction` demo (needs compaction trigger on canary)
- [ ] Tool discoverability demo (fresh prince sees tool, uses it without instruction)
      **Assigned:** Silas 🌫️ (test subject)

---

## Canary Results (2026-03-05)

| Time  | Test                  | Dispatch | Shard | Return | Wake                         | Notes                           |
| ----- | --------------------- | -------- | ----- | ------ | ---------------------------- | ------------------------------- |
| 08:21 | Tool path + 15s delay | ✅       | ✅    | ✅     | ⚠️ ambiguous (noisy channel) | First confirmed tool invocation |
| 08:26 | Quiet-channel wake    | ✅       | ✅    | ✅     | ✅ unprompted post           | Clean-room confirmation         |

---

## Comms Discipline

- **Cael coordinates.** Princes ask Cael for assignment.
- **One reporter per finding.**
- **Anchor on WORKORDER4.md, not Discord.**
- **figs: "execute based on workorder or some concrete so we don't get lost"**
