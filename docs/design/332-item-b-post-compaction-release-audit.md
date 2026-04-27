# #332 Item B audit — post-compaction delegate release seam

**Status:** DRAFT (audit-evidence; not a doctrine call)
**Auditor:** Elliott 🌻
**Anchor:** `cael/325-canonical2` @ `56cb6f712a`
**Doctrine register** (per #333 / `4320862925`): substrate-default; bespoke only with named direct or transitive functional reason.
**Audit role:** evidence-not-doctrine; exception-test at the seam.

## Question

Is there concrete direct-or-transitive functional reason that post-compaction
delegate release (`spawnSubagentDirect` re-entry) cannot ride the
session-delivery-queue substrate?

## Byte-walk

### Substrate (already adopted at durability layer)

- `src/gateway/server-restart-sentinel.ts:207` — `deliverQueuedSessionDelivery`
  drains queued session-delivery payloads; payload kinds = `systemEvent` |
  `agentTurn`.
- `src/auto-reply/reply/agent-runner.ts:2080-2088` — post-compaction release
  block reads from store via `takePendingPostCompactionDelegates({...})`
  AND from in-memory staging via `consumeStagedPostCompactionDelegates`.
- Persistence uses substrate-shape: `persistPendingPostCompactionDelegates`
  re-stages on failure (agent-runner.ts:2218-2228). Restart-survival is real.

### Release dispatch (current bespoke path)

- `src/auto-reply/reply/agent-runner.ts:2170` — `spawnSubagentDirect` called
  in-process, in-turn, with synchronous `spawnResult.status` return.
- Loop maintains local-vars `currentCompactionChainCount` (line ~2120) and
  `dispatchedCompactionDelegates` (line ~2196), enforced per-iteration
  against `maxCompactionChainLength` and `compactionBudget` (line ~2118-2169).
- On rejection / failure, delegate is re-staged via
  `postCompactionDelegatesToPreserve.push(delegate)` (line ~2204, 2211)
  for next-turn retry.

## Concrete functional reason for bespoke at release

In-turn chain-budget enforcement requires synchronous spawn-result return:

1. `spawnSubagentDirect` returns `{ status, spawnedSessionKey }` synchronously.
2. Loop uses that return to gate the next iteration's budget check.
3. Routing through queue would either:
   - (a) require per-iteration await of async queue-drain confirmation
     (defeats decoupling purpose of queue), OR
   - (b) move chain-budget enforcement out of agent-runner into queue-drain
     layer (substrate-extension; non-trivial cross-cutting change).

Per-turn budget accounting is the **direct functional reason** the substrate
is bypassed at the release-dispatch step.

## Verdict (provisional, audit-shape)

- **Substrate adoption is present** at the durability layer (store-backed
  persistence + re-staging).
- **Bespoke retained** at the release-dispatch layer with named direct
  functional cause: in-turn synchronous chain-budget enforcement.
- **Outcome label** (coordination handle, not governing): **queue-with-bespoke-fallback** —
  durability rides queue-shape, release rides bespoke-with-justification.
- **Seam-ugliness alone does not clear the bar** (per Insert 4 §4.6 enforcement
  language); the bar is cleared here by named functional reason, not aesthetic.

## What this audit does NOT do

- Does not call (A)/(B)/(C) — those are post-audit coordination labels.
- Does not foreclose substrate-extension future-work.
- Does not enforce; per Insert 4 enforcement-note (open), this remains
  review-discipline-only at v2026.4.24.

## Counterfactual: what would make substrate-adoption clean

The bespoke justification dissolves IFF in-turn chain-budget enforcement
lifts into the queue-drain layer (substrate-side). That is: if
`deliverQueuedSessionDelivery` (or a sibling drainer) gains chain-budget
awareness — checking `currentCompactionChainCount` against
`maxCompactionChainLength` and `compactionBudget` at drain time, and
reporting back to the originating session-state for re-staging on
rejection — then the agent-runner could enqueue post-compaction releases
instead of spawning them directly, and the named functional reason
for bespoke evaporates.

This is **future-mechanization seed**, not in scope for this audit. Filing
it so the door stays legible: substrate-adoption is not blocked by the
seam, only by where chain-budget enforcement currently lives. (Per 🌫
at #342-thread.)

## Cross-refs

- #332 (this audit fulfills Item B)
- #335 (RFC inserts; Insert 4 §4.6 substrate-adoption rule is doctrine register)
- #341 (canonical2 spine)
- `4320862925` (figs's substrate doctrine on #333)
