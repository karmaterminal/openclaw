# #990 Continuation-Storm Cure — Design Pseudo-Code Spec (🌊 outcome-model/detection owner)

_Per figs's dawn-GO (2026-06-11 07:14 PDT): "scratch those comments/predicates + design notes into pseudo-code at the very least, so you can plan to concrete and implement... build this policy in tests first... ideally with code agents (PRINCE_CODE_AGENTS runbook, tmux steerable pattern)." Design-spec deliverable to hand to 🌿's implementation-drive. Source: `#990 issuecomment-4677664820` (outcome-model lock) + `4678004791` (locus-3 anchor). Base: `6168d1f3b5` (Pillar-0 #994 MERGED)._

_NOT a temporary stub — the real row-data-structure + the rigging/flow figs asked to see. Tests-first: §5 written RED before implementation._

---

## §1 — Row data-structure (PendingContinuationWork, the classify-once row)

```
// work-store.ts — persisted row, classified ONCE, read by FOUR consumers.
interface PendingContinuationWork {
  flowId: string;
  sessionKey: string;            // flow's own session (main OR subagent-continuation key)
  parentRunId?: string;          // PRESENT for delegate-flows (spawning subagent-run); ABSENT for same-session continue_work.
                                 //   THE delegate-flow-gate discriminator. byte: work-store.ts:58 / zod :38, threaded :97/:120 — exists, NO new field.
  // TERMINAL-AXIS (succeeded key): PRESENT=terminal, ABSENT=in-flight (absence legible-as-state → curable storm)
  succeeded?: { point: 'optimal'; durability: 'durable'; };  // marked after-delivery before persist/restart gap (locus-3), durable BEFORE restart-window
  // REASON-AXIS (retryCount): busy-skip never increments (skip(0)→protect); drove-then-threw increments (threw(n)→bound)
  retryCount: number;
  // escape-valve (RATE, not a separate total-cap):
  busySkipCount: number;         // exp-backoff re-arm counter (Pillar-0 MERGED), distinct from retryCount; zeroed on markPendingWorkTurnGranted
  dueAt?: number;                // exp-backoff next-arm (computeBusySkipBackoffMs)
  cancelRequestedAt?: number;    // :259-harden: cancel-requested-not-yet-terminal → never consumed (crash-boundary safe)
}
```

Two-axis ternary (classify ONCE): `{terminal|in-flight} × {skip(0)→protect | threw(n)→bound}`
→ `ran` (terminal) / `skipped-busy` (in-flight×skip(0), legit defer) / `interrupted` (in-flight×threw(n) OR process-died→running→restart-gap)

## §2 — Four readers (same row, classify once)

1. **mark-LOCATION** (`markPendingWorkTurnGranted`) — WRITES succeeded {optimal,durable} + zeroes busySkipCount
2. **`:259` requeue read-guard** — reads terminal → gates out of re-consume (closes restart-gap dup); skips succeeded/cancelled/cancel_requested_at
3. **busy-skip discriminator (`:360`)** — reads BOTH axes → in-flight×skip(0)=bucket-1-protect; in-flight×threw(n)=bucket-2-bound
4. **escape-valve (`:348`/`:381`)** — exp-backoff caps RATE (storm-killer); uncertain→quiesce is the racy-read backstop IN-BRANCH (NO separate cap)

## §3 — Bucket-1 parent-lineage sub-read (orphan-reap, the ONLY new operation)

```
// At :348 (the SAME branch Pillar-0 exp-backoff touches — code-locality, codes here):
function bucket1Verdict(work): 'reap' | 'rate-cap-forever' {
  if (work.parentRunId == null) return 'rate-cap-forever';   // delegate-flow-gate FIRST (🕯 #952-guard): same-session never reaps
  const parentState = readParentLivenessFromRegistry(work.sessionKey);  // READ-TIME JOIN (not persisted — liveness mutates post-classify)
  //   isSubagentSessionRunActive(work.sessionKey): synchronous in-process subagentRuns Map-read, no async/IO
  if (parentState === 'confident-terminal') return 'reap';   // orphan: parent gone, can-never-succeed → CULL
  return 'rate-cap-forever';                                 // alive OR uncertain → quiesce (in-branch backstop)
}
// ASYMMETRIC-ERROR-COST: wrongly-cull-busy = #952 unrecoverable; wrongly-park-orphan = harmless zombie. uncertain→quiesce. Wrongful-reap NEVER.
```

Reconcile-path (racy window, byte-pinned `a437ca7`): `isStaleUnendedSubagentRun` (`subagent-run-liveness.ts:31`). `markSubagentRunTerminated` writes endedAt SYNCHRONOUSLY on explicit-termination (no lag). Lag ONLY for orphan-case (driver died WITHOUT marking) → reads-LIVE until `now - startedAt > resolveStaleCutoffMs`. So: staleness-window → uncertain → rate-cap (Pillar-0 trickle), NOT reap; post-cutoff → confident-terminal → reap. fail-safe-to-quiesce.

## §4 — Verdict-fork: one lineage-terminal predicate, THREE operations (🕯 sibling-unification; only CULL is new)

- **session-terminal** | (n/a) | **CULL** in-flight hopeless orphan | **YES — new** (the orphan-reap predicate)
- **process-terminal, marked** | **SKIP** (`:259` read-guard, terminal-DONE) | NO (existing)
- **process-terminal, unmarked (running)** | **RE-DRIVE** (genuinely-undelivered) | NO (existing)

locus-3's durable-mark doesn't ADD skip/re-drive machinery — it makes the existing read-guard's terminal/running read TRUSTWORTHY across the crash (shrinks delivered-but-unmarked window to near-zero).

## §5 — TESTS FIRST (TDD scaffold — write RED before implementing; shows the rigging+flow)

```
// work-dispatch.test.ts (extend existing 35/35 @ 6168d1f3b5):
describe('bucket-1 parent-lineage reap (#990 design-pass)', () => {
  it('same-session continue_work (no parentRunId) NEVER reaps → rate-cap-forever');   // gate guards same-session (#952-safe)
  it('delegate-flow + parent-CONFIDENT-terminal → reap');                             // the orphan cull
  it('delegate-flow + parent-ALIVE → rate-cap-forever');                              // legit defer
  it('delegate-flow + parent-UNCERTAIN/racy → rate-cap-forever (never wrongful-reap)'); // asymmetric-cost safe-default
  it('orphan in staleness-window reads-live → uncertain → rate-cap (not reap)');      // fail-safe-to-quiesce
  it('orphan post-staleness-cutoff → confident-terminal → reap');                     // reap-timing gated
  it('parent-liveness is read-time-JOIN, never persisted (classify-once holds)');
  it('specimen 14b1e6f9: classified in-flight×skip parent-alive THEN parent dies → reap on next read (not stale verdict)');
  it('in-flight×busy at re-arm bound → quiesce-not-fail (retryCount stays 0)');
  it('fail-cap (MAX_TRANSIENT_ERROR_RETRY_COUNT) ONLY ever interrupted, never in-flight-waiting');
  it('confidence-gate at bound: persistently-uncertain → quiesce-UNBOUNDED, never reap-on-bound (#952 back-door closed)');
});
describe('locus-3 durable-mark restart-gap (#990 PR-3, anchor 4678004791)', () => {
  it('mark optimal+durable BEFORE restart-window → :259 reads terminal on reboot → SKIP (no dup)');
  it('process-died delivered-but-unmarked (near-zero window) → running on reboot → RE-DRIVE');
});
```

## §6 — Config exposure (openclaw.json, per figs → 🌿's lane)

Tunables to surface (per-environment knobs): busy-skip exp-backoff bounds (min/max/factor — `computeBusySkipBackoffMs`), the confidence-gate staleness-cutoff (`resolveStaleCutoffMs`), give-up rate-cap params. NOT the safety-invariants (uncertain→quiesce, never-wrongful-reap, fail-cap-interrupted-only are fixed, not configurable).

## §7 — Implementation plan (→ 🌿's drive, code-agent/tmux steerable)

1. Tests-first: land the §5 RED scaffold.
2. Code the bucket-1 reap-verdict (§3) + delegate-flow-gate at `:348` (the one new operation).
3. locus-3 durable-mark (§4, PR-3) — the write-axis.
4. Config exposure (§6).
   PRINCE_CODE_AGENTS runbook: worktree (`/tmp/oc-990-*`, NOT live-runtime), durable journal, steerable via tmux. Gate-3 prepush-ci: cael-DGX + ronan-DGX 2-run (my staged fire-task). Driver: 🌿 single-drives; nothing destructive to `narrow-surgery-tight` (PR #85651 upstream) till figs's Gate-5 button.

— 🌊 (design-spec from `4677664820`; hand to 🌿's drive)
