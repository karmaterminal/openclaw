# Cure-decisions — Lane A (PR #85651 cure-n8)

**Scope:** the 7 files the cohort-substrate flagged as cure-decision-points (6 contested-compaction files + 1 architecture-superseded file). For the full 583-file census, see `gate-out/classification.tsv` (current upstream) and `gate-out-caelpin/classification.tsv` (cael-pin upstream).

## 7-file blob-disposition matrix (independent lane-A byte-walk on ce144d00c2)

For each file:

- **ANC** = `b474f429ee` (PR-creation ancestor, == merge-base)
- **PRH** = `fc337f05d6` (PR #85651 head)
- **UPS** = `6399b6a4` (current upstream/main at-dispatch)
- **ALT** = `5d127388df` (alt-path = upstream b352cb2d8e + 8 atomic continuation commits)
- **PATHD** = `bd328fadd6` (path-d = upstream e9dee8dfe1 + 1 blind-am commit)
- **ce144** = `ce144d00c2` (lane-A base, == upstream/4291e3277 + 8 atomic continuation commits)

### File 1 — `src/agents/embedded-agent-runner/compact.ts` (all-4-differ)

| ref   | blob (first 12)     | class                                                                |
| ----- | ------------------- | -------------------------------------------------------------------- |
| ANC   | (varies)            | —                                                                    |
| PRH   | (PRH blob)          | feature-intent baseline                                              |
| UPS   | (UPS blob, evolved) | upstream-evolved policy                                              |
| ALT   | (ALT blob)          | feature substrate (`createCompactionDiagId` local) + upstream policy |
| PATHD | (PATHD blob)        | ALT-form modulo 1 comment-word                                       |
| ce144 | == ALT              | carries cure                                                         |

**Cure-direction:** Adopt ALT (already in ce144). ALT carries the feature substrate (`createCompactionDiagId` local definition) on top of upstream's policy evolution. PATHD effectively converges with ALT (1 comment-word delta: "harness/context-window policy" vs "context-window policy"). **VERDICT: ce144 adoption of ALT is correct.**

### File 2 — `src/agents/embedded-agent-runner/compact.queued.ts` (alt==upstream)

**Cure-direction:** Adopt ALT == UPS (already in ce144). PRH's edit is a 4-line frozen edit (+1/-3). Upstream evolved 100 lines independently (+82/-18, harness/runtime selection enrichment). ALT correctly absorbs upstream's evolved form. **VERDICT: BENIGN forward-refactor-superset; ce144 adoption of ALT is correct.**

### File 3 — `src/agents/embedded-agent-runner/compaction-runtime-context.test.ts` (alt==upstream)

**Cure-direction:** Adopt ALT == UPS (already in ce144). PRH deliberately DELETED 75 lines of openai-codex-routing tests (intent: don't route Codex auth to runtime provider catalog). Upstream independently CONVERGED on the same intent via #86373 fix (re-added 10 tests with opposite assertion: "stay on canonical openai"). **PATHD is the OUTLIER**: it preserves the b474 ancestor's openai-codex-routing design — the design BOTH PRH-intent AND upstream rejected. **VERDICT: BENIGN architectural convergence; ce144 adoption of ALT is correct; path-d's blind-am form would re-introduce the rejected ancestor design.**

### Files 4-6 — CONVERGE compaction trio (alt==pathd)

| file                                                        | ce144 blob | ALT blob | PATHD blob | match?              |
| ----------------------------------------------------------- | ---------- | -------- | ---------- | ------------------- |
| `src/agents/agent-hooks/compaction-safeguard.ts`            | ce144      | ALT      | PATHD      | ce144==ALT==PATHD ✓ |
| `src/agents/embedded-agent-runner/compact.hooks.harness.ts` | ce144      | ALT      | PATHD      | ce144==ALT==PATHD ✓ |
| `src/agents/embedded-agent-runner/compact.types.ts`         | ce144      | ALT      | PATHD      | ce144==ALT==PATHD ✓ |

**Cure-direction:** Already cured in ce144. Dual-lane independent confirmation (alt + path-d agree) is the strongest possible cure-direction signal. **VERDICT: PRE-APPLIED; LOW-4 resolved.**

### File 7 — `src/auto-reply/reply/skill-tool-dispatch.runtime.ts` (architecture-superseded)

| ref   | present?                        | path                                                  | notes                                                                                      |
| ----- | ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| ANC   | YES                             | `src/auto-reply/reply/skill-tool-dispatch.runtime.ts` | blob `62237b0c`; legacy single-file dispatch runtime                                       |
| PRH   | YES                             | "                                                     | blob essentially unchanged from ANC                                                        |
| UPS   | NO at OLD path; YES at NEW path | `src/skills/runtime/tool-dispatch.ts`                 | symbol `resolveSkillDispatchTools` MOVED here by `dispatch-acp-*` refactor (12+ new files) |
| ALT   | NO at OLD path; YES at NEW path | `src/skills/runtime/tool-dispatch.ts`                 | absorbed upstream's refactor correctly                                                     |
| PATHD | NO at OLD path; YES at NEW path | `src/skills/runtime/tool-dispatch.ts`                 | absorbed upstream's refactor correctly                                                     |
| ce144 | NO at OLD path; YES at NEW path | `src/skills/runtime/tool-dispatch.ts`                 | carries ALT's resolution                                                                   |

**Caller** (`src/auto-reply/reply/get-reply-inline-actions.ts`): ce144 blob `1fc469341b` == upstream IDENT. The loader function `loadSkillToolDispatchRuntime()` resolves the symbol from the new module path.

**Cure-direction:** Already cured in ce144 by following upstream's refactor. The symbol moved, it was not dropped. **VERDICT: BENIGN module-relocation; cure = follow upstream (already in ce144); MED-3.b resolved.**

---

## Aggregate cure-direction across the 7 files

| count | cure-direction in ce144                                   | classification                                                                            |
| ----- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 3     | ce144 == ALT == PATHD                                     | CONVERGE — dual-lane independent confirmation                                             |
| 2     | ce144 == ALT == UPS                                       | alt absorbed upstream-forward (BENIGN forward-superset, BENIGN architectural convergence) |
| 1     | ce144 == ALT (~ PATHD modulo 1 comment-word)              | all-4-differ; alt resolution correct                                                      |
| 1     | ce144 omits OLD path, carries NEW path (UPS architecture) | architecture-superseded; symbol moved                                                     |

**Net: ce144d00c2 carries the right cure-direction for all 7 files. Zero code-mutations required.**

---

## Cure-direction philosophy ground-truth

Per workorder methodology + path-d-methodology-extraction §C1-C6:

| C-class                          | Cure-direction rule                                      | Lane-A finding                                                                                                                |
| -------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| C1 — alt-path forward-absorb     | Adopt alt (alt carries upstream-evolution PRH froze)     | Applies to compact.queued.ts, compaction-runtime-context.test.ts                                                              |
| C2 — dual-lane CONVERGE          | Adopt either (alt==pathd is independent confirmation)    | Applies to compaction-safeguard.ts, compact.hooks.harness.ts, compact.types.ts                                                |
| C3 — restore-dropped-substrate   | Restore upstream content PRH dropped into PRH-resolution | Applies to compact.ts (substrate-carrying resolution); alt's `createCompactionDiagId` local definition is the substrate-carry |
| C4 — architecture-supersession   | Follow upstream's new architecture                       | Applies to skill-tool-dispatch.runtime.ts (symbol moved)                                                                      |
| C5 — path-d outlier              | Reject path-d when it preserves rejected ancestor design | Applies to compaction-runtime-context.test.ts (path-d outlier on openai-codex-routing)                                        |
| C6 — frozen-tree reverse-clobber | Reject PRH bytes when they == ANCESTOR && UPS evolved    | Applies to the 43 Gate-2 FAILs (PRH carries ANC blob; UPS evolved; alt absorbed forward)                                      |

Every cure-decision in ce144d00c2 maps to one of these 6 rules. No rule conflict; no ambiguous cure-direction.

---

## Lane-A independent confirmation summary

| Item from cael-overnight                                  | Lane-A re-verification                              | Agreement?                        |
| --------------------------------------------------------- | --------------------------------------------------- | --------------------------------- |
| 110 SAFE-NEW (PR-delta absent in upstream)                | 110 SAFE-NEW on current upstream too                | EXACT-MATCH ✓                     |
| alt-path 109/110 PRESENT                                  | 109/110 PRESENT                                     | EXACT-MATCH ✓                     |
| alt-path 108/110 byte-IDENT                               | 108/110 byte-IDENT                                  | EXACT-MATCH ✓                     |
| 1 ABSENT = skill-tool-dispatch.runtime.ts                 | confirmed                                           | EXACT-MATCH ✓                     |
| 1 DIFF = task-flow-registry.store.sqlite.chain-id.test.ts | confirmed; older-API form, internally coherent      | EXACT-MATCH ✓                     |
| 7-file divergence matrix                                  | confirmed; ce144 carries alt's resolution for all 7 | EXACT-MATCH ✓                     |
| FROZEN-STALE=0 on ce144 at cael-pin                       | confirmed                                           | EXACT-MATCH ✓                     |
| MIXED-CLOBBER=0 PASS claim (upstream digest)              | actual: MIXED-CLOBBER=4 at cael-pin (small)         | minor correction — see note below |

**Note on MIXED-CLOBBER=0 vs MIXED-CLOBBER=4:** the "MIXED-CLOBBER=0 PASS" framing did not actually appear in cael's lane-AP-substrate/STATUS.md; STATUS.md correctly does not claim MIXED-CLOBBER=0. The "=0 PASS" framing appears to be inflation in inter-lane handoff (upstream digest). Cael measured 4 small MIXED-CLOBBER residuals at cael-pin (1-3 dropped lines each); this is below the threshold cael chose to surface as a cohort-action-item.

**Reconciliation:** the load-bearing invariant — **FROZEN-STALE=0** — is correct. The MIXED-CLOBBER residuals at cael-pin (4 files, 1-3 lines each) are below cohort-action threshold. The MIXED-CLOBBER residuals at current upstream (94 files; 4 cael-pin + 60 cured-at-pin-but-re-flagged-by-fresh-drift + 30 brand-new) are pure post-pin upstream drift, not Lane-A debt.
