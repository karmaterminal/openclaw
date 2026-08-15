# Adversarial review of filed Project 87 ward issues

Reviewer: this lane, against exact `6b09`, causal `cfbb29`, filed #1255–#1259, and `causal-bug-proof` evidence language.
No GitHub/project/product/fleet mutations.

## Findings (accepted)

### F1. #1255 amalgamates two defects

Filed desired contract includes both (a) abandonment retry budget and (b) “exact session-lifecycle rejection reason is preserved.”

Those are different owners:

- budget: `ingress-drain.ts` `onAbandoned` / `resolveIngressFailureDisposition`
- reason: `reply-turn-admission.ts` three-way collapse

Upstream #118873/#118879 do not own the abandonment bypass. Folding (b) into the #1255 PR will either widen the fossil or ship an unproven session-owner guess. **Correction:** keep (b) as a named follow-up; do not block the budget fossil on it.

### F2. “Proven” / “strongest proven” overclaim

#1255: “strongest proven defect.” Graph edge is `EVIDENCES` (source + capped cadence). No published RED receipt, no GREEN/revert closure, no live isolated Gateway proof. Honest claim: **source-localized retry-policy bypass that CHARACTERIZES the desired contract once the fossil is RED**.

#1258: “proves that ingress completion is not delivery completion.” Source proves `completed` is transport-replay terminal. It does **not** prove why Rune was silent.

#1259: correctly says fallback order is proved and the predicate/401 owner is not. Keep that hedge.

### F3. Success-shaped missing evidence

- #1255 says a fossil “is currently running.” Branch `codeagent/silas-abandonment-red-fossil` @ `6f4ef385ea7` exists (test-only). There is no PR, no docs `PROOFS/` row, no captured RED log. “Running” ≠ RED receipt.
- #1256/#1257/#1258/#1259 have no fossils at all.
- #1254 comment’s Silas snapshot (14 attempts, 17-deep backlog) is an earlier window than the causal 42 / 1h46m count. Prefer the later journal window; do not average them.

### F4. Mocked-executor / observer false proof

Zero-payload warning is an **observer** after `runDispatch()` (`execution.ts:85-118`). A unit test that only asserts the warning can go green while finalization still throws. #1256’s required incident-shaped copied-DB replay is the right bar; do not accept a mocked Codex executor that returns `undefined` by construction as incident causality.

#1255’s fossil uses the real drain + temp state DB and calls `lifecycle.onAbandoned()` itself. That is the correct owner-boundary shape. It is **not** an incident-shaped Discord/admission proof. Do not call Silas cured from this fossil alone.

### F5. #1258 implementation note is stale

`completed_metadata_json` already exists and is written when `completeOptions.metadata` is passed (`ingress-queue.ts:1067-1072`). The gap is **callers do not persist a closed, payload-free terminal enum** before payload/metadata wipe. Do not add a second column or bump schema version. AGENTS.md already forbids autonomous schema-version bumps.

### F6. #1256 title can be read as a single cause

“erases rejection reason **and yields** zero visible payload” is the observed same-trace sequence, not a proved inner cause. Any unlabelled `undefined` exit (including missing history at capture `:193`) can produce the generic throw. Repair only after a reason-specific RED.

### F7. #1257 must not inherit #119901

#119901 (open) adds doctor-only `ANALYZE` after compaction. Planner statistics were not read on fleet copies. Treat it as a **candidate intervention**, not the owner fix. Physical corruption (Cael quick-check in the #1254 comment) stays a separate unproven branch.

### F8. Live-fleet mutation risk is correctly gated in prose, weakly in status

All five issues say no live queue/DB/VACUUM/reauth. Good. Project 87 still has parent #1254 in `in_coding_agent`, which invites a worker to “fix the fleet.” Move #1254 to **In Progress** (scribe orchestration). Coding agents get one child issue.

### F9. Continuation trigger

None of the filed bodies blame continuation. Keep it that way. #124176 is yield-specific; fleet traces had zero yield markers. Do not add continuation as a default reproduce step.

### F10. Labels / parent linkage

#1255–#1259 have no labels. Parent #1254 has `bug` + `non-continuation`. Recommend the same labels plus explicit `Closes`/`Child of` language already present. No project field currently stores parent-issue edges (query of that field is unused).

## Corrections applied in this corpus

- Split #1255 desired contract; name session-admission reason as follow-up.
- Downgrade “proven” language to the evidence-language ladder.
- Record Silas fossil as **source present, RED receipt unpublished**.
- Rewrite #1258 proof plan around the existing nullable column.
- Rank #119901 as copy-conditional.
- Keep #121204 out of every treatment PR.
- Recommend swim unused; prince_review only if a prince is actually reviewing.

## What I did not treat as a finding

- Five-way split: correct.
- Discord `deadLetterMinAgeMs: 0` in the Silas fossil: matches `extensions/discord/src/monitor/ingress.ts:552-555`.
- Independence from continuation: correct.
- Mutation gates: directionally correct.
- Not filing Elliott config/reauth or Copilot cleanup as the first issue: correct.

## Residual review risk

If the #1255 coding agent “preserves the session-lifecycle reason” by guessing `recovery-owner-invalidated` without a closed reason code, that is a speculative session-owner repair and should be rejected in review.
