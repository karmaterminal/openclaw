import { afterEach, describe, expect, it, vi } from "vitest";
import { abortContinuationDispatchClaims } from "./continuation-dispatch-claims.js";
import { registerContinuationDelegateDispatchClaim } from "./delegate-spawn-authority.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("continuation delegate claim construction", () => {
  it("does not register a claim when loading owner identity throws", () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    const ownerSessionKey = "agent:main:owner-load-throws";

    expect(() =>
      registerContinuationDelegateDispatchClaim({
        controller: "pending",
        delegate: { task: "must not leak a claim" },
        ownerSession: {
          agentId: "main",
          load: () => {
            throw new Error("owner store unavailable");
          },
        },
        ownerSessionKey,
      }),
    ).toThrow("owner store unavailable");

    abortContinuationDispatchClaims(ownerSessionKey);
    expect(abortSpy).not.toHaveBeenCalled();
  });

  it("returns the persisted owner and revalidates its lifecycle before spawn boundaries", () => {
    const ownerSessionKey = "agent:main:owner";
    let current = {
      sessionId: "session-1",
      lifecycleRevision: "revision-1",
      updatedAt: 1,
    };
    const claim = registerContinuationDelegateDispatchClaim({
      controller: "pending",
      delegate: { task: "owned delegate" },
      ownerSession: {
        agentId: "main",
        load: () => current,
      },
      ownerSessionKey,
    });

    expect(claim.ownerAgentId).toBe("main");
    expect(() => claim.authority.assertCurrent("gateway-dispatch")).not.toThrow();
    current = {
      sessionId: "session-2",
      lifecycleRevision: "revision-2",
      updatedAt: 2,
    };
    expect(() => claim.authority.assertCurrent("registry-acceptance")).toThrow(
      "Continuation delegate source session lifecycle changed.",
    );
    claim.release();
  });
});
