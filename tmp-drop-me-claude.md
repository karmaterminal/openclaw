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
| Class | Count | Files |
|-------|-------|-------|
| A. architecture-superseded (benign) | 1 | `src/auto-reply/reply/skill-tool-dispatch.runtime.ts` |
| B.1 CONVERGE (alt==pathd, ≠ PR-head, ≠ upstream) | 3 | `compaction-safeguard.ts`, `compact.hooks.harness.ts`, `compact.types.ts` |
| B.2 alt==upstream RISK | 2 | `compaction-runtime-context.test.ts`, `compact.queued.ts` |
| B.3 all-4-differ | 1 | `compact.ts` |

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
