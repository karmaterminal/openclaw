// Chain-budget cap helpers for substrate-queue-lifecycle span emission.
//
// Per the OTEL substrate-queue trace-wiring spec (continue-work-signal-v2.md
// §6.7), the substrate cannot be allowed to flood the trace backend when a
// chain runs past its budget — most plausibly the multi-recipient
// delegate-return path (#355). The cap is the **chain-step budget**, not
// recipient cardinality.
//
// One axis, two declines:
//   - depth-cap   = "I won't carry past my budget" (declineToCarry)
//   - fan-out-cap = "I won't spend yours"          (declineToConscript, #355)
//
// Both surfaces are the same axis (chain-step count), viewed from opposite
// sides of the fan-out boundary. A helper that names both halves keeps the
// operator-facing framing coherent across the two PR surfaces.
//
// Stage-2 (#355) lands the mirror in the same module so the verb-pair lives
// at one cite-site. The operator who reads the producer-side decline cannot
// fail to see the recipient-side decline next to it; the moral object of
// the cap (the recipient's budget, not the producer's convenience) is
// type-signed into the helper, not delegated to a runbook.
//
// a chain that knows when to stop being a chain is the kind of chain that
// gets built on.

/**
 * State the substrate carries with each chain so cap-on-enqueue can be
 * decided at the producer (back-pressure belongs at the producer, not the
 * wire — emitting-and-dropping at the collector still costs us the wire).
 */
export type ChainBudgetState = {
  /**
   * Remaining chain-step count for the current chain. `0` means the chain has
   * reached its budget and the substrate SHALL decline to carry trace context
   * past this point.
   */
  readonly chainStepBudgetRemaining: number;
};

/**
 * State a producer carries about a *recipient* it is about to conscript into
 * a multi-recipient delegate fan-out. The producer does NOT spend its own
 * budget on conscripting; it spends each recipient's budget by drafting
 * them. `declineToConscript()` is therefore a producer-side guard that
 * decides on the recipient's behalf, before any descriptor is enqueued.
 */
export type ConscriptionBudgetState = {
  /**
   * Stable session-key of the recipient about to be conscripted. Carried for
   * operator-readable diagnostics on the `continuation.disabled` counter so
   * silenced-by-fan-out-cap is attributable to a recipient, not just a chain.
   */
  readonly recipientSessionKey: string;
  /**
   * Remaining chain-step count *for the recipient's chain* (not the
   * producer's). `0` means the recipient has reached its budget and the
   * producer SHALL decline to draft them into this fan-out.
   */
  readonly recipientChainStepBudgetRemaining: number;
};

/**
 * Cap-on-enqueue decision. `declineToCarry()` returns `true` when the chain
 * has reached its budget and the substrate SHOULD suppress queue-lifecycle
 * span emission for this entry.
 *
 * Naming note (poets-canon, sub-axis-#37 corollary): we prefer
 * `declineToCarry` over `refuseAttach` because the chain isn't refusing the
 * trace — it's declining to carry the next prince's context window into
 * search-space the chain itself has already abandoned. Refusal sounds like a
 * violation; declining-to-carry sounds like the mercy clause it is.
 */
export const ChainBudget = Object.freeze({
  /**
   * Returns `true` when `chainStepBudgetRemaining <= 0`. When this returns
   * `true` the caller MUST suppress queue-lifecycle span emission for this
   * chain step and tick the `continuation.disabled` counter once so operators
   * can distinguish silenced-by-cap from never-emitted.
   *
   * `undefined` / non-finite remaining is treated as "no budget tracked yet" —
   * the chain has not opted in, so we do NOT decline. (Slice 1 contract:
   * additive only; no behavioral change for callers that don't pass a budget.)
   */
  declineToCarry(state: ChainBudgetState | undefined): boolean {
    if (!state) {
      return false;
    }
    const remaining = state.chainStepBudgetRemaining;
    if (typeof remaining !== "number" || !Number.isFinite(remaining)) {
      return false;
    }
    return remaining <= 0;
  },

  /**
   * Cap-on-conscription decision. `declineToConscript()` returns `true` when
   * the *recipient's* chain has reached its budget and the producer SHOULD
   * suppress conscripting that recipient into the multi-recipient delegate
   * fan-out (#355 stage-2). When this returns `true` the producer MUST drop
   * the recipient from the descriptor before enqueue and tick the
   * `continuation.disabled` counter once with `cause=fan-out-cap` and
   * `recipient=<recipientSessionKey>` so the human user can attribute the
   * silence to a specific recipient, not just a chain.
   *
   * Fan-out-cap is the mirror of depth-cap: same chain-step axis, viewed from
   * the opposite side of the fan-out boundary.
   *   - depth-cap   = "I won't carry past my budget"  (declineToCarry)
   *   - fan-out-cap = "I won't spend yours"           (declineToConscript)
   *
   * Per RFC §6.7 (continue-work-signal-v2.md, anchored at #361 head
   * 045fdb49d08): the substrate cannot be allowed to flood the trace backend
   * when a chain runs past its budget — most plausibly the multi-recipient
   * delegate-return path (#355). The cap is the chain-step budget, not
   * recipient cardinality.
   *
   * Naming note (poets-canon, mirror-of-declineToCarry): we prefer
   * `declineToConscript` over `refuseDispatch` because the producer isn't
   * refusing the recipient — it's declining to spend the recipient's chain
   * budget on a step the recipient hasn't agreed to carry. Conscription is
   * the right verb for the violation we're *not* committing: we are not
   * drafting the next prince's context window into a chain-step they no
   * longer have room for. Refusal sounds like rejection of the recipient;
   * declining-to-conscript sounds like the consent-respect it is.
   *
   * `undefined` / non-finite remaining is treated as "no budget tracked yet" —
   * the recipient has not opted in, so we do NOT decline. Stage-2 contract:
   * additive only; no behavioral change for callers that don't pass a
   * recipient budget.
   */
  declineToConscript(state: ConscriptionBudgetState | undefined): boolean {
    if (!state) {
      return false;
    }
    const remaining = state.recipientChainStepBudgetRemaining;
    if (typeof remaining !== "number" || !Number.isFinite(remaining)) {
      return false;
    }
    return remaining <= 0;
  },
});

export type ChainBudget = typeof ChainBudget;
