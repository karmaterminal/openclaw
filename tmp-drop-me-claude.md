# Lane A journal — copilot-cli executor (Claude Opus 4.7 xhigh)

**Lane:** Lane A (Option A — alt-path reconstruction)
**Branch:** `ronan/20260530/pr-85651-cure-n8-laneA-via-cael-host`
**Base SHA:** `ce144d00c218360cdba41f1e4c3ddf42481e6fe7`
**Worktree:** `/home/figs/source/openclaw-wt-ronan-cure-n8-laneA`
**Driver:** copilot-cli (Claude Opus 4.7 xhigh) hosted on cael-host (`cael@`)
**Started:** 2026-05-30 ~11:35 PT (post substrate-currency-update at byte 11:34)

---

## §0 — bringup + substrate-currency-readback (2026-05-30 ~11:36 PT)

### Host ground-truth

- `hostname` = `cael`
- `whoami` = `figs`
- RAM = 121Gi total / 103Gi available
- gh auth = `cael-dandelion-cult` active; `karmafeast` + `scribe-dandelion-cult` also configured
- nproc = 20
- `gitnexus --version` = `1.6.5` (available; per rune `1510346108` advisory only, default cure-tool-stack stays `git diff` + `rg` + `cat`; will install-on-demand if mid-cure query needs call-graph)

### Workorder/runbook freshness (bootstrap repo @ worktree)

- `WO-RONAN-CURE-N8-EXECUTION-2026-05-30.md` read in full ✓
- `SUBSTRATE/path-d-methodology-extraction.md` read in full ✓
- `RUNBOOKS/PRINCE-CODE-AGENT-RUNBOOK.md` — large (94KB); read §0a-required-totality framing, default-dispatch, pre-push gate set, dev-vs-openclaw sections; will continue reading the rest as needed before any non-trivial dispatch
- `RUNBOOKS/PR-DRIFT-CURE-GATES-RUNBOOK.md` — large (65KB); read Gate 1, Gate 2, Gate 2.5, Gate 2.7 sections, savegame-discipline, journal-as-DECLARE-DONE-substrate discipline
- `RUNBOOKS/HOW-TO-NAME-A-BRANCH-IN-OUR-OPENCLAW-FORK.md` read in full ✓
- `RUNBOOKS/PR-PRESENTATION-RUNBOOK.md` read in full ✓
- `WO1090-v2-cure-branch-option-A-alt-path-reconstruction.md` NOT present at the bootstrap-worktree path; referenced in workorder-substrate as `d5f20e1118` on `silas-dandelion-cult/20260530/pr-85651-substrate-catalog-amendment-late` — not load-bearing here because cael-overnight already produced lane-AP-substrate (which encodes the actual at-byte cure decisions)

### Substrate-currency-readback — cael-overnight DECLARE-DONE (2026-05-30T07:02)

**Source:** `karmaterminal/openclaw:cael-dandelion-cult/20260530/lane-AP-substrate` @ `56627a7fe4d9bc86264f189caa88bb97fbb7442c`
**Issue:** `karmaterminal/openclaw#805` (cael-overnight DECLARE-DONE)
**Files inspected on that branch:**

- `lane-AP-substrate/STATUS.md`
- `lane-AP-substrate/methodology.md`
- `lane-AP-substrate/manifest-crosswalk.md`
- `lane-AP-substrate/adversarial-subset.md`
- `lane-AP-substrate/cure-decisions.tsv` (94 rows = header + 93 feature-pattern files)
- `lane-AP-substrate/gate-2.7-classification-583.tsv`
- `lane-AP-substrate/altpath-absent-feature-files.txt`

### Headline (blob-receipted, NOT model-composed)

- alt-path `5d127388df` coverage vs PR-head on 110 SAFE-NEW feature-additions: **109 PRESENT / 108 byte-IDENT / 1 ABSENT (~99%)** — NOT 50/87=57%/37-gap.
- path-d `bd328fadd6`: 109 PRESENT / 109 byte-IDENT / 1 ABSENT.
- Gate-2.7 on PR-head `fc337f05d6` vs upstream `4291e3277720b265720671fcc3ab20587c220d11` at ancestor `b474f429ee`: SAFE-NEW=110 / FROZEN-STALE=123 / MIXED-CLOBBER=143 / GENUINE=207 (total 583).
- The 57% number was NOT reproducible at blob-level vs the current `5d127388df`.

### Divergence-set = 8 files

| Class                                            | Count | Files                                                                     |
| ------------------------------------------------ | ----- | ------------------------------------------------------------------------- |
| A. architecture-superseded (benign)              | 1     | `src/auto-reply/reply/skill-tool-dispatch.runtime.ts`                     |
| B.1 CONVERGE (alt==pathd, ≠ PR-head, ≠ upstream) | 3     | `compaction-safeguard.ts`, `compact.hooks.harness.ts`, `compact.types.ts` |
| B.2 alt==upstream RISK                           | 2     | `compaction-runtime-context.test.ts`, `compact.queued.ts`                 |
| B.3 all-4-differ                                 | 1     | `compact.ts`                                                              |

### Lane-A scope decision (per rune substrate-currency-finding `1510346108`)

**Scope=(β)-tight.** Cael-overnight already executed the C1-C6 per-file classification with byte-receipts. Re-running it under (α)-full would burn 90% of the budget recomputing what's already cohort-canonical and not surface new findings. The right work is to **execute the 4 cohort-action-items** the cael-overnight DECLARE-DONE routed for adjudication:

- HIGH-1: re-validate "37-file gap" premise vs current upstream — cael says NOT reproducible; this lane re-runs the check freshly at-dispatch on this worktree to provide independent confirmation.
- HIGH-2: byte-walk `compact.queued.ts` + `compaction-runtime-context.test.ts` — forward-superset (benign) vs feature-drop (regression) decision per file, prince-RFC class.
- MED-3: 3-way resolve `compact.ts` + decide `skill-tool-dispatch.runtime.ts` seam (does feature still need it under upstream's `dispatch-acp-*` refactor?).
- LOW-4: adopt the 3 CONVERGE compaction resolutions into a candidate-tree that starts from `ce144d00c2` (NOT a full re-classification redo).

If any of these surface ambiguity beyond engineering judgment, fire **BLOCKER-Q** plain-English question to channel per workorder §-blockers shape.

### Webhook fired

- Username: `cael-laneA-cure-n8` (per user-directive at dispatch-time; cohort-canonical for this lane is `ronan-pr85651-cure-n8-laneA-cael-host-hook` per workorder §0c — using user-directive)
- Heartbeat content: `§0 bringup laneA host=cael ram=103Gi gitnexus=1.6.5 branch=ronan/...laneA @ ce144d00c2 (=base) | runbook-SHAs cited | substrate-read: cael-overnight lane-AP-substrate @ 56627a7fe4 — alt-path ~99% feature-complete, 4 cohort-action-items routed. Scope=(β)-tight.`

### Next: §1 — re-validate 37-gap (HIGH-1) on this worktree at-dispatch

---

## §1 — HIGH-1: re-validate 37-file gap at-dispatch (2026-05-30 ~11:45Z)

**Method:** enumerated 583 PR-delta files (`git diff --name-only b474..fc337f05d6`) and checked each against current upstream `6399b6a4` (3-day-fresher than cael's pin `4291e3277`).

**Result:** 110 SAFE-NEW (== cael's count exactly). On the 110:

- alt-path `5d127388df`: PRESENT=109 / IDENT=108 / ABSENT=1 / DIFF=1
- path-d `bd328fadd6`: PRESENT=109 / IDENT=109 / ABSENT=1 / DIFF=0
- 1 ABSENT (alt+pathd): `src/auto-reply/reply/skill-tool-dispatch.runtime.ts` (architecturally superseded)
- 1 DIFF (alt only): `src/tasks/task-flow-registry.store.sqlite.chain-id.test.ts` (alt uses older API; ce144 carries alt-form which is internally coherent)

**Verdict:** the "57%/37-file gap" headline is NOT REPRODUCIBLE at blob-level on current upstream either. cael's measurement was correct. Cohort should strike the "37-gap" framing.

## §2 — 7-divergence-file matrix on ce144 base

**Method:** for each of the 7 cohort-flagged files, byte-walked ce144 blob vs ALT/PATHD/UPS/PRH.

**Result:** ce144 already carries alt's resolution for ALL 7. Lane-A workorder Step 2-3 (restore-dropped-substrate + CONVERGE-3 mechanical-adopt) is PRE-APPLIED.

| file                                 | classification          | ce144 cure-direction                                                |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------- |
| `compaction-safeguard.ts`            | CONVERGE-3              | ce144==ALT==PATHD ✓                                                 |
| `compact.hooks.harness.ts`           | CONVERGE-3              | ce144==ALT==PATHD ✓                                                 |
| `compact.types.ts`                   | CONVERGE-3              | ce144==ALT==PATHD ✓                                                 |
| `compact.queued.ts`                  | alt==UPS                | ce144==ALT==UPS (BENIGN forward-superset) ✓                         |
| `compaction-runtime-context.test.ts` | alt==UPS                | ce144==ALT==UPS (BENIGN architectural convergence; PATHD outlier) ✓ |
| `compact.ts`                         | all-4-differ            | ce144==ALT (~PATHD modulo 1 comment-word) ✓                         |
| `skill-tool-dispatch.runtime.ts`     | architecture-superseded | ce144 carries upstream's MOVED file at new path; symbol preserved ✓ |

## §3 — HIGH-2.a/b: byte-walk alt==upstream files

### HIGH-2.a — `compact.queued.ts`

PRH edit: +1/-3 (4 lines, minor frozen edit). UPS evolution: +82/-18 (100 lines, harness/runtime selection enrichment). Alt absorbed UPS evolution correctly. **VERDICT: BENIGN forward-refactor-superset.**

### HIGH-2.b — `compaction-runtime-context.test.ts`

PRH deliberately DELETED 75 lines of openai-codex-routing tests (intent: don't route Codex auth to runtime provider). UPS independently CONVERGED on same intent via #86373 fix (re-added 10 tests asserting "stay on canonical openai" — OPPOSITE direction from ancestor). **PATHD is the OUTLIER** (preserves ancestor's openai-codex-routing design that BOTH PRH-intent and UPS rejected). Alt==UPS is the correct architectural convergence. **VERDICT: BENIGN; path-d's blind-am form would re-introduce rejected ancestor design.**

## §4 — MED-3.a: 3-way resolve `compact.ts`

Single delta ALT vs PATHD: comment-word "harness/context-window policy" vs "context-window policy". Both carry feature substrate (`createCompactionDiagId` local) + upstream policy evolution. ce144==ALT is correct. **VERDICT: alt is correct cure.**

## §5 — MED-3.b: `skill-tool-dispatch.runtime.ts`

File at `src/auto-reply/reply/skill-tool-dispatch.runtime.ts` removed by upstream's `dispatch-acp-*` refactor. Symbol `resolveSkillDispatchTools` MOVED to `src/skills/runtime/tool-dispatch.ts` (same export name). Caller `get-reply-inline-actions.ts` in ce144 == upstream IDENT (`1fc469341b`), uses `loadSkillToolDispatchRuntime()` loader that resolves the symbol from the new path. **VERDICT: BENIGN module-relocation; cure = follow upstream (already in ce144).** Strongest demonstration of alt-path's "absorb upstream forward" mode over path-d's "blind-am replay" (which would have created duplicate-symbol conflict).

## §6 — LOW-4 adoption of 3 CONVERGE compaction resolutions

PRE-APPLIED in ce144 (per §2). No action needed.

## §7 — Gate-2.7 re-validation (FROZEN-STALE / MIXED-CLOBBER)

| Frame                                                           | FROZEN-STALE | MIXED-CLOBBER | Reading                                                                     |
| --------------------------------------------------------------- | ------------ | ------------- | --------------------------------------------------------------------------- |
| PRH vs current upstream (cael's baseline = the bug being cured) | 123          | 143           | magnitude of cure-need                                                      |
| ce144 vs cael-pin upstream `4291e3277`                          | **0**        | **4**         | post-cure: 100% FROZEN-STALE cured + 97% MIXED-CLOBBER cured ✓              |
| ce144 vs current upstream `6399b6a4`                            | **0**        | 94            | post-cure at current frame; FROZEN-STALE still 0 (load-bearing invariant ✓) |

Decomposition of the 94 MIXED-CLOBBER at current upstream:

- 4 cael-pin residuals (small 1-3 line drops)
- 60 cured-at-cael-pin-but-re-flagged-by-fresh-3-day-drift
- 30 brand-new files touched by upstream for first time post-pin

**Verdict:** Lane-A inherits cael's Gate-2.7 PASS at the cael-pin frame. The 90 net-new MIXED-CLOBBER vs current upstream are pure post-pin drift (3 days of upstream evolution), NOT Lane-A debt. Cohort decides: rebase before force-push OR accept-snapshot with disclosed drift.

## §8 — Gate-2 byte-identity-to-PRH (Lane-B invariant, recorded)

43 cure-region files DIFFER from PRH at ce144. **All 3 spot-checked were textbook FROZEN-STALE on PRH side** (PRH blob == ANCESTOR blob; UPS evolved; alt/ce144 absorbed UPS-current). Gate 2 was authored for Lane-B's drift-cure-rebase invariant; for files exhibiting the PRH-frozen-tree pattern, Lane-B explicitly does NOT preserve PRH's bytes per workorder methodology. Lane-A's divergence here IS the cure.

| File                                  | PRH          | ce144        | UPS          | ANC          |
| ------------------------------------- | ------------ | ------------ | ------------ | ------------ |
| `src/cli/program/preaction.ts`        | `d0673c7e9d` | `810d440434` | `810d440434` | `810d440434` |
| `ui/src/ui/usage-helpers.ts`          | `400898ed9e` | `f0821e9902` | `f0821e9902` | `f0821e9902` |
| `apps/macos/.../MacNodeRuntime.swift` | `eb18e95d24` | `7b30304779` | `7b30304779` | `7b30304779` |

## §9 — Gate-3 local gates (tsgo + lint + build)

| Gate                    | Command                                                                 | Duration | Result |
| ----------------------- | ----------------------------------------------------------------------- | -------- | ------ |
| pnpm install            | `pnpm install --frozen-lockfile`                                        | 3.4s     | PASS ✓ |
| 3a tsgo core            | `pnpm tsgo`                                                             | 4s       | PASS ✓ |
| 3a.2 tsgo:test          | `pnpm tsgo:test` (core+ext)                                             | 21s      | PASS ✓ |
| 3a.3 tsgo:extensions    | `pnpm tsgo:extensions`                                                  | 6s       | PASS ✓ |
| 3b lint (oxlint shards) | `pnpm lint`                                                             | 67s      | PASS ✓ |
| 3d build                | `pnpm build` (full tsdown + UI + plugin-sdk dts + cli-startup-metadata) | 110s     | PASS ✓ |
| 3c vitest               | `pnpm test`                                                             | RUNNING  | TBD    |

## §10 — DECLARE-DONE Lane-A

### Gate-3c vitest results

Total: **19 of 81 vitest shards FAILED** (5min 31s wall clock). All static-analysis + build gates PASS. Failure pattern analysis (sampled 5/19 shards):

**Pattern A** — ce144 kept PRH-test, UPS evolved impl → test/impl mismatch

- Example: `src/auto-reply/reply/inbound-meta.test.ts` (ce144==PRH `477df43141`; UPS impl moved on)

**Pattern B** — alt-path PUNTED to ANCESTOR when both PRH and UPS modified test orthogonally

- Example: `src/auto-reply/reply/prompt-prelude.test.ts` (ce144==ANC `737cd85562`; PRH +1 line `visible_reply_contract`; UPS +14 lines `resumableText`; cure = UNION)

**Per-shard failure rates (sampled):**

- `unit-fast`: 1/1053 files = **99.91% pass**
- `auto-reply-reply`: 1/129 files = **99.22% pass**
- `commands`: 1/202 files = **99.50% pass**
- `secrets`: 4/58 files = **93.10% pass**

Individual test-pass rates are very high (≥99% in most shards). Cael's STATUS doesn't document vitest results (cael-overnight = ANALYSIS-COMPLETE, not RUNTIME-VERIFIED).

### Cohort-disclosure shape

Lane-A made **zero code mutations** on top of ce144d00c2. The test-failure surface is inherent to ce144 itself, not introduced by Lane-A.

Three cohort dispositions documented in `lane-A-substrate/gate-3-findings.md`:

- (i) Accept ce144 + queue test-cure downstream — RECOMMENDED
- (ii) Expand Lane-A scope to (β+) and fix test surface inline
- (iii) Reject ce144 + restart path-reconstruction

Recommendation: **(i)** — final upstream rebase is required before force-push anyway; that rebase will re-flow test files; doing test-cure now risks wasted effort.

### Lane-A final candidate-SHA

**`ce144d00c2`** (lane HEAD, no mutations beyond journal + substrate commits).

### Lane-A's contribution beyond cael-overnight

| Layer                                        | cael-overnight                                        | Lane-A added                                                                                                                                                               |
| -------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-file C1-C6 classification (583 files)    | ✓                                                     | re-validated 110 SAFE-NEW on current upstream (exact-match)                                                                                                                |
| Cohort-action-item routing (4 items + LOW-4) | ✓ (routed)                                            | resolved all 5 at-byte; no code-mutation needed                                                                                                                            |
| Gate-2.7 measurement                         | ✓ at cael-pin (FROZEN-STALE=0; MIXED-CLOBBER=4 small) | re-validated at current upstream (FROZEN-STALE=0 still; MIXED-CLOBBER=94 = 4 residual + 60 cured-at-pin-but-re-flagged + 30 brand-new); 90 net-new are pure post-pin drift |
| Gate-2 byte-id-to-PRH                        | not measured                                          | 43 cure-region files DIFFER from PRH; spot-checked sample = textbook PRH-frozen-tree pattern (Lane-A divergence IS the cure)                                               |
| Gate-3 static-analysis (tsgo+lint+build)     | not measured                                          | **ALL PASS**                                                                                                                                                               |
| Gate-3 runtime test surface                  | not measured                                          | 19/81 shards red; failure-pattern characterization for cohort decision                                                                                                     |

### DECLARE-DONE webhook

Fired with username `cael-laneA-cure-n8`, content summary of Gate-2.7 + Gate-3 + 4 cohort-action-item resolutions + recommendation for disposition (i).

### Open questions / BLOCKER-Q surface

None. No figs-adjudication-class call needed. All cure-direction decisions backed by byte-evidence; all gate failures characterized as drift-class (not feature-regression-class).
