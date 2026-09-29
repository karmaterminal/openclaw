// Continuation launch keys (RFC §5.4.4, Q2): the spawn owner uses an in-process
// `continuation:` child run id verbatim and reports which pipeline phase failed.
import { createRequireRecord } from "openclaw/plugin-sdk/test-fixtures";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { formatContinuationChildRunId } from "../../../shared/continuation-run-key.js";
import { deriveContinuationDelegateChildSessionKey } from "../../subagent-continuation-ids.js";
import {
  createConfigOverride,
  loadSubagentSpawnModuleForTest,
  setupCommittedSubagentRegistrationMock,
} from "./subagent-spawn.test-helpers.js";

const hoisted = vi.hoisted(() => ({
  callGatewayMock: vi.fn(),
  registerSubagentRunMock: vi.fn(),
  updateSessionStoreMock: vi.fn(),
  resolveContextEngineMock: vi.fn(),
  getSubagentRunByRunIdMock: vi.fn(),
  configOverride: {} as Record<string, unknown>,
}));

let spawnSubagentDirect: typeof import("./subagent-spawn.js").spawnSubagentDirect;
const requireRecord = createRequireRecord("record", "expected-non-array-record");
const context = { agentSessionKey: "agent:main:main", requesterRunId: "parent-run" };
const childRunId = formatContinuationChildRunId("record-1", 2);

function agentRequests(): Record<string, unknown>[] {
  return hoisted.callGatewayMock.mock.calls
    .map((call) => requireRecord(call[0]))
    .filter((request) => request.method === "agent");
}

function expectNoChildSideEffects(): void {
  expect(hoisted.updateSessionStoreMock).not.toHaveBeenCalled();
  expect(hoisted.callGatewayMock).not.toHaveBeenCalled();
  expect(hoisted.registerSubagentRunMock).not.toHaveBeenCalled();
}

describe("spawnSubagentDirect continuation launch key", () => {
  beforeAll(async () => {
    ({ spawnSubagentDirect } = await loadSubagentSpawnModuleForTest({
      callGatewayMock: hoisted.callGatewayMock,
      getRuntimeConfig: () => hoisted.configOverride,
      updateSessionStoreMock: hoisted.updateSessionStoreMock,
      registerSubagentRunMock: hoisted.registerSubagentRunMock,
      resolveContextEngineMock: hoisted.resolveContextEngineMock,
      getSubagentRunByRunId: hoisted.getSubagentRunByRunIdMock,
      sessionStorePath: "/tmp/subagent-spawn-launch-key-store.json",
    }));
  });

  beforeEach(() => {
    hoisted.configOverride = createConfigOverride();
    hoisted.callGatewayMock.mockReset().mockImplementation(async (request) => {
      const { method, params } = request as {
        method?: string;
        params?: { idempotencyKey?: string };
      };
      if (method === "agent") {
        // The Gateway adopts the caller's idempotency key as the run id.
        return { runId: params?.idempotencyKey, status: "accepted" };
      }
      return method?.startsWith("sessions.") ? { ok: true } : {};
    });
    hoisted.registerSubagentRunMock.mockReset();
    setupCommittedSubagentRegistrationMock(hoisted.registerSubagentRunMock);
    hoisted.updateSessionStoreMock.mockReset().mockImplementation(async (_path, mutator) => {
      const store: Record<string, Record<string, unknown>> = {};
      await (mutator as (value: typeof store) => unknown)(store);
      return store;
    });
    hoisted.resolveContextEngineMock.mockReset().mockResolvedValue({});
    hoisted.getSubagentRunByRunIdMock.mockReset().mockReturnValue(undefined);
  });

  it("launches and registers the child under the key verbatim", async () => {
    const result = await spawnSubagentDirect(
      { task: "continue", continuationChildRunId: childRunId },
      context,
    );

    expect(result).toMatchObject({ status: "accepted", runId: childRunId });
    const [launch] = agentRequests();
    expect(requireRecord(launch?.params).idempotencyKey).toBe(childRunId);
    // The WebSocket fallback keeps callGateway's backend client default; spawn
    // must not downgrade it, or the Gateway rejects the reserved namespace.
    expect(launch).not.toHaveProperty("mode");
    expect(launch).not.toHaveProperty("clientName");
    expect(hoisted.registerSubagentRunMock).toHaveBeenCalledOnce();
    expect(requireRecord(hoisted.registerSubagentRunMock.mock.calls[0]?.[0]).runId).toBe(
      childRunId,
    );
    expect(hoisted.getSubagentRunByRunIdMock).toHaveBeenCalledWith(childRunId);
  });

  it("takes the run id from the key and the session key from the record identity", async () => {
    const result = await spawnSubagentDirect(
      {
        task: "continue",
        continuationChildRunId: childRunId,
        continuationDelegateFlowId: "record-1",
      },
      context,
    );

    expect(result).toMatchObject({
      status: "accepted",
      runId: childRunId,
      childSessionKey: deriveContinuationDelegateChildSessionKey("main", "record-1"),
    });
    expect(requireRecord(agentRequests()[0]?.params).idempotencyKey).toBe(childRunId);
  });

  it.each([
    {
      name: "a key outside the continuation namespace",
      params: { continuationChildRunId: "record-1:2" },
      error: "continuationChildRunId must be a continuation child run id",
    },
    {
      name: "a continuation key without an attempt id",
      params: { continuationChildRunId: "continuation:record-1" },
      error: "continuationChildRunId must be a continuation child run id",
    },
    {
      name: "a collector launch",
      params: { continuationChildRunId: childRunId, collect: true },
      error: "continuationChildRunId is not supported for collectors",
    },
    {
      name: "a collector replay key",
      params: { continuationChildRunId: childRunId, swarmLaunchReplayKey: "code-mode:1" },
      error: "continuationChildRunId is not supported for collectors",
    },
  ])("rejects $name before any child side effect", async ({ params, error }) => {
    hoisted.configOverride = createConfigOverride({ tools: { swarm: true } });

    const result = await spawnSubagentDirect({ task: "continue", ...params }, context);

    expect(result).toEqual({ status: "error", error });
    expectNoChildSideEffects();
  });

  it("refuses a key that already names a registry row before any child side effect", async () => {
    hoisted.getSubagentRunByRunIdMock.mockReturnValue({ runId: childRunId });

    const result = await spawnSubagentDirect(
      { task: "continue", continuationChildRunId: childRunId },
      context,
    );

    expect(result).toEqual({
      status: "error",
      error: `Launch run id ${childRunId} is already registered; refusing to replace it.`,
    });
    expectNoChildSideEffects();
  });

  it.each([
    {
      phase: "initialize",
      arrange: () => {
        hoisted.resolveContextEngineMock.mockRejectedValue(new Error("engine unavailable"));
      },
      dispatched: false,
    },
    {
      phase: "dispatch",
      arrange: () => {
        hoisted.callGatewayMock.mockImplementation(async (request) => {
          if ((request as { method?: string }).method === "agent") {
            throw new Error("gateway rejected the launch");
          }
          return { ok: true };
        });
      },
      dispatched: true,
    },
    {
      phase: "register",
      arrange: () => {
        hoisted.registerSubagentRunMock.mockImplementation(() => {
          throw new Error("registry unavailable");
        });
      },
      dispatched: true,
    },
  ] as const)(
    "reports a $phase-phase failure to the caller",
    async ({ phase, arrange, dispatched }) => {
      arrange();

      const keyed = await spawnSubagentDirect(
        { task: "continue", continuationChildRunId: childRunId },
        context,
      );

      expect(keyed).toMatchObject({ status: "error", failurePhase: phase });
      expect(agentRequests().length > 0).toBe(dispatched);

      // Model-facing sessions_spawn results stay unchanged without a launch key.
      const unkeyed = await spawnSubagentDirect({ task: "ordinary child" }, context);
      expect(unkeyed.status).toBe("error");
      expect(unkeyed).not.toHaveProperty("failurePhase");
    },
  );
});
