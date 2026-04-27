import { describe, expect, it } from "vitest";
import { ChainBudget } from "./chain-budget.js";

describe("ChainBudget.declineToCarry", () => {
  it("declines when remaining is 0 (depth-cap fires)", () => {
    expect(ChainBudget.declineToCarry({ chainStepBudgetRemaining: 0 })).toBe(true);
  });

  it("declines when remaining is negative (overdrawn)", () => {
    expect(ChainBudget.declineToCarry({ chainStepBudgetRemaining: -1 })).toBe(true);
  });

  it("does not decline when remaining is positive (budget intact)", () => {
    expect(ChainBudget.declineToCarry({ chainStepBudgetRemaining: 1 })).toBe(false);
    expect(ChainBudget.declineToCarry({ chainStepBudgetRemaining: 99 })).toBe(false);
  });

  it("does not decline when state is undefined (caller has not opted in)", () => {
    // Slice 1 additive contract: callers that don't pass a budget see no
    // behavioral change. The chain has not opted in to carrying trace.
    expect(ChainBudget.declineToCarry(undefined)).toBe(false);
  });

  it("does not decline when remaining is NaN or Infinity (treated as untracked)", () => {
    expect(ChainBudget.declineToCarry({ chainStepBudgetRemaining: Number.NaN })).toBe(false);
    expect(ChainBudget.declineToCarry({ chainStepBudgetRemaining: Number.POSITIVE_INFINITY })).toBe(
      false,
    );
  });
});

describe("ChainBudget.declineToConscript", () => {
  // Mirror of declineToCarry, viewed from the producer side of the fan-out
  // boundary (#355 stage-2). Same chain-step axis, opposite handle:
  //   depth-cap   = "I won't carry past my budget"  (declineToCarry)
  //   fan-out-cap = "I won't spend yours"           (declineToConscript)

  const recipient = "agent:silas:discord:channel:thornfield";

  it("declines when recipient remaining is 0 (fan-out-cap fires)", () => {
    expect(
      ChainBudget.declineToConscript({
        recipientSessionKey: recipient,
        recipientChainStepBudgetRemaining: 0,
      }),
    ).toBe(true);
  });

  it("declines when recipient remaining is negative (recipient overdrawn)", () => {
    expect(
      ChainBudget.declineToConscript({
        recipientSessionKey: recipient,
        recipientChainStepBudgetRemaining: -1,
      }),
    ).toBe(true);
  });

  it("does not decline when recipient remaining is positive (budget intact)", () => {
    expect(
      ChainBudget.declineToConscript({
        recipientSessionKey: recipient,
        recipientChainStepBudgetRemaining: 1,
      }),
    ).toBe(false);
    expect(
      ChainBudget.declineToConscript({
        recipientSessionKey: recipient,
        recipientChainStepBudgetRemaining: 99,
      }),
    ).toBe(false);
  });

  it("does not decline when state is undefined (recipient has not opted in)", () => {
    // Stage-2 additive contract: producers that don't pass a recipient budget
    // see no behavioral change. The recipient has not opted in to carrying
    // a tracked chain.
    expect(ChainBudget.declineToConscript(undefined)).toBe(false);
  });

  it("does not decline when remaining is NaN or Infinity (treated as untracked)", () => {
    expect(
      ChainBudget.declineToConscript({
        recipientSessionKey: recipient,
        recipientChainStepBudgetRemaining: Number.NaN,
      }),
    ).toBe(false);
    expect(
      ChainBudget.declineToConscript({
        recipientSessionKey: recipient,
        recipientChainStepBudgetRemaining: Number.POSITIVE_INFINITY,
      }),
    ).toBe(false);
  });
});
