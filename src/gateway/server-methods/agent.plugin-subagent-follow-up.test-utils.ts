// Imported by agent.test.ts to keep its mocked suite in one Vitest module graph.
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDeferred } from "../../../test/helpers/promise.js";
import { prepareAgentRunTerminalReply } from "../../agents/agent-run-terminal-reply.js";
import type { AgentWaitResult } from "../../agents/run-wait.types.js";
import { readSubagentRunAnnounceResult } from "../../agents/subagents/announce/subagent-announce-output.js";
import { subagentRuns } from "../../agents/subagents/registry/subagent-registry-memory.js";
import { writeSubagentSessionEntry } from "../../agents/subagents/registry/subagent-registry.persistence.test-support.js";
import {
  addSubagentRunForTests,
  getSubagentRunByChildSessionKey,
  listSubagentRunsForRequester,
  resetSubagentRegistryForTests,
} from "../../agents/subagents/registry/subagent-registry.test-helpers.js";
import {
  appendTranscriptMessage,
  replaceSessionEntry,
} from "../../config/sessions/session-accessor.js";
import { racePromiseWithAbortSignal } from "../../infra/abort-signal.js";
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

  it("registers normally when a follow-up to a paused session names its own requester", async ({
    signal,
  }) => {
    await withPluginSubagentTestState(
      "openclaw-gateway-plugin-subagent-own-requester-",
      async ({ stateDir: root }) => {
        await resetSubagentRegistryForTests({ persist: false });
        const childSessionKey = "agent:work:subagent:plugin-yield-own-requester";
        const originalRequester = "agent:main:telegram:direct:777";
        const previousRunId = "plugin-subagent-paused";
        const runId = "plugin-subagent-own-requester";
        await using fixture = createPluginSubagentTestLifetime({ root, runId, childSessionKey });
        const followUpRequester = {
          sessionKey: "agent:main:telegram:direct:555",
          origin: { channel: "telegram", to: "telegram:555", accountId: "work" },
        } as const;
        await replaceSessionEntry(
          {
            agentId: "main",
            sessionKey: followUpRequester.sessionKey,
            storePath: path.join(root, "agents", "main", "sessions", "sessions.json"),
          },
          { sessionId: "followup-requester", updatedAt: Date.now() },
        );
        const cfg = {
          session: { mainKey: "main", scope: "per-sender" },
          agents: { entries: { main: {}, work: {} } },
        } satisfies typeof mocks.loadConfigReturn;
        mocks.listAgentIds.mockReturnValue(["main", "work"]);
        mocks.loadConfigReturn = cfg;
        mocks.userTurnStorePath = await writeSubagentSessionEntry({
          stateDir: root,
          agentId: "work",
          sessionKey: childSessionKey,
          defaultSessionId: "spawned-child-session",
        });
        mocks.loadSessionEntry.mockReturnValue({
          cfg,
          storePath: mocks.userTurnStorePath,
          entry: { sessionId: "spawned-child-session", updatedAt: Date.now() },
          canonicalKey: childSessionKey,
        });
        mocks.updateSessionStore.mockResolvedValue(undefined);
        const result = `${"Completed follow-up detail. ".repeat(200)}The separately requested follow-up is complete.`;
        const { terminalReply } = prepareAgentRunTerminalReply({ rawText: result });
        const completion = createDeferred<AgentWaitResult>();
        const announce = mocks.registryAnnounce.mockResolvedValue("delivered");
        mocks.registryCallGateway.mockReturnValue(completion.promise);
        await addSubagentRunForTests({
          runId: previousRunId,
          childSessionKey,
          requesterSessionKey: originalRequester,
          requesterDisplayKey: originalRequester,
          task: "wait for the remote job",
          endedAt: 2_000,
          pauseReason: "sessions_yield",
          expectsCompletionMessage: true,
        });
        await replaceSessionEntry(
          { agentId: "work", sessionKey: childSessionKey, storePath: mocks.userTurnStorePath },
          { sessionId: "spawned-child-session", updatedAt: Date.now() },
        );
        mocks.agentCommand.mockImplementation(async () => {
          await appendTranscriptMessage(
            {
              agentId: "work",
              sessionKey: childSessionKey,
              sessionId: "spawned-child-session",
              storePath: mocks.userTurnStorePath!,
            },
            {
              message: {
                role: "assistant",
                display: true,
                content: result,
                stopReason: "stop",
                __openclaw: { runId },
              },
            },
          );
          completion.resolve({
            status: "ok",
            startedAt: Date.now(),
            endedAt: Date.now(),
            terminalReply,
          });
          return {
            payloads: [{ text: result }],
            meta: { durationMs: 1, terminalReply },
          };
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
        await racePromiseWithAbortSignal(fixture.cleanupCompleted, signal);
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
          await getSubagentRunByChildSessionKey(childSessionKey),
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
            terminalReply,
          }),
        );
        // Keep the live owner read independent of post-cleanup payload compaction.
        const prepared = await readSubagentRunAnnounceResult(run, (id) => subagentRuns.get(id));
        expect(prepared.text).toBe(result);
        expect(prepared.isCurrent()).toBe(true);
      },
    );
  });
});
