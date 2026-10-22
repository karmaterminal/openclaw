import { describe, expect, it } from "vitest";
import { resolveReplyRunFireReason } from "./run-provenance.js";

describe("resolveReplyRunFireReason", () => {
  it("classifies continuation work wakes as timer-fired runs", () => {
    expect(
      resolveReplyRunFireReason({
        opts: { continuationTrigger: "work-wake" },
      }),
    ).toBe("timer");
  });

  it("classifies delegate-return wakes and delegate-draining turns as continuation chains", () => {
    expect(
      resolveReplyRunFireReason({
        opts: { continuationTrigger: "delegate-return" },
      }),
    ).toBe("continuation-chain");
    expect(resolveReplyRunFireReason({ drainsContinuationDelegateQueue: true })).toBe(
      "continuation-chain",
    );
  });

  it("classifies ordinary subagent-return turns as continuation chains", () => {
    // reclassifies an ordinary subagent completion as `subagent-return`
    // (not a mid-chain `delegate-return`) so the chain-budget reset gate fires,
    // but the run fire-reason stays `continuation-chain`: it is still an
    // internal delegate-driven turn, not an external user trigger.
    expect(
      resolveReplyRunFireReason({
        opts: { continuationTrigger: "subagent-return" },
      }),
    ).toBe("continuation-chain");
  });

  it("classifies ordinary inbound turns as external triggers", () => {
    expect(resolveReplyRunFireReason({})).toBe("external-trigger");
  });
});
