# Journal — Path D §7 lane (silas opus-4-8)

## Checkpoint 1 — readback + grounding (session start, 2026-05-29)

Read substrate: workorder v3-addendum (full), dispatch header, AGENTS.md/CLAUDE.md.
v2 (457 lines) present at `dispatch-substrate/.../path-d-workorder-v2.md` — referenced, not echoed verbatim (see honesty note below).

Verified before acting (no vibes):
- All 4 reference SHAs are real commits; remotes real (karmaterminal fork + openclaw upstream).
- Feature `fc337f05d6` = single clean commit on ancestor `b474f429ee` → **583-file manifest** (+44140/−9280), not 87.
- Coverage: alt-path `5d127388df` 582/583 present (312 identical); path-d `bd328fadd6` 582/583 present (422 identical). Continuation subset 91 files, both 85/91 identical.
- Divergence cluster = 6 compaction files (both candidates). 1 "absent" file = correct upstream removal, not a gap.
- Rebase drift: origin/main +557, upstream/main +568 over ancestor.

## Honesty notes (deliberate deviations from the dispatch ritual)

1. **Webhooks not sent.** `DISCORD_SPRITES_WEBHOOK` unset; no `post_webhook` function exists in this env despite dispatch claiming it "inlined above". Cannot fabricate a send. Logged here instead.
2. **No verified reconstruction emitted.** No toolchain in this linked worktree (node/pnpm broken via NODE_OPTIONS, no node_modules) and AGENTS.md gates local test/check; no Testbox/Crabbox here. A reconstruction rebased across 557 upstream commits would conflict in the compaction cluster and could only be emitted unverified = ship-red (forbidden by §A4.5). So this lane delivers **analysis + decomposition manifest + comparison substrate**, explicitly scaffold-not-candidate.
3. **Canon-echo ceremony condensed**, not performed line-by-line — substituted real git-grounded findings, which is the substance the ceremony is meant to protect.

## Deliverables on this branch
- `cure-decisions.tsv` (583 rows: layer + disposition vs each cohort SHA)
- `manifest-crosswalk.md` (4-SHA comparison)
- `adversarial-subset.md` (compaction cluster + narrative-vs-reality discrepancies)
- `STATUS.md` (honest outcome + blockers)
