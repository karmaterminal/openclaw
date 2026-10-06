import "../agents/subagents/spawn/subagent-spawn-model.mocks.shared.js";
// Preserve module setup before modules that consume it.
// oxfmt-ignore
import { useQueuedCollectorFixture } from "./session-utils.queued-collector.test-support.js";
import { expectDefined } from "@openclaw/normalization-core";
import { describe, expect, it, vi } from "vitest";
import { createDeferred } from "../../test/helpers/promise.js";
import * as preparedModelRuntime from "../agents/prepared-model-runtime.js";
import * as killControl from "../agents/subagents/registry/subagent-control-kill.js";
import * as registryMemory from "../agents/subagents/registry/subagent-registry-memory.js";
import { loadSubagentRegistryFromSqlite } from "../agents/subagents/registry/subagent-registry-state.fixture.test-support.js";
import { spawnSubagentDirect } from "../agents/subagents/spawn/subagent-spawn.js";
import { testing as spawnTesting } from "../agents/subagents/spawn/subagent-spawn.test-support.js";
import { closeSwarmScheduler } from "../agents/subagents/swarm/swarm-scheduler.js";
import { clearAgentRunContext } from "../infra/agent-run-registry.js";
import { unwrapGatewayMethodDispatchResponse } from "./server-in-process-dispatch.js";
import { agentRunHandler } from "./server-methods/agent-run-handler.js";
import { handleChatAbortRequest } from "./server-methods/chat-abort-handler.js";
import { sessionAbortHandlers } from "./server-methods/sessions-abort.js";
import { sessionDeleteHandlers } from "./server-methods/sessions-delete.js";
import { createSyntheticPluginRuntimeClient } from "./server-plugin-runtime-client.js";
import type { dispatchGatewayMethodInProcess } from "./server-plugins.js";

const { parentKey, requestContext, operatorClient } = useQueuedCollectorFixture();

// The upstream admission test proves the Stop still wins this race. This one
// proves the accepted child's rollback custody is already durable while that
// Stop holds its publication, and is discharged only after the child is stopped.
describe("queued collector rollback custody behind a publishing Stop", () => {
  it.each([false, true])(
    "persists custody before the publication wait (publicationFailure=%s)",
    async (publicationFailure) => {
      const context = requestContext();
      const entered = createDeferred();
      const dispatched = createDeferred();
      const publicationEntered = createDeferred();
      const releasePublication = createDeferred();
      const cleanupWaiting = createDeferred();
      const abortedRunIds: string[] = [];
      let nativeRunId: string | undefined;
      let stopping: Promise<void> | undefined;
      const waitForPublication = registryMemory.waitForSubagentRetirementPublication;
      const publicationWait = vi
        .spyOn(registryMemory, "waitForSubagentRetirementPublication")
        .mockImplementation((entry) => {
          const pending = waitForPublication(entry);
          if (entry.runId === nativeRunId && pending) {
            cleanupWaiting.resolve();
          }
          return pending;
        });
      const kill = killControl.killSubagentRunAdmin;
      const killGate = vi
        .spyOn(killControl, "killSubagentRunAdmin")
        .mockImplementation((params, control) => {
          const currentControl = expectDefined(control, "native cancellation control");
          const preparation = expectDefined(
            currentControl.preparePublication,
            "native publication preparation",
          );
          return kill(params, {
            ...currentControl,
            preparePublication: {
              ...preparation,
              prepare: async (publishPrepared) => {
                publicationEntered.resolve();
                await releasePublication.promise;
                if (publicationFailure) {
                  throw new Error("publication preparation failed");
                }
                return await preparation.prepare(publishPrepared);
              },
            },
          });
        });
      const runtimeGate = vi
        .spyOn(preparedModelRuntime, "loadPublishedGatewayReplyDispatchRuntime")
        .mockImplementation(async ({ abortSignal }) => {
          const signal = expectDefined(abortSignal, "native admission abort signal");
          signal.throwIfAborted();
          entered.resolve();
          return await new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          });
        });
      spawnTesting.setDepsForTest({
        hasInProcessGatewayContext: () => true,
        dispatchGatewayMethodInProcess: async <T>(
          method: string,
          params: Record<string, unknown>,
          options?: Parameters<typeof dispatchGatewayMethodInProcess>[2],
        ) => {
          const respond = vi.fn();
          const request = {
            req: { type: "req" as const, id: "rollback-custody", method },
            params,
            respond,
            context,
            sessionMutationCommitGuard: options?.sessionMutationCommitGuard,
            client: createSyntheticPluginRuntimeClient({
              agentRunTracking: options?.agentRunTracking,
              scopes: options?.syntheticScopes,
            }),
            isWebchatConnect: () => false,
          };
          if (method === "agent") {
            nativeRunId = String(params.idempotencyKey);
            try {
              await agentRunHandler!(request);
            } finally {
              dispatched.resolve();
            }
          } else if (method === "chat.abort") {
            abortedRunIds.push(String(params.runId));
            await handleChatAbortRequest(request);
          } else if (method === "sessions.delete") {
            await expectDefined(
              sessionDeleteHandlers["sessions.delete"],
              "sessions.delete handler",
            )(request);
          } else {
            throw new Error(`Unexpected native cleanup method ${method}`);
          }
          const [ok, payload, error] = respond.mock.calls[0] ?? [];
          return unwrapGatewayMethodDispatchResponse(method, { ok, payload, error }) as T;
        },
      });
      try {
        const spawned = await spawnSubagentDirect(
          {
            task: "Do not execute before cancellation",
            label: "Rollback custody collector",
            collect: true,
            context: "isolated",
            lightContext: true,
          },
          {
            agentSessionKey: parentKey,
            requesterRunId: "parent-turn",
            requesterTurnRunId: "parent-turn",
          },
        );
        expect(spawned.status).toBe("accepted");
        await entered.promise;
        const entry = expectDefined(
          registryMemory.subagentRuns.get(spawned.runId!),
          "pending native collector",
        );
        stopping = Promise.resolve(
          sessionAbortHandlers["sessions.abort"]!({
            req: { type: "req", id: "stop-rollback-custody", method: "sessions.abort" },
            params: { key: entry.childSessionKey, runId: entry.runId },
            context,
            respond: vi.fn(),
            client: operatorClient(),
            isWebchatConnect: () => false,
          }),
        );
        await Promise.all([dispatched.promise, publicationEntered.promise, cleanupWaiting.promise]);

        // The collector now waits on the Stop's publication. A crash here must
        // leave a durable owner for the accepted child, and the Stop's staged
        // kill write must have kept its kill alongside that custody.
        const durable = loadSubagentRegistryFromSqlite().get(entry.runId);
        expect(durable?.acceptedSpawnRollback).toMatchObject({ gatewayRunId: nativeRunId });
        expect(durable?.endedReason).toBe("subagent-killed");
        expect(abortedRunIds).toEqual([]);

        releasePublication.resolve();
        await stopping;
        await dispatched.promise;
        await closeSwarmScheduler();
        expect(entry.collectorCompletion?.status).toBe("killed");
        expect(abortedRunIds).toContain(nativeRunId);
        // Termination discharged the custody, so restart has nothing left to reconcile.
        const settled = loadSubagentRegistryFromSqlite().get(entry.runId);
        expect(settled?.acceptedSpawnRollback).toBeUndefined();
        expect(settled?.collectorCompletion?.status).toBe("killed");
      } finally {
        releasePublication.resolve();
        if (nativeRunId) {
          context.chatAbortControllers.get(nativeRunId)?.controller.abort();
          await dispatched.promise;
          clearAgentRunContext(nativeRunId);
        }
        await stopping;
        killGate.mockRestore();
        runtimeGate.mockRestore();
        publicationWait.mockRestore();
      }
    },
  );
});
