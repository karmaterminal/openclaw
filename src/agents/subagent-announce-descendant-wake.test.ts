// Descendant-wake ownership tests: an accepted wake run that cannot be proven
// stopped must never be reported as a clean no-op.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { GatewayContextResolver } from "../gateway/server-methods/types.js";
import { buildAnnounceIdempotencyKey } from "./announce-idempotency.js";
import { createSubagentRunRecord } from "./subagent-test-fixtures.test-helpers.js";
import {
  runAnnounceDeliveryWithRetry,
  SourceOwnerChangedError,
} from "./subagents/announce/subagent-announce-delivery-retry.js";
import type {
  SubagentAcceptedSteerDispatch,
  SubagentRunRecord,
} from "./subagents/registry/subagent-registry.types.js";

type SubagentRegistryRuntime = typeof import("./subagents/registry/subagent-registry-runtime.js");

const mocks = vi.hoisted(() => ({
  loadSessionEntryByKey: vi.fn(),
}));

vi.mock("./subagents/announce/subagent-announce-delivery.js", () => ({
  loadSessionEntryByKey: mocks.loadSessionEntryByKey,
  resolveSubagentAnnounceTimeoutMs: () => 1_000,
  runAnnounceDeliveryWithRetry: async <T>(params: { run: () => Promise<T> }) => await params.run(),
}));

const { wakeSubagentRunAfterDescendants } =
  await import("./subagents/announce/subagent-announce-descendant-wake.js");

function createWakeHarness(params: {
  callGateway: ReturnType<typeof vi.fn>;
  replaced: boolean;
  acceptedBindingStatus?: "persisted" | "pending-persistence";
  dispatchGatewayMethodInProcess?: ReturnType<typeof vi.fn>;
}) {
  const sourceEntry = createSubagentRunRecord({
    runId: "run-wake-source",
    childSessionKey: "agent:main:subagent:wake",
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "wake after descendants",
    cleanup: "delete",
    createdAt: Date.now() - 1_000,
    startedAt: Date.now() - 500,
    endedAt: Date.now(),
  });
  const dispatchGatewayMethodInProcess =
    params.dispatchGatewayMethodInProcess ??
    vi.fn(async (_method: string, request: { idempotencyKey: string }) => ({
      runId: request.idempotencyKey,
    }));
  const recordAcceptedSubagentSteerDispatch = vi.fn(
    async (recordParams: {
      gatewayRunId: string;
      expectedDispatch?: SubagentAcceptedSteerDispatch;
      phase?: SubagentAcceptedSteerDispatch["phase"];
      lifecycleGeneration?: string;
      expectedSessionId?: string;
      expectedLifecycleRevision?: string;
    }) => {
      if (
        recordParams.expectedDispatch &&
        sourceEntry.acceptedSteerDispatch !== recordParams.expectedDispatch
      ) {
        return { status: "rejected" as const };
      }
      const status =
        recordParams.phase === "accepted"
          ? (params.acceptedBindingStatus ?? "persisted")
          : "persisted";
      const dispatch = {
        gatewayRunId: recordParams.gatewayRunId,
        phase: recordParams.phase,
        lifecycleGeneration: recordParams.lifecycleGeneration,
        expectedSessionId: recordParams.expectedSessionId,
        expectedLifecycleRevision: recordParams.expectedLifecycleRevision,
      };
      sourceEntry.acceptedSteerDispatch = dispatch;
      return {
        status,
        ownerRunId: sourceEntry.runId,
        owner: sourceEntry,
        dispatch,
      };
    },
  );
  const clearSubagentRunSteerRestart = vi.fn(
    async (
      _runId: string,
      expected: SubagentRunRecord,
      dispatch: SubagentAcceptedSteerDispatch,
    ) => {
      if (expected.acceptedSteerDispatch !== dispatch) {
        return false;
      }
      expected.acceptedSteerDispatch = undefined;
      return true;
    },
  );
  // Typed to the registry contract: replacement is synchronous. An async double
  // would hand the unawaited caller a truthy Promise and report every failed
  // replacement as a wake.
  const replaceSubagentRunAfterSteer = vi.fn<
    SubagentRegistryRuntime["replaceSubagentRunAfterSteer"]
  >(() => {
    if (params.replaced) {
      sourceEntry.acceptedSteerDispatch = undefined;
    }
    return params.replaced;
  });
  const deps = {
    callGateway: params.callGateway,
    dispatchGatewayMethodInProcess,
    getRuntimeConfig: () => ({}) as OpenClawConfig,
    loadSubagentRegistryRuntime: async () => ({
      clearLazySubagentSteerRestart: clearSubagentRunSteerRestart,
      getLazySubagentRunByRunId: vi.fn(async () => sourceEntry),
      recordLazySubagentSteerDispatch: recordAcceptedSubagentSteerDispatch,
      replaceSubagentRunAfterSteer,
    }),
  } as unknown as Parameters<typeof wakeSubagentRunAfterDescendants>[1];
  return {
    clearSubagentRunSteerRestart,
    deps,
    dispatchGatewayMethodInProcess,
    recordAcceptedSubagentSteerDispatch,
    replaceSubagentRunAfterSteer,
    sourceEntry,
  };
}

const wakeParams = {
  runId: "run-wake-source",
  childSessionKey: "agent:main:subagent:wake",
  taskLabel: "task",
  findings: "descendants settled",
  announceId: "announce-1",
  isChildSessionEffectsAllowed: () => true,
};
const wakeDispatchId = buildAnnounceIdempotencyKey(`${wakeParams.announceId}:wake`);

describe("wakeSubagentRunAfterDescendants", () => {
  beforeEach(() => {
    mocks.loadSessionEntryByKey.mockReset();
  });

  it("reports an unconfirmed termination when a failed wake cannot be proven stopped", async () => {
    // No frozen lifecycle revision, so guarded deletion cannot confirm the run.
    mocks.loadSessionEntryByKey.mockReturnValue({ sessionId: "sess-wake" });
    const callGateway = vi.fn(async () => ({ aborted: true, runIds: ["a-different-run"] }));
    const harness = createWakeHarness({ callGateway, replaced: false });

    await expect(wakeSubagentRunAfterDescendants(wakeParams, harness.deps)).resolves.toBe(
      "termination-unconfirmed",
    );
    expect(callGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "chat.abort",
        params: { sessionKey: wakeParams.childSessionKey, runId: wakeDispatchId },
      }),
    );
    expect(harness.sourceEntry.acceptedSteerDispatch).toMatchObject({
      gatewayRunId: wakeDispatchId,
      phase: "accepted",
    });
  });

  it("reports a plain no-wake when the accepted run is confirmed stopped", async () => {
    mocks.loadSessionEntryByKey.mockReturnValue({ sessionId: "sess-wake" });
    const callGateway = vi.fn(async () => ({ aborted: true, runIds: [wakeDispatchId] }));
    const harness = createWakeHarness({ callGateway, replaced: false });

    await expect(wakeSubagentRunAfterDescendants(wakeParams, harness.deps)).resolves.toBe(
      "not-woken",
    );
    expect(harness.clearSubagentRunSteerRestart).toHaveBeenCalledOnce();
    expect(harness.sourceEntry.acceptedSteerDispatch).toBeUndefined();
  });

  it("reports a successful wake without terminating the accepted run", async () => {
    mocks.loadSessionEntryByKey.mockReturnValue({ sessionId: "sess-wake" });
    const callGateway = vi.fn(async () => ({}));
    const harness = createWakeHarness({ callGateway, replaced: true });

    await expect(wakeSubagentRunAfterDescendants(wakeParams, harness.deps)).resolves.toBe("woke");
    expect(callGateway).not.toHaveBeenCalled();
    expect(harness.recordAcceptedSubagentSteerDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayRunId: wakeDispatchId,
        phase: "dispatching",
      }),
    );
    expect(harness.recordAcceptedSubagentSteerDispatch.mock.invocationCallOrder[0]).toBeLessThan(
      harness.dispatchGatewayMethodInProcess.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(harness.dispatchGatewayMethodInProcess).toHaveBeenCalledWith(
      "agent",
      expect.any(Object),
      expect.objectContaining({ operatorRoleActor: { kind: "system" } }),
    );
    expect(harness.replaceSubagentRunAfterSteer).toHaveBeenCalledWith(
      expect.objectContaining({
        previousRunId: wakeParams.runId,
        nextRunId: wakeDispatchId,
        expected: harness.sourceEntry,
      }),
    );
  });

  it("threads gateway context and the caller signal into the restricted-role wake dispatch", async () => {
    // Upstream covered this on its own `runDescendantWake` signature, which our
    // side renamed to `wakeSubagentRunAfterDescendants` and split into
    // (params, deps). The rename dropped upstream's coverage of the dispatch
    // wire, so pin it here: a restricted-role in-process wake must carry the
    // caller's gateway-context resolver and abort signal through to the agent
    // dispatch, not re-derive or drop them.
    mocks.loadSessionEntryByKey.mockReturnValue({ sessionId: "sess-wake" });
    const callGateway = vi.fn(async () => ({}));
    const harness = createWakeHarness({ callGateway, replaced: true });
    const resolveGatewayContext: GatewayContextResolver = () => undefined;
    const signal = new AbortController().signal;

    await expect(
      wakeSubagentRunAfterDescendants(
        { ...wakeParams, resolveGatewayContext, signal },
        harness.deps,
      ),
    ).resolves.toBe("woke");
    expect(harness.dispatchGatewayMethodInProcess).toHaveBeenCalledWith(
      "agent",
      expect.any(Object),
      expect.objectContaining({
        cancelOnDeadline: true,
        operatorRoleActor: { kind: "system" },
        resolveGatewayContext,
        signal,
      }),
    );
  });

  it("binds a runtime-assigned accepted run id to the exact durable reservation", async () => {
    mocks.loadSessionEntryByKey.mockReturnValue({ sessionId: "sess-wake" });
    const runtimeRunId = "runtime-assigned-wake-run";
    const dispatchGatewayMethodInProcess = vi.fn(async () => ({
      runId: runtimeRunId,
      status: "accepted",
    }));
    const callGateway = vi.fn(async () => ({}));
    const harness = createWakeHarness({
      callGateway,
      replaced: true,
      dispatchGatewayMethodInProcess,
    });

    await expect(wakeSubagentRunAfterDescendants(wakeParams, harness.deps)).resolves.toBe("woke");

    expect(callGateway).not.toHaveBeenCalled();
    expect(harness.recordAcceptedSubagentSteerDispatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        gatewayRunId: runtimeRunId,
        expectedDispatch: expect.objectContaining({
          gatewayRunId: wakeDispatchId,
          phase: "dispatching",
        }),
        phase: "accepted",
      }),
    );
    expect(harness.replaceSubagentRunAfterSteer).toHaveBeenCalledWith(
      expect.objectContaining({
        previousRunId: wakeParams.runId,
        nextRunId: runtimeRunId,
      }),
    );
  });

  it("retains ownership when the wake response is lost after dispatch", async () => {
    mocks.loadSessionEntryByKey.mockReturnValue({ sessionId: "sess-wake" });
    const dispatchGatewayMethodInProcess = vi.fn(async (_method: string, _params: unknown) => {
      throw new Error("wake response lost");
    });
    const callGateway = vi.fn(async () => ({ aborted: true, runIds: ["a-different-run"] }));
    const harness = createWakeHarness({
      callGateway,
      replaced: false,
      dispatchGatewayMethodInProcess,
    });

    await expect(wakeSubagentRunAfterDescendants(wakeParams, harness.deps)).resolves.toBe(
      "termination-unconfirmed",
    );

    expect(callGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "chat.abort",
        params: { sessionKey: wakeParams.childSessionKey, runId: wakeDispatchId },
      }),
    );
    expect(harness.sourceEntry.acceptedSteerDispatch).toMatchObject({
      gatewayRunId: wakeDispatchId,
      phase: "accepted",
    });
  });

  it("cleans the deterministic reservation when the wake response is empty", async () => {
    mocks.loadSessionEntryByKey.mockReturnValue({ sessionId: "sess-wake" });
    const dispatchGatewayMethodInProcess = vi.fn(async () => ({}));
    const callGateway = vi.fn(async (request: { params?: { runId?: string } }) => ({
      aborted: true,
      runIds: [request.params?.runId],
    }));
    const harness = createWakeHarness({
      callGateway,
      replaced: true,
      dispatchGatewayMethodInProcess,
    });

    await expect(wakeSubagentRunAfterDescendants(wakeParams, harness.deps)).resolves.toBe(
      "not-woken",
    );

    expect(harness.replaceSubagentRunAfterSteer).not.toHaveBeenCalled();
    expect(callGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "chat.abort",
        params: { sessionKey: wakeParams.childSessionKey, runId: wakeDispatchId },
      }),
    );
    expect(harness.sourceEntry.acceptedSteerDispatch).toBeUndefined();
  });

  it("defers replacement when the accepted run binding is not durable", async () => {
    mocks.loadSessionEntryByKey.mockReturnValue({ sessionId: "sess-wake" });
    const runtimeRunId = "runtime-wake-pending-persistence";
    const dispatchGatewayMethodInProcess = vi.fn(async () => ({
      runId: runtimeRunId,
      status: "accepted",
    }));
    const callGateway = vi.fn(async () => ({}));
    const harness = createWakeHarness({
      callGateway,
      replaced: true,
      acceptedBindingStatus: "pending-persistence",
      dispatchGatewayMethodInProcess,
    });

    await expect(wakeSubagentRunAfterDescendants(wakeParams, harness.deps)).resolves.toBe(
      "termination-unconfirmed",
    );

    expect(harness.replaceSubagentRunAfterSteer).not.toHaveBeenCalled();
    expect(callGateway).not.toHaveBeenCalled();
    expect(harness.sourceEntry.acceptedSteerDispatch).toMatchObject({
      gatewayRunId: runtimeRunId,
      phase: "accepted",
    });
  });

  it("terminates an accepted run when completion authority closes before replacement", async () => {
    mocks.loadSessionEntryByKey.mockReturnValue({ sessionId: "sess-wake" });
    const runtimeRunId = "runtime-wake-after-closure";
    let effectsAllowed = true;
    const dispatchGatewayMethodInProcess = vi.fn(async () => {
      effectsAllowed = false;
      return { runId: runtimeRunId, status: "accepted" };
    });
    const callGateway = vi.fn(async (request: { params?: { runId?: string } }) => ({
      aborted: true,
      runIds: [request.params?.runId],
    }));
    const harness = createWakeHarness({
      callGateway,
      replaced: true,
      dispatchGatewayMethodInProcess,
    });

    await expect(
      wakeSubagentRunAfterDescendants(
        { ...wakeParams, isChildSessionEffectsAllowed: () => effectsAllowed },
        harness.deps,
      ),
    ).resolves.toBe("not-woken");

    expect(harness.replaceSubagentRunAfterSteer).not.toHaveBeenCalled();
    expect(callGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "chat.abort",
        params: { sessionKey: wakeParams.childSessionKey, runId: runtimeRunId },
      }),
    );
    expect(harness.sourceEntry.acceptedSteerDispatch).toBeUndefined();
  });

  it("rejects a mismatched response run id without replacing deterministic ownership", async () => {
    mocks.loadSessionEntryByKey.mockReturnValue({ sessionId: "sess-wake" });
    const dispatchGatewayMethodInProcess = vi.fn(async () => ({
      runId: "mismatched-wake-run",
    }));
    const callGateway = vi.fn(async (request: { params?: { runId?: string } }) => ({
      aborted: true,
      runIds: [request.params?.runId],
    }));
    const harness = createWakeHarness({
      callGateway,
      replaced: true,
      dispatchGatewayMethodInProcess,
    });

    await expect(wakeSubagentRunAfterDescendants(wakeParams, harness.deps)).resolves.toBe(
      "not-woken",
    );

    expect(harness.replaceSubagentRunAfterSteer).not.toHaveBeenCalled();
    expect(callGateway).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "chat.abort",
        params: { sessionKey: wakeParams.childSessionKey, runId: "mismatched-wake-run" },
      }),
    );
    expect(callGateway).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "chat.abort",
        params: { sessionKey: wakeParams.childSessionKey, runId: wakeDispatchId },
      }),
    );
    expect(harness.recordAcceptedSubagentSteerDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ gatewayRunId: "mismatched-wake-run" }),
    );
    expect(harness.sourceEntry.acceptedSteerDispatch).toBeUndefined();
  });
});

// Ported from upstream 7972c35315 (`registerDescendantWakeCurrencyTests`), which
// drove upstream's `runDescendantWake`. Our side replaced that entry point with
// the registry-reserved `wakeSubagentRunAfterDescendants(params, deps)`, so the
// currency contract is pinned here against our function and our deps.
describe("wakeSubagentRunAfterDescendants currency", () => {
  beforeEach(() => {
    mocks.loadSessionEntryByKey.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["current", "changed", "unavailable"] as const)(
    "settles descendant wakes under the restricted system role with %s currency",
    async (currency) => {
      mocks.loadSessionEntryByKey.mockReturnValue({ sessionId: "nested-session", updatedAt: 1 });
      const resolveGatewayContext: GatewayContextResolver = () => undefined;
      const signal = new AbortController().signal;
      let accepted = false;
      const dispatchGatewayMethodInProcess = vi.fn(
        async (
          _method: string,
          request: { idempotencyKey: string },
          options: { prepareDispatchCurrent?: () => Promise<void> },
        ) => {
          // The in-process dispatcher re-checks currency before admitting the run.
          await options.prepareDispatchCurrent?.();
          accepted = true;
          return { runId: request.idempotencyKey };
        },
      );
      const callGateway = vi.fn(async (request: { params?: { runId?: string } }) => ({
        aborted: true,
        runIds: [request.params?.runId],
      }));
      const harness = createWakeHarness({
        callGateway,
        replaced: true,
        dispatchGatewayMethodInProcess,
      });

      const outcome = await wakeSubagentRunAfterDescendants(
        {
          ...wakeParams,
          prepareCurrent: async () => {
            if (accepted && currency === "unavailable") {
              throw new Error("currency reader closed");
            }
            return !accepted || currency === "current";
          },
          resolveGatewayContext,
          signal,
        },
        harness.deps,
      );

      expect(outcome).toBe(currency === "current" ? "woke" : "not-woken");
      expect(dispatchGatewayMethodInProcess).toHaveBeenCalledWith(
        "agent",
        expect.any(Object),
        expect.objectContaining({
          cancelOnDeadline: true,
          operatorRoleActor: { kind: "system" },
          resolveGatewayContext,
          signal,
        }),
      );
      if (currency === "current") {
        expect(callGateway).not.toHaveBeenCalled();
        expect(harness.replaceSubagentRunAfterSteer).toHaveBeenCalledWith(
          expect.objectContaining({
            previousRunId: wakeParams.runId,
            nextRunId: wakeDispatchId,
          }),
        );
      } else {
        expect(harness.replaceSubagentRunAfterSteer).not.toHaveBeenCalled();
        expect(callGateway).toHaveBeenCalledWith(
          expect.objectContaining({
            method: "chat.abort",
            params: { sessionKey: wakeParams.childSessionKey, runId: wakeDispatchId },
          }),
        );
        expect(harness.sourceEntry.acceptedSteerDispatch).toBeUndefined();
      }
    },
  );

  it.each([1, 3])(
    "refuses a wake retry after %s attempts when currency changes",
    async (attempts) => {
      vi.useFakeTimers();
      let current = true;
      let dispatched = 0;
      const pending = runAnnounceDeliveryWithRetry({
        operation: "descendant wake agent call",
        prepareAttempt: async () => current,
        isAttemptAllowed: () => true,
        run: async () => {
          dispatched += 1;
          current = dispatched < attempts;
          throw new Error("UNAVAILABLE");
        },
      });
      const rejected = expect(pending).rejects.toBeInstanceOf(SourceOwnerChangedError);
      await vi.runAllTimersAsync();
      await rejected;
      expect(dispatched).toBe(attempts);
    },
  );
});
