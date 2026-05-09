# Lane-1 narrow re-cut — frond-scribe driving

## Pin state at workorder fire-time

```
upstream/main HEAD       = 7c27a51788c444096c5912e06a35022ae2bdc691
feature/context-pressure-squashed HEAD = f187917c92bde28943de6d4ba959685bba73490b
branch                    = frond-scribe/20260509/upstream-narrow-continuation
worktree                  = /tmp/oc-narrow-recut-frond/
tracking issue            = karmaterminal/openclaw-bootstrap#964
dispatch directive        = figs 2026-05-09 ~12:25 PDT (lane-shift from 🌊 ACP-dispatched lane to frond-scribe driver-seat for observability/risk reasons)
```

## Phase progression

- [x] **Phase 0**: clone + remotes + branch from fresh upstream/main + journal pushed step 1
- [ ] **Phase 1**: Phase-0 byte-walks (deps cross-check, AMBIGUOUS Phase-0.2 import-walk, KEEP/DROP/AMBIGUOUS deterministic map)
- [ ] **Phase 2**: NEW files cherry-pick (~26, raw-overwrite OK)
- [ ] **Phase 3**: MODIFIED files cherry-pick (~54, 3-way merge text-drift conflicts)
- [ ] **Phase 4**: Three clawsweeper P1s fold as content
- [ ] **Phase 5**: Verification gates (pnpm tsgo + check + test + build)
- [ ] **Phase 6**: Open PR as DRAFT cross-fork to openclaw/openclaw:main

## Heartbeat plan

Discord heartbeat at each phase boundary; surface to #sprites with phase-complete + state-of-bytes.

## Cohort canon applied

- feedback_phase0_cross_check_vs_upstream
- feedback_savegame_branches
- feedback_code_agent_remote_first_checkpoint_pushes (push step 1 ✓ — this commit)
- feedback_show_your_work
- Pattern-G (issue #964 filed before dispatch ✓)
- feedback_orchestrator_workorder_shape_canon (5-section template)

## What was rejected (last PR close)

PR openclaw/openclaw#38780 closed by @obviyus 2026-05-09T15:20:28Z:
> "This branch appears to include a large replay of unrelated main/release commits, so it is not reviewable as a focused Telegram change. Please reopen as a narrow PR with only the intended fix."

Mechanism: 2026-04-20 squash-onto-v2026.4.14 preserved squash-base = v2026.4.14, parent-walk replayed 31k lines of unrelated upstream churn including telegram/whatsapp/etc residue. Continuation feature has zero changes to extension code; all those files were replay-residue. Cure = cherry-pick narrow against fresh upstream/main, no parent-walk-pollution.
