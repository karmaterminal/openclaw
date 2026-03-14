# Delayed Delegate Reservations Hard Target

Status: working implementation target for the remaining continuation partials.

Scope:

- complete the delayed `CONTINUE_DELEGATE` / `continue_delegate` semantics
- eliminate burned hops for delayed delegates
- keep current non-durable timer behavior intact
- do not broaden into durable timers / restart recovery in this pass

Why this exists:

- `continuationChainCount` is currently overloaded
  - it tracks accepted chain-hop labels
  - it also implicitly reserves future delayed hops
- that conflation causes the remaining partials:
  - delayed delegates can consume chain capacity before they spawn
  - cancelled / rejected / failed delayed delegates can leave chain accounting in an inconsistent state

## Decision

Use an explicit delayed-reservation model, but keep it in memory for this pass.

Reason:

- delayed timers are already intentionally non-durable
- persisting delayed reservations to `SessionEntry` without durable timer rehydration would leave stale state after restart
- an in-memory reservation store matches the current timer durability contract while still fixing the chain-accounting bug completely

## Invariants

1. `SessionEntry.continuationChainCount` means the highest accepted chain-hop label in the current chain.
2. Delayed delegate reservations are tracked separately from accepted hop labels.
3. Admission checks use the highest allocated hop label:
   - `max(continuationChainCount, highestOutstandingReservation.plannedHop)`
4. Immediate delegates:
   - allocate the next hop label from the highest currently allocated hop
   - persist `continuationChainCount` only after `spawnSubagentDirect(...)` returns `status === "accepted"`
5. Delayed delegates:
   - reserve the next hop label immediately
   - do not persist that hop label onto `continuationChainCount` until timer fire returns `status === "accepted"`
6. Cancelled / rejected / failed delayed delegates:
   - release the reservation
   - do not advance `continuationChainCount` unless a later accepted hop already moved past them
7. External input preemption clears:
   - delegate-pending flags
   - delayed reservations for that session
8. `continuationChainTokens` remain real spent cost, not reserved future cost.
   - current-turn parent tokens are still counted when the delegate is scheduled
   - only accepted-hop persistence is deferred

## Storage Model

Primary file:

- `src/auto-reply/continuation-delegate-store.ts`

Add:

```ts
export interface DelayedContinuationReservation {
  id: string;
  source: "bracket" | "tool";
  task: string;
  createdAt: number;
  fireAt: number;
  generation: number;
  plannedHop: number;
  silent?: boolean;
  silentWake?: boolean;
}
```

Add a module-level map:

```ts
const delayedReservations = new Map<string, DelayedContinuationReservation[]>();
```

Required helpers:

- `addDelayedContinuationReservation(sessionKey, reservation)`
- `listDelayedContinuationReservations(sessionKey)`
- `delayedContinuationReservationCount(sessionKey)`
- `takeDelayedContinuationReservation(sessionKey, reservationId)`
- `removeDelayedContinuationReservation(sessionKey, reservationId)`
- `clearDelayedContinuationReservations(sessionKey)`

Behavior rules:

- order is append-only / FIFO by `createdAt`
- `plannedHop` is assigned at scheduling time
- timer fire removes exactly one reservation by `id`
- reservation removal must be idempotent

## Agent Runner Target

Primary file:

- `src/auto-reply/reply/agent-runner.ts`

### Shared scheduling math

Wherever delayed delegates are admitted, calculate:

```ts
const acceptedHop = activeSessionEntry?.continuationChainCount ?? 0;
const highestReservedHop = highestDelayedContinuationReservationHop(sessionKey);
const allocatedHop = Math.max(acceptedHop, highestReservedHop);
```

Use `allocatedHop` for:

- `maxChainLength` admission
- computing `plannedHop`

Do not use `continuationChainCount + reservationCount`; it over-allocates once lower delayed hops coexist with later accepted higher hops.

### Bracket delegate path

Immediate delegate (`delayMs <= 0`):

- current behavior target:
  - `spawnSubagentDirect(...)`
  - if accepted:
    - persist `continuationChainCount = max(existingAcceptedHop, plannedHop)`
  - else:
    - do not persist hop increment

Delayed delegate (`delayMs > 0`):

- create reservation with:
  - `source: "bracket"`
  - `plannedHop`
  - `generation`
  - `fireAt`
- schedule timer
- do not persist accepted hop increment yet

Timer fire:

- load/remove reservation by `id`
- if reservation missing: no-op
- recompute current generation drift
- if drift exceeds tolerance:
  - do not spawn
  - reservation is already removed
  - clear delegate-pending if no remaining in-flight delegates
- else call `spawnSubagentDirect(...)`
- if accepted:
  - persist `continuationChainCount = max(existingAcceptedHop, reservation.plannedHop)`
- else:
  - no hop increment

### Tool delegate path

Exact same semantics as bracket delayed delegates, but reservation source is `"tool"`.

Important:

- `currentChainCount` in the tool loop must stop being used as a fake accepted counter for delayed delegates
- for delayed tool delegates, only the reservation store moves immediately
- accepted-hop persistence moves only on timer fire success

### Cancel / reset paths

`cancelContinuationTimer(...)` must also call:

- `clearDelayedContinuationReservations(sessionKey)`

External non-heartbeat turn reset in `runReplyAgent(...)` must leave no stale delayed reservations behind.

### Finally blocks

`finally` cleanup in `runReplyAgent(...)` must not erase active delayed reservations.

Safe rule:

- continue clearing:
  - pending immediate delegates
  - staged post-compaction delegates
- do not clear delayed reservations in the generic `finally`

## Delegate-Pending Semantics

Existing delegate-pending flags can remain, but the clearing condition becomes:

- clear on spawn failure/rejection/cancel only when that session no longer has any outstanding delayed reservations that still represent future delegate completions

Minimum safe helper shape:

- `hasOutstandingDelayedReservations(sessionKey)`

Then:

- timer cancel / failure path can call:
  - `if (!hasOutstandingDelayedReservations(sessionKey)) clearDelegatePending(sessionKey);`

This avoids clearing the flag too early when multiple delayed delegates exist for the same session.

## Continue Delegate Tool

Primary file:

- `src/agents/tools/continue-delegate-tool.ts`

Current per-turn `maxDelegatesPerTurn` logic stays per-turn.

No cross-turn reservation check belongs here.

Optional improvement only if needed:

- when reporting `delegateIndex`, continue using this-turn queue depth
- do not try to include cross-turn delayed reservations in the tool return text

## Explicit Non-Goals For This Pass

- no durable timer persistence / restart rehydration
- no change to `pendingPostCompactionDelegates` durability model
- no attempt to persist delayed reservations to `SessionEntry`
- no change to descendant chain-hop scheduling in `src/agents/subagent-announce.ts`
  - that path uses in-band hop prefixes and is not the remaining accepted-hop bug we are targeting here

## Test Contract

Primary test file:

- `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`

Must add or update tests for:

1. delayed bracket delegate does not increment `continuationChainCount` before timer fire
2. delayed bracket delegate increments `continuationChainCount` after accepted timer fire
3. delayed bracket delegate cancelled by generation drift leaves accepted hop count unchanged
4. delayed bracket delegate rejected/failed at timer fire leaves accepted hop count unchanged
5. delayed tool delegate does not increment accepted hop count before timer fire
6. delayed tool delegate increments accepted hop count after accepted timer fire
7. delayed tool delegate cancelled/rejected/failed leaves accepted hop count unchanged
8. delayed reservations count against `maxChainLength` for later turns before they fire
9. external input reset clears delayed reservations
10. `finally` cleanup does not erase delayed reservations that should remain armed
11. later immediate delegates allocate from the highest outstanding hop label, not `accepted + reservationCount`

Secondary store test file:

- `src/auto-reply/continuation-delegate-store.test.ts`

Must add:

- add/list/remove/take/count/clear reservation behavior
- idempotent removal
- per-session isolation

## Acceptance Criteria

The implementation is complete only when all of the following are true:

1. `continuationChainCount` means highest accepted hop label in all delayed delegate paths.
2. No delayed delegate path persists an accepted hop before spawn acceptance.
3. Delayed reservation admission uses the highest allocated hop label, not `accepted + reservationCount`.
4. Cancelling or failing a delayed delegate releases capacity.
5. A later successful delayed delegate timer increments accepted hop count exactly once.
6. `cancelContinuationTimer(...)` clears delayed reservations.
7. Generic `finally` cleanup no longer drops armed delayed reservations.
8. Focused tests and type-check pass.

## Verification Commands

Minimum:

```bash
pnpm vitest run src/auto-reply/continuation-delegate-store.test.ts
pnpm vitest run src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts
npx tsc --noEmit
```

Broader confidence:

```bash
pnpm vitest run --config vitest.e2e.config.ts src/agents/subagent-announce.format.e2e.test.ts
pnpm vitest run src/infra/heartbeat-reason.test.ts src/agents/system-prompt.test.ts
```

## Implementation Order

1. Add reservation types/helpers in `src/auto-reply/continuation-delegate-store.ts`
2. Add reservation store tests
3. Switch `agent-runner.ts` delayed bracket path to reservations
4. Switch `agent-runner.ts` delayed tool path to reservations
5. Extend cancel/reset paths to clear reservations
6. Fix finally-cleanup interaction
7. Add/adjust agent-runner regression tests
8. Run focused verification

## RFC Alignment Checklist

Target RFC:

- `docs/design/continue-work-signal-v2.md`

The RFC must be updated in the same pass as the implementation. These are the concrete deltas required.

### 1. Clarify accepted hops vs delayed reservations

Where the RFC currently treats `continuationChainCount` as the chain-depth source for delayed delegate scheduling, change the language to:

- `continuationChainCount` = highest accepted hop label only
- delayed delegates reserve future hop labels in a separate reservation store until timer fire
- `maxChainLength` admission for delayed delegates uses the highest allocated hop label:
  - `max(continuationChainCount, highestOutstandingReservation.plannedHop)`

Sections likely affected:

- the main delegate dispatch walkthrough
- the `continue_delegate` architecture section
- the chain semantics section

### 2. Replace any implied “schedule == hop increment” wording

Any wording like:

- “chain state is persisted before the timer”
- “delegate scheduling increments chain count”
- “turn N is recorded when the timer is set”

must become:

- reservation created at schedule time
- accepted-hop persistence happens only after `spawnSubagentDirect(...)` returns `status === "accepted"`
- later immediate delegates allocate from the highest outstanding hop label, not from `accepted + reservationCount`

### 3. Update volatile-state description

The RFC already says delayed delegate state is process-scoped. After the model change, make that explicit for:

- delayed timer callbacks
- delayed reservation store
- delegate-pending flags

Add a sentence that this is intentional because timers themselves are still non-durable.

### 4. Keep post-compaction delegates separate

The RFC must continue to distinguish:

- delayed delegate reservations: process-scoped, timer-backed, not persisted
- `pendingPostCompactionDelegates`: persisted on `SessionEntry`, lifecycle-backed

Do not blur these into one mechanism in the prose.

### 5. Update “two doors, one room” architecture wording

Current RFC text says tool delegates flow through the same chain tracking as bracket signals. Keep that, but add:

- delayed bracket/tool delegates converge on the same reservation scheduler
- immediate delegates bypass reservations
- accepted-hop accounting is shared, reservation storage is separate from accepted-hop persistence

### 6. Update observability examples

If the implementation adds reservation-specific logs, update the RFC examples/tables accordingly.

If no new logs are added, at minimum revise the prose so the observed lifecycle becomes:

- tool/bracket enqueue
- reservation created
- timer fired or cancelled
- spawn accepted/rejected

instead of implying a single “scheduled == spawned” transition.

### 7. Preserve non-goals

The RFC should explicitly keep these out of scope for this pass:

- durable timer persistence
- restart rehydration for delayed delegates
- changing subagent chain-hop task-prefix semantics

### 8. Acceptance statement for the RFC

After the code lands, the RFC should be true under source inspection for all of the following:

- delayed delegate scheduling does not advance persisted accepted-hop state
- accepted-hop persistence happens only on accepted spawn
- delayed reservations count against future `maxChainLength` admission through highest-allocated-hop math
- delayed reservation state is process-scoped, not persisted on `SessionEntry`
