import { expect, it, vi } from "vitest";
import { registerChatAbortController } from "../../../gateway/chat-abort.js";
import type { GatewayRequestContext } from "../../../gateway/server-methods/types.js";
import { withPluginRuntimeGatewayContextResolver } from "../../../plugins/runtime/gateway-request-scope.js";
import { captureSessionTarget } from "../../../sessions/session-controller.lifecycle.js";
import { getRpcSource } from "../../../sessions/session-controller.rpc-sources.js";
import { createDeferredCore } from "../../../shared/deferred.js";
import {
  bindSubagentSpawnCleanup,
  cleanupFailedSpawnBeforeAgentStart,
  cleanupProvisionalSession,
  terminateAcceptedCollectorRun,
} from "./subagent-spawn-cleanup.js";
import type { SubagentGatewayRequest } from "./subagent-spawn-gateway.js";

// Mirrors the module-local GatewayCall parameter. Declaring it keeps
// callGateway.mock.calls a one-element tuple so request assertions can
// destructure it instead of indexing an empty tuple.
type GatewayRequest = SubagentGatewayRequest;

function sessionChangedError(): Error {
  return Object.assign(new Error("session changed"), {
    name: "GatewayClientRequestError",
    gatewayCode: "INVALID_REQUEST",
    details: { reason: "session-changed" },
  });
}

const childSessionKey = "agent:main:subagent:child";
const runId = "gateway-run";
const identity = { expectedSessionId: "session-id", expectedLifecycleRevision: "session-revision" };

function terminate(options: Partial<Parameters<typeof terminateAcceptedCollectorRun>[0]>) {
  return terminateAcceptedCollectorRun({
    childSessionKey,
    gatewayRunId: runId,
    ...options,
  });
}

function setupCleanup(dispatchSessionMethod: () => Promise<unknown>) {
  const context = Object.assign({} as GatewayRequestContext, {
    lifecycleRuntime: { dispatchSessionMethod },
  });
  const target = captureSessionTarget({
    storeScope: "/synthetic/spawn-cleanup.db",
    sessionKey: childSessionKey,
    incarnation: identity.expectedSessionId,
  });
  const resolveGatewayContext = () => context;
  const register = (foreign = false) =>
    withPluginRuntimeGatewayContextResolver(foreign ? undefined : resolveGatewayContext, () =>
      registerChatAbortController({
        target: foreign
          ? captureSessionTarget({ ...target, storeScope: "/synthetic/foreign-cleanup.db" })
          : target,
        runId,
        sessionId: identity.expectedSessionId,
        sessionKey: childSessionKey,
        timeoutMs: 60_000,
      }),
    );
  const cleanup = bindSubagentSpawnCleanup({
    childSessionKey,
    target,
    resolveGatewayContext,
    isCurrent: () => true,
    canAbortAcceptedRun: () => true,
    getSessionIdentity: () => identity,
  });
  return { cleanup, register };
}

it("resolves only when termination is confirmed and rejects after one failed attempt", async () => {
  const confirmedGateway = vi.fn(async () => ({
    ok: true,
    aborted: true,
    runIds: ["gateway-run"],
  }));
  await expect(
    terminate({ sessionCleanup: "preserve", callGateway: confirmedGateway }),
  ).resolves.toBeUndefined();

  const unavailableGateway = vi.fn(async () => {
    throw new Error("gateway unavailable");
  });
  await expect(
    terminate({ sessionCleanup: "preserve", callGateway: unavailableGateway }),
  ).rejects.toThrow("gateway unavailable");
  expect(unavailableGateway).toHaveBeenCalledOnce();
});

it("retains its physical RPC source across cleanup and refuses a same-ID successor", async () => {
  const response = createDeferredCore<{ aborted: boolean; runIds: string[] }>();
  const dispatchSessionMethod = vi.fn(() => response.promise);
  const { cleanup, register } = setupCleanup(dispatchSessionMethod);
  const original = register();
  const foreign = register(true);
  cleanup.bindAcceptedRun(runId);
  expect(cleanup.isCurrent()).toBe(true);
  const abortRequest = {
    method: "chat.abort",
    params: { sessionKey: childSessionKey, runId },
  };
  const request = cleanup.callGateway(abortRequest);
  original.cleanup();
  const successor = register();
  try {
    expect(original.registered).toBe(true);
    expect(foreign.registered).toBe(true);
    expect(successor.registered).toBe(true);
    expect(cleanup.isCurrent()).toBe(false);
    response.resolve({ aborted: true, runIds: [runId] });
    await expect(request).rejects.toThrow("Subagent spawn no longer owns this cleanup");
    expect(dispatchSessionMethod).toHaveBeenCalledOnce();
    expect(successor.controller.signal.aborted).toBe(false);
    expect(foreign.controller.signal.aborted).toBe(false);
    await expect(cleanup.callGateway(abortRequest)).rejects.toThrow(
      "Subagent spawn no longer owns this cleanup",
    );
    expect(dispatchSessionMethod).toHaveBeenCalledOnce();
  } finally {
    response.resolve({ aborted: false, runIds: [] });
    await request.catch(() => {});
    original.cleanup();
    successor.cleanup();
    foreign.cleanup();
  }
});

it("requires both frozen session identities before deletion", async () => {
  const callGateway = vi.fn();

  await expect(
    cleanupProvisionalSession("agent:main:subagent:child", {
      expectedSessionId: "session-id",
      callGateway,
    }),
  ).resolves.toBe(false);

  expect(callGateway).not.toHaveBeenCalled();
});

// An abort miss falls through to exact-session deletion only for a frozen identity;
// deleting by key alone could remove a successor generation.
it("never deletes by key alone when the accepted run's session identity is not frozen", async () => {
  const callGateway = vi.fn(async (_request: GatewayRequest) => ({
    ok: true,
    aborted: false,
    runIds: [],
  }));

  await expect(
    terminate({ expectedSessionId: identity.expectedSessionId, callGateway }),
  ).rejects.toThrow("Gateway did not confirm accepted child termination");

  expect(callGateway).toHaveBeenCalledOnce();
  expect(callGateway.mock.calls[0]?.[0]).toMatchObject({ method: "chat.abort" });
});

it("skips waited provisional deletion without a frozen session identity", async () => {
  const callGateway = vi.fn();
  const waitForCleanup = vi.fn(async () => {});

  await expect(
    cleanupFailedSpawnBeforeAgentStart({
      childSessionKey,
      waitForSessionDeletion: true,
      waitForCleanup,
      expectedLifecycleRevision: identity.expectedLifecycleRevision,
      callGateway,
    }),
  ).resolves.toEqual({ attachmentsRemoved: true, sessionDeleted: false });

  expect(waitForCleanup).not.toHaveBeenCalled();
  expect(callGateway).not.toHaveBeenCalled();
});

// Termination is the ONLY place the live ownership predicate is consumed. When
// ownership flips after acceptance but before cleanup, termination makes one
// bounded attempt and must not delete a successor-owned session or retry.
it("makes one bounded attempt and deletes nothing once cleanup ownership has flipped", async () => {
  const callGateway = vi.fn(async (_request: GatewayRequest) => ({
    ok: true,
    aborted: false,
    runIds: [],
  }));

  await terminate({ ...identity, isCurrent: () => false, callGateway });

  // No successor-owned session deletion.
  expect(
    callGateway.mock.calls.filter(
      ([request]) => (request as { method?: string }).method === "sessions.delete",
    ),
  ).toHaveLength(0);
  // Bounded: termination makes a single attempt, so there is no second abort either.
  expect(
    callGateway.mock.calls.filter(
      ([request]) => (request as { method?: string }).method === "chat.abort",
    ).length,
  ).toBeLessThanOrEqual(1);
});

it("reports uncertain termination while retaining the accepted child", async () => {
  const failure = new Error("gateway unavailable");
  const dispatchSessionMethod = vi.fn(async () => {
    throw failure;
  });
  const { cleanup, register } = setupCleanup(dispatchSessionMethod);
  const source = register();
  if (!source.registered) {
    throw new Error("Cancelled cleanup proof requires a registered controller source");
  }
  let inputSettled = false;
  void source.entry.input.settlement.promise.then(() => {
    inputSettled = true;
  });
  cleanup.bindAcceptedRun(runId);
  try {
    await expect(cleanup.terminateAcceptedRun?.()).resolves.toEqual({
      status: "failed",
      error: failure,
    });
    expect(dispatchSessionMethod).toHaveBeenCalledOnce();
    expect(getRpcSource(runId)).toBe(source.entry);
    expect(source.controller.signal.aborted).toBe(false);
    expect(inputSettled).toBe(false);
  } finally {
    source.cleanup();
  }
});

// Termination resolves when the accepted run is stopped or provably no longer
// ours, and rejects when that is unconfirmed; the rollback, sweep and collector
// consumers translate the rejection into their kept-custody outcome. In the
// successor case the abort confirmed a DIFFERENT run, so deletion was attempted
// and refused with session-changed, which proves a successor owns the session:
// resolved. Either way the point is the bound: exactly one abort plus one guarded
// deletion, and no successor-owned session was deleted.
it.each([
  ["missing run", { ok: true, aborted: false, runIds: [] }, false],
  [
    "different run and successor lifecycle",
    { ok: true, aborted: true, runIds: ["different-run"] },
    true,
  ],
] as const)("guards deletion after abort reports %s", async (_name, response, successor) => {
  const callGateway = vi.fn().mockResolvedValueOnce(response);
  if (successor) {
    callGateway.mockRejectedValueOnce(sessionChangedError());
  } else {
    callGateway.mockResolvedValueOnce({ deleted: true });
  }
  await expect(terminate({ ...identity, callGateway })).resolves.toBeUndefined();
  expect(callGateway).toHaveBeenCalledTimes(2);
  expect(callGateway).toHaveBeenNthCalledWith(2, {
    method: "sessions.delete",
    params: {
      key: "agent:main:subagent:child",
      agentId: "main",
      emitLifecycleHooks: false,
      deleteTranscript: true,
      expectedSessionId: "session-id",
      expectedLifecycleRevision: "session-revision",
    },
    timeoutMs: 60_000,
  });
});

it.each([false, true])("does not delete a settled run (durable=%s)", async (durable) => {
  const callGateway = vi.fn().mockResolvedValue({
    ok: true,
    aborted: !durable,
    runIds: durable ? [] : [runId],
  });
  await terminate(
    durable ? { callGateway, sessionCleanup: "preserve" } : { ...identity, callGateway },
  );
  expect(callGateway).toHaveBeenCalledOnce();
});

it("reports an abort failure without deleting or retrying a durable session", async () => {
  const failure = new Error("gateway unavailable");
  const callGateway = vi.fn().mockRejectedValue(failure);
  await expect(terminate({ sessionCleanup: "preserve", callGateway })).rejects.toBe(failure);
  expect(callGateway).toHaveBeenCalledOnce();
});
