// Chain-budget cap helpers for substrate-queue-lifecycle span emission.
//
// Per the OTEL substrate-queue trace-wiring spec (continue-work-signal-v2.md
// §6.7), the substrate cannot be allowed to flood the trace backend when a
// chain runs past its budget — most plausibly the multi-recipient
// delegate-return path (#355). The cap is the **chain-step budget**, not
// recipient cardinality.
//
// One axis, two declines:
//   - depth-cap   = "I won't carry past my budget" (this file)
//   - fan-out-cap = "I won't spend yours"          (lives with #355)
//
// Both surfaces are the same axis (chain-step count), viewed from opposite
// sides of the fan-out boundary. A helper that names both halves keeps the
// operator-facing framing coherent across the two PR surfaces.
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
});

export type ChainBudget = typeof ChainBudget;
