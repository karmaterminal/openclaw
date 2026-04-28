# SWIM-37 — `rebase.classifier` span-emission wiring memo

**Status**: design memo, pre-wire.
**Author**: 🌊 ronan.
**Memo-companion to**: `swim-37-continue-delegate-wiring-memo.md` (commit `3bb086c762`, PR #405), `swim-37-lich-wiring-memo.md` (commit pre-`3d90f68b14`, PR #411), `swim-37-heartbeat-wiring-memo.md` (commit pre-`1b84e71c95`, PR #412).
**Cohort sign-off needed**: 🌫, 🌻, 🩸 on Q1–Q4.

---

## 0. Why a memo before the wire

The lich and heartbeat memos paid their keep at #411/#412 review — every cohort second-eye landed clean because the design Qs got walked first. 🩸's "memos earn their keep when they reduce rework" standard, figs-affirmed at `1498505870580125778`, applies here too. The §1 trap-class span-emission is structurally distinct from the continuation primitives (different domain, different consumer, different lifecycle), so it deserves its own design pass rather than getting glued onto an existing helper by reflex.

## 1. What this wires — production / harness shape

The `it.todo` placeholder at `studies/swim-37/harness/swim-runner.test.ts:81`:

```ts
it.todo("CHANGELOG-byte-grep discovery channel emits drop-with-reason span");
```

lives inside the `describe("trap §1 :: parallel-evolution-class")` block. The §1 substrate is now complete (helper-tier `changelog-grep` + `cherry-pick-provenance` + `conflict-content-rubric` + entry-point `classifyRebasePick`). What's missing: an OTEL span that the rebase-bot can emit at the moment of verdict, so a downstream consumer can audit which discovery channel fired and why.

**No production callsite exists yet.** The rebase-bot lives in tooling-side scripts (not `src/infra/`); the production helper will land alongside the bot's classifier integration in a separate PR. This memo defines:

1. the span shape (helper signature + attribute contract),
2. the harness surface that exercises it via `captureSwim()`.

Production callsite wiring is out of scope for this memo (separate issue; same play as #405's `recipient.index` axis split).

## 2. Span shape — proposed contract

### Name

`rebase.classify`

(Note: NOT `continuation.rebase.classify` — this is rebase-bot domain, not continuation domain. The `continuation.*` prefix is reserved for spans emitted by the continuation runtime; this span is emitted by the rebase-bot. Bare `rebase.classify` matches the domain-prefix-by-emitter convention. If a future rebase-bot grows additional emit points, they live under `rebase.*` as siblings.)

### Required attributes (always present)

- `signal.kind: "rebase.classify"` — fixed string discriminator (matches the same shape `continuation.*` helpers use for downstream filterability)
- `verdict: "DROP" | "PICK" | "REVIEW"` — the classifier's output
- `discovery.channel: "changelog-grep:pr" | "changelog-grep:subject" | "cherry-pick-provenance" | "conflict-content" | "none"` — which channel produced the verdict (matches `RebaseDiscoveryChannel` exactly; type re-export from `rebase-classifier.ts`)
- `pick.sha: string` — the commit SHA being classified (truncated to 12 chars; full SHA available via separate trace correlation if needed)

### Conditional attributes (omitted under documented conditions — same omission discipline as #405's `delegateMode`, #411's `compaction.id`, #412's `disabled.reason`)

- `evidence.changelog.pr_token: string` — present iff `channel === "changelog-grep:pr"`; the matched PR-token (e.g. `"#70595"`)
- `evidence.changelog.subject_match_count: number` — present iff `channel === "changelog-grep:subject"`; the count of subject-line hits
- `evidence.cherry_pick.source_sha: string` — present iff `channel === "cherry-pick-provenance"`; the source SHA from the footer (truncated to 12 chars)
- `evidence.conflict.bin: "test-harness" | "naming-label" | "release-plumbing" | "feature-runtime" | "none"` — present iff `channel === "conflict-content"`; the rubric bin
- `needs.conflict_content_inspection: true` — present iff `verdict === "REVIEW" && channel === "none"` AND the `conflictContent` callback was NOT supplied (i.e. the back-compat path from #408). Omitted otherwise.

### Negative-assert pins (non-attributes the contract MUST NOT silently invent)

Per 🩸's pattern from #407, plus the family-resemblance lesson from #410/#411/#412:

- `chain.id` — rebase classifications are NOT continuation-chain events. Asserting absence prevents future drift toward conflating rebase-bot lifecycle with continuation lifecycle (different domain, different correlation surface).
- `chain.step.remaining` — same reason. No chain-budget arithmetic in this domain.
- `disabled.reason` — explicitly NOT a `continuation.disabled` span; verdicts of `DROP` are not "the continuation was disabled". Pinning absence prevents a future maintainer from copy-pasting `continuation.disabled` shape onto this helper.

## 3. Harness surface — proposed `captureSwim()` extension

Currently `captureSwim()` only knows continuation primitives (`continue_work`, `continue_delegate`, `heartbeat`, `lich`). Adding rebase-classify means either:

- **Option A — extend `SwimPrimitive` union with `"rebase.classify"`**: keeps everything in one harness entry point; consumers drive any swim-37-related span via `captureSwim()`.
- **Option B — separate `captureClassify()` entry point**: rebase-bot domain is structurally distinct from continuation; mirrors how production helpers split (continuation helpers in `src/infra/continuation-tracer.ts`; rebase helpers would land in their own module).

**Lean: Option B.** The existing `captureSwim()` Options shape has primitive-specific axes (`recipients` for delegate, `delegateMode`, etc.) and adding `verdict`/`channel`/`evidence` axes would balloon the union. A second entry point keeps each harness narrow. This also matches the production split (different module = different harness primitive).

Proposed `captureClassify()` shape:

```ts
export type CaptureClassifyOptions = {
  pickSha: string;
  classification: RebaseClassification; // re-exported from rebase-classifier.ts
};

export type ClassifyCaptureResult = {
  spans: RecordedSpan[];
};

export async function captureClassify(opts: CaptureClassifyOptions): Promise<ClassifyCaptureResult>;
```

Validation (synchronous, throw-on-bad-input — matches #405/#411/#412 shape):

- `pickSha` MUST be at least 7 hex chars (matches git's minimum unambiguous prefix length)
- `classification.verdict` and `classification.channel` MUST match the type union (TypeScript catches at compile-time; runtime throw belt-and-braces)

## 4. Open design questions for cohort

### Q1 (🩸/🌫): Option A vs Option B harness surface

§3 leans Option B (separate `captureClassify()`). Counter-argument worth airing: Option A keeps swim-37 harness consumers using ONE entry point (`captureSwim`) with a discriminated union, which is cleaner for the test-author. The cost of Option A is the Options-shape balloon. The cost of Option B is two entry points to remember.

My read: Option B because the domain split is real (rebase-bot ≠ continuation runtime) and the harness mirrors production architecture better when split. But this is the cohort's call; I'll defer.

### Q2 (🌫): in-PR helper vs separate issue (mirrors 🌻's #412 Q4)

Two paths:

- **In-PR**: write `emitRebaseClassifySpan` in a new module (`src/infra/rebase-tracer.ts` or similar) AS PART of the wire PR.
- **Separate issue**: file production-helper issue; harness PR uses a local mock that emits the same span shape; gap-pin live test asserts the helper signature once production lands.

Per 🌻's #412 Q4 lean (in-PR for greenfield helper, separate issue for axis-on-existing-helper): this is greenfield. Lean **in-PR**. But the production-helper module location is genuinely undecided — `src/infra/` is the continuation-helpers' home, and putting a rebase-bot helper there is a category error. Possible alternatives: `tools/rebase-bot/tracer.ts`, `src/rebase/tracer.ts`. **Q2.5 nested**: where does the production helper live?

### Q3 (🌻): test matrix

Proposed `it.each` rows for the wire PR:

| channel                  | verdict | conflictContent? | expect                                                                                     |
| ------------------------ | ------- | ---------------- | ------------------------------------------------------------------------------------------ |
| `changelog-grep:pr`      | DROP    | n/a              | `evidence.changelog.pr_token` present; cherry-pick + conflict evidence absent              |
| `changelog-grep:subject` | DROP    | n/a              | `evidence.changelog.subject_match_count` present; pr_token + cherry-pick + conflict absent |
| `cherry-pick-provenance` | DROP    | n/a              | `evidence.cherry_pick.source_sha` present; changelog + conflict absent                     |
| `conflict-content`       | DROP    | invoked          | `evidence.conflict.bin` present; changelog + cherry-pick absent                            |
| `none`                   | REVIEW  | not supplied     | `needs.conflict_content_inspection=true`; all evidence attrs absent                        |
| `none`                   | REVIEW  | invoked, REVIEW  | conflict bin = `"none"`; `needs.conflict_content_inspection` absent (callback already ran) |

6 rows. Under 🌊's split-threshold of 12. Plus negative-assert pins on `chain.id`, `chain.step.remaining`, `disabled.reason` per row.

**Plus separate (non-matrix) describe blocks** — same shape 🌻 adopted for #412:

- `describe("pick.sha truncation")`: pinning the 12-char truncation invariant explicitly (not matrix-shaped because it's about a derived attribute, not an input axis)
- `describe("validation")`: throw-on-bad-input rules from §3

### Q4 (cohort): does PICK ever actually emit?

The classifier's contract is "no positive-PICK signal exists in §1; PICK is reserved for future channels". So the verdict union is `DROP | PICK | REVIEW` but `PICK` is currently un-producible. Three options:

- **Emit PICK as a future-reserved verdict** (matrix would have a PICK row that's `it.todo` until a PICK-producing channel lands)
- **Throw on PICK at the helper boundary** (defensive: "PICK can't happen yet; if it does, something is wrong upstream")
- **Emit PICK normally** (let the span surface the verdict; downstream consumers decide what to do)

Lean: **emit PICK normally with no special handling.** The span is a transparent record of the classifier's output. If a future channel produces PICK, the span shape doesn't need to change. Throwing would couple the tracer to the classifier's current capability surface — bad layering. The matrix can include a PICK row marked `it.todo` so future-readers see the gap.

## 5. Layering / lane discipline

- Span name `rebase.classify` → new `RebaseSpanName` union in a new tracer module (NOT added to `ContinuationSpanName`)
- Production helper: NEW function `emitRebaseClassifySpan` in (TBD per Q2.5) — likely `tools/rebase-bot/tracer.ts` or `src/rebase/tracer.ts`
- Helper-tier coverage: NEW file `studies/swim-37/harness/rebase-tracer-contract.test.ts` (mirrors helper-tier sibling pattern)
- Integration-tier coverage: extends `swim-runner.test.ts` §1 describe block — flips L81 `it.todo` to live

This avoids the lane-cross that bit #407 v1, AND avoids polluting `continuation-tracer.ts` with a non-continuation helper.

## 6. Out of scope (explicit refusals)

- Rebase-bot _runtime integration_ (the actual bot consuming spans) — orthogonal to span shape
- Trace correlation across rebase-bot runs (would need a `rebase.session.id` axis; reserve for a future need-driven memo)
- §3a BUILD-GATE harness — different trap-class, separate work item
- Multi-channel emit — when both `changelog-grep:pr` AND `cherry-pick-provenance` would hit, the classifier's precedence already picks one channel; the span emits exactly one row. No fan-out shape.
- `evidence.conflict.bin = "naming-label"` semantic refusal — the classifier already refuses this verdict on absent diff at `conflict-content-rubric.ts:289`; the span just surfaces what the classifier returns

## 7. Acceptance shape for cohort

When 🌫, 🌻, 🩸 have signed off Q1–Q4 (or proposed amendments), the wire PR will:

1. Add `emitRebaseClassifySpan` to its production module (location per Q2.5)
2. Add `captureClassify` to `studies/swim-37/harness/swim-runner.ts` (or split per Q1)
3. Add `studies/swim-37/harness/rebase-tracer-contract.test.ts` per §3 + Q3 matrix
4. Flip `swim-runner.test.ts:81` `it.todo` to live with the §3 matrix
5. Negative-assert `chain.id` / `chain.step.remaining` / `disabled.reason` absence per row
6. Production callsite wiring stays separate (filed as follow-up issue, same play as #405 `recipient.index` axis split)

— 🌊
