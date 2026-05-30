# Cohort-action-items resolved — Lane A (PR #85651 cure-n8)

Independent byte-walk + verdict for each of cael-overnight's 5 routed items. Format per item:
**Q** (cael's question) → **A** (lane-A verdict) → **Evidence** (byte-receipts / `git rev-parse` / `git diff`) → **Cohort-action** (what cohort should do with this).

---

## HIGH-1 — Re-validate "37-file gap"

**Q (cael):** Independently re-confirm the "57%/37-file gap" cohort headline on this worktree at-dispatch using current `upstream/main`, not cael's pin.

**A (lane-A):** **NOT REPRODUCIBLE at blob level on current upstream `6399b6a4`.** The headline is a measurement artifact, not a feature gap.

**Evidence:**

```
PR-delta files (b474..fc337f05d6):                   583
SAFE-NEW (absent from current upstream 6399b6a4):    110
alt-path 5d127388df coverage on 110:
  PRESENT (alt has the file at-blob):                109
  byte-IDENTICAL to PRH blob:                        108
  ABSENT (alt does not have the file):                 1   src/auto-reply/reply/skill-tool-dispatch.runtime.ts  (architecturally superseded — see MED-3.b)
  DIFF (alt has it but different blob):                1   src/tasks/task-flow-registry.store.sqlite.chain-id.test.ts (alt uses older API; PRH uses PR-local refactor requiring NEW helper task-flow-registry.paths.ts — alt is internally coherent)
path-d bd328fadd6 coverage on 110:
  PRESENT=109 / IDENT=109 / ABSENT=1
```

EXACT match to cael's pin-time count of 110 SAFE-NEW. Re-validation reproduces cael's coverage matrix entirely.

**Cohort-action:** Strike the "57%/37-gap" headline from cohort substrate. The actual coverage is **≈99% feature-complete** with 1 architecture-supersession (cured by upstream's `dispatch-acp-*` refactor — symbol moved to `src/skills/runtime/tool-dispatch.ts`, not lost) and 1 internally-coherent older-API form (lane-A note: when this PR finally lands, the cohort may want to follow-on with the PR-local `task-flow-registry.paths.ts` refactor as a separate PR, but that's not load-bearing for this cure cycle).

---

## HIGH-2.a — `compact.queued.ts` (alt==upstream)

**Q (cael):** Forward-refactor-superset (benign — alt absorbed upstream's evolution while PRH froze it) vs alt-path feature-drop (regression — alt missed PRH content)?

**A (lane-A):** **BENIGN forward-refactor-superset.** PRH's edit is a minor 4-line frozen edit; upstream evolved 100 lines independently; alt correctly carries the upstream-evolved form.

**Evidence:**

| ref                         | blob       | delta-vs-b474                                             |
| --------------------------- | ---------- | --------------------------------------------------------- |
| b474 (ANC)                  | (baseline) | —                                                         |
| fc337f05d6                  | (PRH)      | +1/-3 (4 lines, frozen edit)                              |
| 4291e3277 (UPS-at-cael-pin) | (UPS)      | +82/-18 (100 lines, harness/runtime selection enrichment) |
| 5d127388df (ALT)            | == UPS     | absorbed upstream's evolved form                          |
| bd328fadd6 (PATHD)          | == PRH     | preserved ancestor's near-frozen form                     |

PRH's tiny 4-line edit didn't touch the lines upstream evolved. Alt's choice to absorb upstream-forward IS the cure-direction; path-d's choice to preserve PRH's near-frozen form is the reverse-clobber (loses 100 lines of upstream).

**Cohort-action:** Adopt alt's form (already in ce144). No further action.

---

## HIGH-2.b — `compaction-runtime-context.test.ts` (alt==upstream)

**Q (cael):** Same question as 2.a for this file.

**A (lane-A):** **BENIGN architectural convergence between PRH-intent and upstream.** Path-d is the OUTLIER here (preserves the ancestor's openai-codex-routing design that BOTH PRH-intent and upstream rejected).

**Evidence:**

```
b474 (ANC): had 75+ lines of openai-codex-routing tests asserting Codex auth should route to runtime provider catalog
fc337f05d6 (PRH): DELETES 75 lines of openai-codex-routing tests (intent: don't route Codex auth to runtime provider; trust dispatch-time auth)
4291e3277 (UPS at cael-pin) (independent evolution after b474): independently arrives at the same intent via #86373 fix; re-adds 10 NEW tests asserting "stay on canonical openai" (= don't route to runtime provider) — OPPOSITE direction from the b474 design that PRH deleted
5d127388df (ALT) == UPS: absorbed upstream's #86373 form
bd328fadd6 (PATHD): preserves b474's openai-codex-routing design (the design BOTH PRH-intent and upstream rejected)
```

This is a textbook architectural convergence: two independent refs (PRH-intent + upstream) reached the same design conclusion via different paths. Alt encodes the convergence; path-d preserves the rejected ancestor.

**Cohort-action:** Adopt alt's form (already in ce144). Path-d's form would re-introduce the rejected ancestor design — this is the strongest single piece of evidence that **path-d's blind-am construction is unsafe as a cure-source for contested files**, even when it converges with PRH at-blob (because here PRH and path-d disagree, and path-d sides with the rejected ancestor).

---

## MED-3.a — `compact.ts` (all-4-differ)

**Q (cael):** 3-way resolve `compact.ts` where PRH, ANC, UPS, ALT, PATHD all differ.

**A (lane-A):** **alt is the correct cure**, modulo a single comment-word delta vs path-d (both lanes effectively converge).

**Evidence:**

```
git diff ALT:src/agents/embedded-agent-runner/compact.ts PATHD:src/agents/embedded-agent-runner/compact.ts
→ Single delta: comment word
  ALT:   "// harness/context-window policy"
  PATHD: "// context-window policy"
```

Both ALT and PATHD carry the feature substrate (`createCompactionDiagId` local definition + upstream's policy evolution). The "all-4-differ" framing overstates the delta: ALT ≈ PATHD here; the meaningful disagreement is ALT/PATHD ≠ PRH ≠ UPS.

**ce144's adoption of ALT is correct:** carries feature substrate (`createCompactionDiagId` local) + carries upstream's policy evolution + matches path-d modulo whitespace-class comment-word.

**Cohort-action:** Adopt alt's form (already in ce144). Optional: cohort may want to normalize the comment-word to match path-d's "context-window policy" (1-word delete) — pure cosmetic, no functional impact.

---

## MED-3.b — `skill-tool-dispatch.runtime.ts` under `dispatch-acp-*` refactor

**Q (cael):** Does the feature still need this seam under upstream's `dispatch-acp-*` refactor?

**A (lane-A):** **NO — the symbol MOVED, it did not get dropped.** Cure = follow upstream (already done in ce144).

**Evidence:**

```
git ls-tree -r --name-only b474          | grep skill-tool-dispatch
→ src/auto-reply/reply/skill-tool-dispatch.runtime.ts          (blob 62237b0c — ancestor had it at this path)

git ls-tree -r --name-only fc337f05d6    | grep skill-tool-dispatch
→ src/auto-reply/reply/skill-tool-dispatch.runtime.ts          (PRH carries the b474 version essentially unchanged)

git ls-tree -r --name-only 6399b6a4      | grep -E "(skill-tool-dispatch|tool-dispatch)"
→ src/skills/runtime/tool-dispatch.ts                          (upstream's dispatch-acp-* refactor MOVED the symbol here)
→ src/skills/runtime/dispatch-acp-tool.ts
→ ... (12+ files in the new architecture)

git ls-tree -r --name-only ce144d00c2    | grep -E "(skill-tool-dispatch|tool-dispatch)"
→ src/skills/runtime/tool-dispatch.ts                          (ce144 carries upstream's MOVED file)
  (and NO src/auto-reply/reply/skill-tool-dispatch.runtime.ts — correctly omitted)

# Symbol presence proof:
grep -n "export function resolveSkillDispatchTools" src/skills/runtime/tool-dispatch.ts
→ found — same export name PRH had, now at the new path

# Caller still works:
git rev-parse ce144d00c2:src/auto-reply/reply/get-reply-inline-actions.ts
→ blob 1fc469341b   (== upstream/main:src/auto-reply/reply/get-reply-inline-actions.ts IDENT)
# This file's `loadSkillToolDispatchRuntime()` loader resolves the symbol from the new src/skills/runtime/tool-dispatch.ts path.
```

The file's omission is not a regression — it's a **module-relocation** by upstream that ce144 correctly absorbed. The feature seam continues to work; the only difference is the file path.

**Cohort-action:** No action. Already cured by absorbing upstream's `dispatch-acp-*` refactor in ce144. This is the strongest demonstration of alt-path's "absorb upstream forward correctly" cure-mode over path-d's "blind-am replay" mode (which would have re-introduced the orphaned `skill-tool-dispatch.runtime.ts` at the old path while ALSO carrying upstream's new `src/skills/runtime/tool-dispatch.ts`, producing a duplicate-symbol conflict).

---

## LOW-4 — Adopt 3 alt/path-d CONVERGE compaction resolutions

**Q (cael):** Adopt the 3 CONVERGE compaction resolutions (alt==pathd, two-lane independent confirmation).

**A (lane-A):** **PRE-APPLIED in ce144.** All 3 files carry ce144==alt==pathd byte-IDENT blob.

**Evidence:**

| file                                                        | ce144 blob                     | alt blob                | pathd blob                | match?              |
| ----------------------------------------------------------- | ------------------------------ | ----------------------- | ------------------------- | ------------------- |
| `src/agents/agent-hooks/compaction-safeguard.ts`            | (`git rev-parse ce144d00c2:f`) | (`git rev-parse ALT:f`) | (`git rev-parse PATHD:f`) | ce144==alt==pathd ✓ |
| `src/agents/embedded-agent-runner/compact.hooks.harness.ts` | "                              | "                       | "                         | ce144==alt==pathd ✓ |
| `src/agents/embedded-agent-runner/compact.types.ts`         | "                              | "                       | "                         | ce144==alt==pathd ✓ |

(Verified via byte-walk during lane-A §2; per-file blob SHAs available in `gate-out/classification.tsv` and `cure-decisions.tsv` from cael's substrate.)

**Cohort-action:** No action. Already in ce144.

---

## Summary table — cohort-action-item status

| Item     | Severity | Lane-A verdict                                    | Code-mutation needed? | Cohort-action                                               |
| -------- | -------- | ------------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| HIGH-1   | HIGH     | NOT REPRODUCIBLE                                  | No                    | Strike "37-gap" headline                                    |
| HIGH-2.a | HIGH     | BENIGN forward-superset                           | No                    | Adopt alt (done)                                            |
| HIGH-2.b | HIGH     | BENIGN architectural convergence (path-d outlier) | No                    | Adopt alt (done); flag path-d as unsafe for contested files |
| MED-3.a  | MED      | alt is correct cure                               | No                    | Adopt alt (done); optional cosmetic comment normalization   |
| MED-3.b  | MED      | Symbol MOVED, not dropped                         | No                    | Already cured by following upstream                         |
| LOW-4    | LOW      | Pre-applied                                       | No                    | None                                                        |

**Net: zero code-mutations required. Lane-A candidate HEAD = ce144d00c2 (lane base, unchanged).**
