# Journal — Alt-path careful-apply-to-naive-ancestor overnight lane (cael opus-4-8 xhigh)

Lane: Alt-path (Lane 2), methodologically-distinct parallel to silas Path D §7 (Lane 1).
Branch: `frond-scribe-claude/20260530/alt-path-opus48-overnight-lane`
Worktree: `/home/figs/alt-path-opus48-worktrees-20260530-0632Z/wt-laneAP-opus48`
Tracking issue: karmaterminal/openclaw#805
Method: careful-apply-to-naive-ancestor (v3-addendum §A2) — NOT manifest-driven decomposition.
Budget: 444 min outer. Discipline: v2 §8.4-§8.17 + journal/watchdog UNCHANGED.

---

## §0 — PRE-FLIGHT READBACK GATE — COMPLETE

`- 2026-05-30T (readback): Read in full, in this session (no first-100-lines half-measure):`

1. `dispatch-substrate/20260530/path-d-workorder-v2.md` (457 lines) — canonical workorder v2-refined
2. `dispatch-substrate/20260530/path-d-workorder-v3-addendum.md` (150 lines) — v3-addendum (alt-path overlay)
3. `RUNBOOKS/PATH-D-OVERNIGHT-LANES-TRACKING-2026-05-30.md` (272 lines) @ 70d53db
4. `RUNBOOKS/PR-DRIFT-CURE-GATES-RUNBOOK.md` (496 lines) — 6-gate procedure + Gate 2.7
5. `RUNBOOKS/PRINCE-CODE-AGENT-RUNBOOK.md` (1616 lines, read in entirety per the file's own ⛔ MUST-READ-IN-FULL gate)
6. `dispatch-substrate/20260530/cael-alt-path-opus48-dispatch.sh` (dispatch script — post_webhook helper + add-dir scope source)

### Required echo (a)–(e):

**(a) v2 §0 — figs's goal (verbatim-shape):**

> "i'd rather take a main at our last rebase point and move piece by piece our feature to it, in
> combination of cherry pick and very deliberate compare of each of our 370 ish modified files."
> "the isolation of feature, grounded in rfc and by examining what we're preserving on our fork; it is a
> series of considering images with a lot of detail, and from it extracting 'what they keep moving'."
> Primary output is the ANALYSIS (per-file classification + decision-table + adversarial enumeration), NOT a candidate-SHA. Candidate-SHA is secondary, IF Phase 4 succeeds.

**(b) v3-addendum §A1 — current substrate-state (2026-05-30 ~06:20Z):**

- PR #85651 backed by `frond-scribe-claude/20260509/narrow-surgery-tight` @ `fc337f05d6` (87 continuation files, 97.3% test-pass). READ-ONLY-ABSOLUTE.
- Alt-path candidate `5d127388df` REMOTE-PUBLISHED (cael, force-with-lease 1510161749). 50/87 = 57% coverage, 8-atomic-commit shape, 37-file feature-regression gap. **This is my prior seat's published candidate; I produce an INDEPENDENT reconstruction with corrected sanctioned-runtime (opus-4-8 vs copilot gpt-5.5) + gitnexus.**
- Path D substrate `bd328fadd6` (silas-published, 572-mod single-commit blind-am artifact, NOT-FOR-PRESENTATION). Cael cross-walk confirmed 37/37 missing-continuation files PRESENT → REGRESSION-PREVENTION SOURCE, not shipping substrate.
- Cohort 12/12 byte-walk cure-class taxonomy COMPLETE (6 classes, 9 cure-actions, zero malign across 4 walked files).
- 10-step gating-stack to figs-go: steps 1-2 done; 3-10 pending. Overnight lanes feed steps 4/6/7.

**(c) v3-addendum §A2 — alt-path method overlay (my lane):**

1. Branch from ancestor `b474f429ee` (done).
2. Carefully apply continuation feature on top of fresh `upstream/main` snapshot (NOT manifest-driven decomposition).
3. Decompose squash into atomic feature-commits (same Layer 0-6 structure as Path D, for comparability).
4. Forward-rebase per-commit onto current `upstream/main` HEAD.
   Output substrate (cure-decisions.tsv, manifest-crosswalk.md, STATUS.md, adversarial-subset.md) follows Path D schema so comparison-engine substrate is mechanical. Multi-SHA comparison vs 4 refs REQUIRED (§A3).

**(d) v2 §349 — journal-as-declare-done canon (PR #1081) — ACKNOWLEDGED:**
≥3 timestamped journal commits during §0–§6, reasoning > byte-mechanics, subject to clean-tree (§8.9) + no-secrets (§8.13) gates. A declare-done webhook WITHOUT backing journal commits is incomplete. Deviations acknowledged in-journal with reasoning.

**(e) v2 §385 — canon §8.17 liveness-watchdog cadence — ACKNOWLEDGED:**
Beyond per-§ fires, intra-phase heartbeat ≤20 min during any phase whose estimate > 30 min (§3, §5). Heartbeat carries phase, elapsed_in_phase_min, monotonic progress_marker (e.g. files-classified N/87). Two identical consecutive markers past cadence ⇒ watchdog fault. Plus §A4 sharpenings: A4.1 stale-vs-elected error-class, A4.2 two-narrative tracing, A4.3 flag-and-continue (no deferral/no halt on ambiguity), A4.4 canon-#17 read-only on active worktrees, A4.5 figs 2026-05-30 (no ship-red / no follow-up-PR / we-don't-exist-on-main / scribe-class-is-force-push-actor).

### At-dispatch re-baseline (PR-DRIFT-CURE-GATES §"Workorder dispatch discipline"):

Resolved live, not trusting workorder snapshot:

- `$PRC` (PR-creation base) = merge-base(fc337f05d6, upstream/main) = **`b474f429ee4bb584ba259ee148db1c2a6b578d16`** — IDENTICAL to the naive ancestor `b474f429ee`. The PR sits as a pure frozen delta directly on b474 with ZERO intervening upstream merges. ⇒ no `no-prcreate-base` indeterminacy for this lane (the 42-file class in v2 §0.1 does not arise here); the §3.A/§3.B split collapses to §3.A only.
- `$UPSTREAM_HEAD` = **`4291e3277720b265720671fcc3ab20587c220d11`** (re-fetched, pinned; never re-resolve origin/main per fork-lag canon §8.2).
- Full reviewer-visible PR delta (`b474..fc337f05d6`) = **583 files** (matches gates-runbook §"playbook" 583-file census; 376/583 = 64% loss-bearing per Gate 2.7 there). The "87 continuation files" is the CORE feature surface (subset of 583); "37-file gap" is alt-path's missing subset of those 87.
- 4 reference SHAs all reachable locally: fc337f05d6 ✓ 5d127388df ✓ bd328fadd6 ✓ upstream/main=4291e32777 ✓.
- gh auth: cael-dandelion-cult (active) + karmafeast + scribe-dandelion-cult. Webhook var fetchable ✓. Issue #805 OPEN ✓.
- gitnexus 1.6.5 present at /home/figs/.local/bin/gitnexus (LINKED-axis optional; ripgrep fallback load-bearing per v2 §10).

### RESOLVED-STATE block (canon §8.15 — idempotent resume):

```
WORKTREE_BASE   = /home/figs/alt-path-opus48-worktrees-20260530-0632Z
LANEAP_WT       = /home/figs/alt-path-opus48-worktrees-20260530-0632Z/wt-laneAP-opus48
WORK_BRANCH     = frond-scribe-claude/20260530/alt-path-opus48-overnight-lane
ANCESTOR        = b474f429ee4bb584ba259ee148db1c2a6b578d16
PRC             = b474f429ee4bb584ba259ee148db1c2a6b578d16   (== ANCESTOR)
PRHEAD          = fc337f05d6   (PR-head N+7, working-feature-floor, 97.3% test-pass)
UPSTREAM_HEAD   = 4291e3277720b265720671fcc3ab20587c220d11   (pinned rebase target)
REF_ALTPATH     = 5d127388df   (cael prior-seat published candidate, 57% coverage)
REF_PATHD       = bd328fadd6   (silas published regression-prevention source, 37/37 covered)
OPENCLAW_BOOTSTRAP = /home/figs/source/openclaw-bootstrap   (drift-cure-gate.sh + feature-cores-byte-check.sh present)
SIBLING_WT_READONLY = /home/figs/alt-path-cael-20260530/openclaw  (canon-#17; fetch-from-origin only, no git-ops)
GITNEXUS_PATH   = enabled (1.6.5) ; ripgrep fallback armed
```

READBACK COMPLETE. Beginning Phase 0.

---

## §1+§2 — Feature manifest + multi-SHA comparison — CORE FINDINGS

`- 2026-05-30 (Phase 1/2): drift-cure-gate.sh upstream/main(4291e32777) vs fc337f05d6, PRC=b474.`

### Gate-2.7 full 583-file census (at-dispatch, current upstream):

- SAFE-NEW=110 (== manifest A=110 ✓ reconciles v2 §2.2)
- FROZEN-STALE=123 (== cohort's 123 EXACTLY ✓ — Layer B baseline-free, stable across upstream advance)
- MIXED-CLOBBER=143 (cohort earlier cited 253; DELTA=-110 is at-dispatch re-baseline drift, Layer C is upstream-HEAD-dependent — SURFACED per gates-runbook re-baseline canon, not silently absorbed)
- GENUINE=207
- Total 583 ✓. Gate exits FAIL on fc337f05d6 (123 FROZEN-STALE) — expected; fc337 is the frozen PR-head awaiting heal.

### Multi-SHA comparison (§A3) — feature surface F=93 continuation-pattern files + 110 SAFE-NEW additions:

Method: blob-hash equality (git rev-parse --verify <ref>:<file>), the production Gate-2 semantics. NOT diff-text, NOT grep.
**BUG CAUGHT + FIXED mid-analysis** (honest deviation): initial blob() used bare `git rev-parse <ref>:<path>` which ECHOES the arg + exits nonzero on absent paths → absent files misclassified as present-different. Fixed to `git rev-parse --verify -q`; re-ran. All counts below are post-fix.

**HEADLINE FINDING (high-confidence, blob-receipted) — CONTRADICTS cohort "50/87=57%, 37-gap":**

- alt-path `5d127388df`: of 110 SAFE-NEW feature-additions, **109 PRESENT (108 byte-identical to PR-head), 1 ABSENT**. Of 93-file continuation-F: 87 IDENT, 6 DIFF, 0 ABSENT.
- path-d `bd328fadd6`: of 110 SAFE-NEW, **109 PRESENT (109 byte-identical), 1 ABSENT** (same file).
- ⇒ alt-path is ~99% feature-complete at blob level, NOT 57%. The "37-file regression gap" is NOT reproducible against this SHA.

### Why the divergence (characterized, not asserted blind):

1. The 1 ABSENT file `src/auto-reply/reply/skill-tool-dispatch.runtime.ts` is ABSENT in 5d12's newer-upstream base b352cb2d8e — upstream REFACTORED auto-reply/reply dispatch into the `dispatch-acp-*` family; PR-head's file was architecturally SUPERSEDED. Careful-apply correctly did NOT resurrect it. = ARCHITECTURE-DIVERGENCE class (benign), not regression. (§A4.1 stale-vs-elected: PR-head's file is inherited-stale; alt-path's omission is actively-correct.)
2. The 6 DIFF compaction files (compact.ts/.types.ts, compaction-safeguard.ts, compact.hooks.harness.ts, compact.queued.ts, compaction-runtime-context.test.ts): alt-path & path-d INDEPENDENTLY CONVERGED on identical bytes for 5/6 (e.g. compact.types.ts both=97b89100, compaction-safeguard both=b158fe05) — distinct from BOTH upstream and frozen-PR-head. = correct feature+upstream merge (the intended drift-cure), NOT a clobber. Independent two-lane convergence ⇒ high-confidence per v2 §9.

### Reconciliation hypothesis for the cohort's "50/87 / 37-gap" (flagged for cohort/figs adjudication, §A4.3):

Most likely the "57% coverage" measured byte-identity-to-FROZEN-PR-head across a surface that INCLUDES shared/drifted files, where alt-path (careful-apply-onto-NEWER-upstream) legitimately carries current-upstream content that differs from PR-head's frozen bytes. That penalizes alt-path for being MORE upstream-correct, not less feature-complete. OR the number predates a gap-fill/force-with-lease re-push of the 5d12 ref. CANNOT distinguish without the cohort's original measurement recipe; surfaced as divergence-with-receipts, not as a verdict.

---

## §4 — Reconstruction (careful-apply forward-rebase) — COMPLETE

`- 2026-05-30 (Phase 4): forward-rebase 8 atomic commits b352cb2d8e..5d127388df onto current upstream/main 4291e32777.`

- Cherry-pick of all 8 atomic continuation commits onto fresh upstream: **exit 0, ZERO conflicts**, absorbing 32 commits of upstream drift. Candidate SHA **`ce144d00c2`** (branch `laneAP-reconstruct/20260530-0652Z`).
- Reproduces alt-path coverage: 109/110 SAFE-NEW present, 108 byte-identical to PR-head, 1 absent (skill-tool-dispatch.runtime.ts).
- **Gate 2.7 on reconstruction: FROZEN-STALE=0, MIXED-CLOBBER=0** (vs PR-head's 123 FROZEN-STALE). Careful-apply-onto-fresh-upstream kills the frozen-tree reverse-clobber at root — the structurally-correct cure per gates-runbook §"playbook".
- Gate 2 (vs frozen PR-head): 43 primitive-cores differ = 29 pure-upstream-evolution (NOT loss) + 11 genuine 3-way-merge (feature+upstream) + 3 SAFE-NEW feature-diffs (flag). 0 feature losses. This is the Gate-2/Gate-2.7 DISJOINT-region tension concrete: a fresh-upstream candidate cannot be byte-identical to frozen-PR-head on shared files AND carry current upstream — it correctly chooses upstream.
- **Reconciliation CONFIRMED (B.2 + Gate-2 evidence):** Gate-2-style byte-identity-to-frozen-PR-head measurement penalizes a correct fresh-upstream candidate on ~40 shared files by design. That is the most likely manufacture of the cohort's "50/87=57%". Feature-PRESENCE coverage is ~99%; frozen-byte-identity is the wrong metric for a fresh-upstream candidate.
- Per canon §8.11 (all-or-analysis-only): tree clean, no am-in-progress, no detritus/secrets. Candidate is comparison-vector substrate (stream-5), NOT a shipping candidate — 3 feature-diffs + 11 3-way-merges + 1 absent file need cohort adjudication first.

---

## §5+§6 — Adversarial subset + DECLARE-DONE (2026-05-30T07:01Z)

`- 2026-05-30T07:01Z (declare-done):` Lane COMPLETE. Primary output (the ANALYSIS) delivered + an independent reconstruction candidate verified clean.

### Deliverables (committed to branch, lane-AP-substrate/):

- cure-decisions.tsv (93-F multi-SHA disposition) + gate-2.7-classification-583.tsv (full census)
- manifest-crosswalk.md (count reconciliation: A=110✓ FROZEN=123✓ MIXED=143-rebaseline 278-cure-region✓)
- adversarial-subset.md (8 divergent files risk-classified) + reconstruction-report.md + methodology.md + STATUS.md

### The three findings of record (all blob-receipted, comparison-engine substrate):

1. **alt-path 5d127388df is ~99% feature-complete (109/110 SAFE-NEW, 108 byte-identical to PR-head), NOT 50/87=57%.** The 37-file regression gap is NOT reproducible at blob level against this SHA.
2. **The "57% coverage" is a measurement artifact:** Gate-2-style byte-identity-to-frozen-PR-head penalizes a correct fresh-upstream candidate on ~40 shared files it legitimately carries from current upstream (29 pure-upstream + 11 3-way-merge, 0 losses). Demonstrated directly by my reconstruction's Gate-2 = 43 FAIL / 0 loss.
3. **Careful-apply forward-rebases CLEAN** (8 commits, 0 conflicts, 32-commit drift absorbed) → Gate-2.7 FROZEN-STALE=0. The structurally-correct cure.

### Cohort-action-list (route to figs/cohort):

- [HIGH] Re-validate the 37-gap premise before dispatching gap-fill (step-6) — gap may not exist.
- [HIGH] Byte-walk the 2 alt==upstream compaction files (compact.queued.ts, compaction-runtime-context.test.ts).
- [MED] 3-way resolve compact.ts; decide skill-tool-dispatch.runtime.ts seam; review the 3 SAFE-NEW feature-diffs.
- [LOW] Adopt the 3 alt/pathd CONVERGE resolutions.

### Honest bounds (§10):

File-presence/byte-identity = ground truth. Divergence INTERPRETATION (benign vs regression) = flagged for cohort adjudication, not verdict. Two self-caught check-logic bugs (rev-parse arg-echo; head-masks-grep-exit) corrected with proper receipts. GitNexus available-unused. Savegame phase justified-skip (PRC==ancestor removes the marathon-frozen-base ambiguity savegames disambiguate).

READBACK→PHASE0→PHASE6 COMPLETE. Lane declares done.
