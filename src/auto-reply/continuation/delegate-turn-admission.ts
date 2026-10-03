/**
 * Ephemeral per-provider-turn admission budget for `continue_delegate`.
 *
 * `maxDelegatesPerTurn` is a per-turn cap, but the embedded runner builds the
 * OpenClaw tool list once per agent run, so a closure counter on the tool would
 * accumulate across every assistant turn in that run and wrongly reject a later
 * turn's first delegate. The budget therefore lives here, keyed by session, and
 * is reset once for the actual provider turn before the embedded run starts
 * (not on assistant stream item changes) so each turn starts fresh while still
 * capping fan-out within a single turn.
 *
 * This is deliberately volatile: the budget is turn-scoped rate state, not
 * durable delegate substrate (that stays in the custody-backed delegate-store).
 * A lost budget on restart simply means the next turn starts at zero, which is
 * the correct post-restart state.
 */

type DelegateTurnBudget = { scheduled: number };

const delegatesScheduledThisTurn = new Map<string, DelegateTurnBudget>();

/** A held per-turn slot. Release it if the delegate is not durably accepted. */
export type ContinueDelegateTurnSlot = {
  /** 1-based position of this delegate among the turn's admitted delegates. */
  index: number;
  release: () => void;
};

export type ContinueDelegateTurnReservation =
  | { admitted: true; slot: ContinueDelegateTurnSlot }
  | { admitted: false; scheduled: number };

/**
 * Reset a session's per-turn delegate budget. Called at the provider-turn
 * boundary so a later turn in the same run gets a fresh `maxDelegatesPerTurn`.
 */
export function resetContinueDelegateTurnBudget(sessionKey: string): void {
  delegatesScheduledThisTurn.delete(sessionKey);
}

/**
 * Check the cap and claim a slot in one synchronous step. Agent-loop tool
 * batches run in parallel, so the slot is held across the durable enqueue
 * rather than counted after it settles. A release that lands after the
 * provider-turn reset is dropped so it cannot free the next turn's budget.
 */
export function reserveContinueDelegateTurnSlot(
  sessionKey: string,
  maxPerTurn: number,
): ContinueDelegateTurnReservation {
  let budget = delegatesScheduledThisTurn.get(sessionKey);
  if (!budget) {
    budget = { scheduled: 0 };
    delegatesScheduledThisTurn.set(sessionKey, budget);
  }
  if (budget.scheduled >= maxPerTurn) {
    return { admitted: false, scheduled: budget.scheduled };
  }
  budget.scheduled += 1;
  const turnBudget = budget;
  let released = false;
  return {
    admitted: true,
    slot: {
      index: turnBudget.scheduled,
      release: () => {
        if (released || delegatesScheduledThisTurn.get(sessionKey) !== turnBudget) {
          return;
        }
        released = true;
        turnBudget.scheduled -= 1;
      },
    },
  };
}

/** Clears all per-turn budgets. Test-only. */
export function resetContinueDelegateTurnAdmissionForTests(): void {
  delegatesScheduledThisTurn.clear();
}
