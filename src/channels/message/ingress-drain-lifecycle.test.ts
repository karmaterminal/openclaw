import { describe, expect, it } from "vitest";
import {
  bindIngressLifecycleToReplyOptions,
  buildAgentRunAdoptedLineage,
  buildChannelIngressCompletionLineage,
  resolveReturnedIngressCompletion,
} from "./ingress-drain-lifecycle.js";

describe("channel ingress drain lifecycle", () => {
  it("binds only the reply-lane ownership surface", async () => {
    const abort = new AbortController();
    const calls: string[] = [];
    const bound = bindIngressLifecycleToReplyOptions({
      abortSignal: abort.signal,
      onAdoptionFinalizing: () => {
        calls.push("finalizing");
      },
      onFailed: () => {
        calls.push("failed");
      },
      onCancelled: () => {
        calls.push("cancelled");
      },
      onAdopted: () => {
        calls.push("adopted");
      },
      onDeferred: () => {
        calls.push("deferred");
      },
      onAbandoned: () => {
        calls.push("abandoned");
      },
    });

    expect(bound.turnAdoptionLifecycle).toMatchObject({
      admission: "exclusive",
      abortSignal: abort.signal,
    });
    expect("onFailed" in bound.turnAdoptionLifecycle).toBe(false);
    expect("onCancelled" in bound.turnAdoptionLifecycle).toBe(false);
    expect("onAdopted" in bound).toBe(false);
    expect(Object.keys(bound)).toEqual(["turnAdoptionLifecycle"]);
    bound.turnAdoptionLifecycle.onDeferred();
    await bound.turnAdoptionLifecycle.onAbandoned();
    expect(calls).toEqual(["deferred", "abandoned"]);
    calls.length = 0;
    bound.turnAdoptionLifecycle.onDeferred();
    await bound.turnAdoptionLifecycle.onAdopted();
    expect(calls).toEqual(["deferred", "adopted"]);
  });

  it("redacts completion lineage to closed producer-known outcomes", () => {
    expect(buildChannelIngressCompletionLineage(undefined)).toBeUndefined();
    expect(buildChannelIngressCompletionLineage({ outcome: "policy-gate" })).toBeUndefined();
    expect(
      buildChannelIngressCompletionLineage({
        outcome: "delivery-returned-completed",
        payload: "secret",
        runId: "should-not-copy",
      }),
    ).toEqual({ outcome: "delivery-returned-completed" });
    expect(
      buildChannelIngressCompletionLineage({
        outcome: "agent-run-adopted",
        runId: "  run-1  ",
        sessionId: "sess",
        payload: "secret",
      }),
    ).toEqual({ outcome: "agent-run-adopted", runId: "run-1" });
    expect(
      buildChannelIngressCompletionLineage({
        outcome: "agent-run-adopted",
        runId: "x".repeat(129),
      }),
    ).toEqual({ outcome: "agent-run-adopted" });
    expect(buildAgentRunAdoptedLineage()).toEqual({ outcome: "agent-run-adopted" });
    expect(buildAgentRunAdoptedLineage({ runId: "run-2" })).toEqual({
      outcome: "agent-run-adopted",
      runId: "run-2",
    });
    expect(resolveReturnedIngressCompletion({ kind: "completed" })).toEqual({
      outcome: "delivery-returned-completed",
    });
    expect(resolveReturnedIngressCompletion(undefined)).toEqual({
      outcome: "delivery-returned-without-handoff",
    });
    expect(resolveReturnedIngressCompletion({ kind: "deferred" })).toBeUndefined();
  });
});
