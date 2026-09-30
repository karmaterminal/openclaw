// Imported by agent.test.ts to keep its mocked suite in one Vitest module graph.
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDeferred } from "../../../test/helpers/promise.js";
import type { AgentWaitResult } from "../../agents/run-wait.types.js";
import { writeSubagentSessionEntry } from "../../agents/subagents/registry/subagent-registry.persistence.test-support.js";
import {
  addSubagentRunForTests,
  getSubagentRunByChildSessionKey,
  listSubagentRunsForRequester,
  resetSubagentRegistryForTests,
} from "../../agents/subagents/registry/subagent-registry.test-helpers.js";
import {
  createPluginSubagentTestLifetime,
  withPluginSubagentTestState,
} from "./agent.spawned-child.test-support.js";
import {
  getAgentTestMocks,
  makeContext,
  requireValue,
  expectRecordFields,
  backendGatewayClient,
  invokeAgent,
  describe0AfterEach0,
} from "./agent.test-harness.js";

const mocks = getAgentTestMocks();

describe("gateway agent handler", () => {
  afterEach(describe0AfterEach0);

  it("registers normally when a follow-up to a paused session names its own requester", async () => {
    await withPluginSubagentTestState(
      "openclaw-gateway-plugin-subagent-own-requester-",
      async ({ stateDir: root }) => {
        resetSubagentRegistryForTests({ persist: false });
        const childSessionKey = "agent:work:subagent:plugin-yield-own-requester";
        const originalRequester = "agent:main:telegram:direct:777";
        const previousRunId = "plugin-subagent-paused";
        const runId = "plugin-subagent-own-requester";
        await using fixture = createPluginSubagentTestLifetime({ root, runId, childSessionKey });
        const followUpRequester = {
          sessionKey: "agent:main:telegram:direct:555",
          origin: { channel: "telegram", to: "telegram:555", accountId: "work" },
        } as const;
        const cfg = {
          session: { mainKey: "main", scope: "per-sender" },
          agents: { list: [{ id: "main", default: true }, { id: "work" }] },
        } satisfies typeof mocks.loadConfigReturn;
        mocks.listAgentIds.mockReturnValue(["main", "work"]);
        mocks.loadConfigReturn = cfg;
        mocks.userTurnStorePath = path.join(root, "agents", "work", "sessions", "sessions.json");
        mocks.loadSessionEntry.mockReturnValue({
          cfg,
          storePath: mocks.userTurnStorePath,
          entry: { sessionId: "spawned-child-session", updatedAt: Date.now() },
          canonicalKey: childSessionKey,
        });
        mocks.updateSessionStore.mockResolvedValue(undefined);
        await writeSubagentSessionEntry({
          stateDir: root,
          agentId: "work",
          sessionKey: childSessionKey,
          sessionId: "spawned-child-session",
          updatedAt: Date.now(),
          defaultSessionId: "spawned-child-session",
        });
        const result = "The separately requested follow-up is complete.";
        const completion = createDeferred<AgentWaitResult>();
        const announce = mocks.registryAnnounce.mockResolvedValue("delivered");
        mocks.registryCallGateway.mockReturnValue(completion.promise);
        addSubagentRunForTests({
          runId: previousRunId,
          childSessionKey,
          requesterSessionKey: originalRequester,
          requesterDisplayKey: originalRequester,
          task: "wait for the remote job",
          endedAt: 2_000,
          pauseReason: "sessions_yield",
          expectsCompletionMessage: true,
        });
        mocks.agentCommand.mockImplementation(async () => {
          completion.resolve({
            status: "ok",
            startedAt: Date.now(),
            endedAt: Date.now(),
            terminalReply: { disposition: "visible", text: result },
          });
          return { payloads: [{ text: result }], meta: { durationMs: 1 } };
        });
        const context = makeContext();
        const baseClient = requireValue(backendGatewayClient(), "expected backend client");

        const response = await fixture.work.track(() =>
          invokeAgent(
            {
              message: "deliver to me instead",
              sessionKey: childSessionKey,
              idempotencyKey: runId,
            },
            {
              context,
              reqId: runId,
              client: {
                connect: baseClient.connect,
                internal: {
                  ...baseClient.internal,
                  agentRunTracking: "plugin_subagent",
                  pluginSubagentRequester: followUpRequester,
                  pluginRuntimeOwnerId: "memory-core",
                },
              },
            },
          ),
        );
        expect(response.mock.calls[0]?.[0], JSON.stringify(response.mock.calls[0])).toBe(true);
        await fixture.cleanupCompleted;
        expectRecordFields(context.dedupe.get(`agent:${runId}`)?.payload, { status: "ok" });
        expect(announce).toHaveBeenCalledTimes(1);

        // An explicit requester is a delivery opt-in. Adopting the paused row here
        // would drop that audience with nothing recording why, so the follow-up
        // gets its own row and the paused run keeps its original requester.
        const originalRuns = listSubagentRunsForRequester(originalRequester);
        expect(originalRuns.map((entry) => entry.runId)).toEqual([previousRunId]);
        expectRecordFields(requireValue(originalRuns[0], "expected original paused owner"), {
          requesterSessionKey: originalRequester,
          pauseReason: "sessions_yield",
          cleanupCompletedAt: undefined,
        });
        const run = requireValue(
          getSubagentRunByChildSessionKey(childSessionKey),
          "expected separately registered plugin subagent run",
        );
        expectRecordFields(run.delivery, { status: "delivered" });
        expectRecordFields(run, {
          runId,
          requesterSessionKey: followUpRequester.sessionKey,
          requesterOrigin: followUpRequester.origin,
        });
        expect(announce).toHaveBeenCalledWith(
          expect.objectContaining({
            childSessionKey,
            childRunId: runId,
            requesterSessionKey: followUpRequester.sessionKey,
            roundOneReply: result,
          }),
        );
      },
    );
  });
});
