import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createDeferred } from "../../../../test/helpers/promise.js";
import type { SubagentRegistrationScope } from "../registry/subagent-registry.types.js";
import {
  createSubagentSpawnTestConfig,
  loadSubagentSpawnModuleForTest,
} from "./subagent-spawn.test-helpers.js";

const callGateway = vi.fn();
const startQueuedRun = vi.fn();
const recordRollback = vi.fn();
const releaseRollback = vi.fn();
let createCallbacks: typeof import("./subagent-spawn-collector.js").createCollectorLaunchCallbacks;

beforeAll(async () => {
  await loadSubagentSpawnModuleForTest({
    callGatewayMock: callGateway,
    startQueuedSubagentRunMock: startQueuedRun,
    recordAcceptedSubagentSpawnRollbackMock: recordRollback,
    releaseAcceptedSubagentSpawnRollbackMock: releaseRollback,
    getRuntimeConfig: () => createSubagentSpawnTestConfig(),
  });
  ({ createCollectorLaunchCallbacks: createCallbacks } =
    await import("./subagent-spawn-collector.js"));
});

let order: string[];

beforeEach(() => {
  order = [];
  startQueuedRun.mockReset().mockReturnValue(false);
  recordRollback.mockReset().mockImplementation(() => {
    order.push("record");
    return { status: "persisted" };
  });
  releaseRollback.mockReset().mockImplementation(() => {
    order.push("release");
    return true;
  });
  callGateway.mockReset().mockImplementation(async (request: { method?: string }) => {
    if (request.method === "chat.abort") {
      order.push("abort");
      return { aborted: true, runIds: ["gateway-run"] };
    }
    return { ok: true };
  });
});

function launchFixture(publication?: Promise<void>) {
  let publishing = publication !== undefined;
  void publication?.then(() => {
    publishing = false;
  });
  const settle = vi.fn(async () => {
    order.push("settle");
  });
  const scope: SubagentRegistrationScope = {
    canLaunch: () => true,
    canAcceptLaunch: () => true,
    canCleanupSession: () => true,
    canRetireReservation: () => true,
    settleFailedLaunch: settle,
    waitForClaim: () => undefined,
    waitForRetirementPublication: () => (publishing ? publication : undefined),
  };
  const callbacks = createCallbacks({
    childRunId: "child",
    childSessionKey: "agent:main:subagent:child",
    requesterSessionKey: "agent:main:main",
    registrationScope: scope,
    provisionalSessionIdentity: {},
    launchChildRun: async () => ({ response: { runId: "gateway-run", status: "accepted" } }),
    recordParticipant: vi.fn(),
    emitSpawnLifecycleHooks: async () => {},
    cleanupFailedSpawn: vi.fn(async () => ({ attachmentsRemoved: true, sessionDeleted: true })),
  });
  return { callbacks, settle };
}

const expectRollbackRecord = () =>
  expect(recordRollback).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      runId: "child",
      childSessionKey: "agent:main:subagent:child",
      gatewayRunId: "gateway-run",
      reason: "collector registry row could not transition from queued to running",
    }),
  );

it("records accepted-child rollback custody when the start transition fails", async () => {
  const { callbacks } = launchFixture();
  const failure: unknown = await callbacks.start().catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expectRollbackRecord();
  await expect(callbacks.onStartFailure(failure)).resolves.toBe(true);
  expect(order).toEqual(["record", "abort", "release", "settle"]);
});

it("records rollback custody before waiting on a publishing Stop", async () => {
  const publication = createDeferred();
  const { callbacks, settle } = launchFixture(publication.promise);
  const failure: unknown = await callbacks.start().catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  // Custody is durable before any await, so a crash during the Stop's publication
  // still leaves the restart sweeper an owner for the accepted child.
  expectRollbackRecord();
  const settling = callbacks.onStartFailure(failure);
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  // Termination and settlement still wait for the Stop to decide the outcome.
  expect(order).toEqual(["record"]);
  expect(settle).not.toHaveBeenCalled();
  publication.resolve();
  await expect(settling).resolves.toBe(true);
  expectRollbackRecord();
  expect(order).toEqual(["record", "abort", "release", "settle"]);
});
