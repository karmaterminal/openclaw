import "../agents/subagents/spawn/subagent-spawn-model.mocks.shared.js";
// Preserve module setup before modules that consume it.
// oxfmt-ignore
import { useQueuedCollectorFixture } from "./session-utils.queued-collector.test-support.js";
import { expectDefined } from "@openclaw/normalization-core";
import { describe, expect, it, vi } from "vitest";
import { createDeferred } from "../../test/helpers/promise.js";
import * as preparedModelRuntime from "../agents/prepared-model-runtime.js";
import * as registryMemory from "../agents/subagents/registry/subagent-registry-memory.js";
import { loadSubagentRegistryFromSqlite } from "../agents/subagents/registry/subagent-registry-state.fixture.test-support.js";
import * as subagentRegistry from "../agents/subagents/registry/subagent-registry.js";
import { spawnSubagentDirect } from "../agents/subagents/spawn/subagent-spawn.js";
import { testing as spawnTesting } from "../agents/subagents/spawn/subagent-spawn.test-support.js";
import { closeSwarmScheduler } from "../agents/subagents/swarm/swarm-scheduler.js";
import { clearAgentRunContext } from "../infra/agent-run-registry.js";
import { requestRpcSourceCancellation } from "../sessions/session-controller.rpc-sources.js";
import { rpcSourceTesting } from "../sessions/session-lifecycle-admission.test-support.js";
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
// Stop holds its retirement publication, and is discharged only after the child
// is stopped. Upstream #177787 retired the Stop's publication-preparation
// handshake; the Stop's retirement publication now spans its kill run, so the
// Stop is held right after its committed kill write, inside that publication.
describe("queued collector rollback custody behind a publishing Stop", () => {
  it.each([false, true])(
    "persists custody before the publication wait (stopFailure=%s)",
    async (stopFailure) => {
      const context = requestContext();
      const entered = createDeferred();
      const dispatched = createDeferred();
      const killWriteCommitted = createDeferred();
      const releaseStop = createDeferred();
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
      const markTerminated = subagentRegistry.markSubagentRunTerminated;
      const killGate = vi
        .spyOn(subagentRegistry, "markSubagentRunTerminated")
        .mockImplementation(async (params) => {
          const marked = await markTerminated(params);
          if (params.runId === nativeRunId) {
            killWriteCommitted.resolve();
            await releaseStop.promise;
            if (stopFailure) {
              throw new Error("Stop failed after its kill write");
            }
          }
          return marked;
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
        await Promise.race([
          Promise.all([dispatched.promise, killWriteCommitted.promise, cleanupWaiting.promise]),
          stopping.then(() => {
            throw new Error("Stop settled before its held kill write");
          }),
        ]);

        // The collector now waits on the Stop's retirement publication. A crash here must
        // leave a durable owner for the accepted child, and the Stop's staged
        // kill write must have kept its kill alongside that custody.
        const durable = loadSubagentRegistryFromSqlite().get(entry.runId);
        expect(durable?.acceptedSpawnRollback).toMatchObject({ gatewayRunId: nativeRunId });
        expect(durable?.endedReason).toBe("subagent-killed");
        expect(abortedRunIds).toEqual([]);

        releaseStop.resolve();
        await stopping;
        await dispatched.promise;
        await closeSwarmScheduler();
        // Upstream rows are immutable snapshots: read the same owner's current live row.
        const live = expectDefined(
          registryMemory.getCurrentSubagentRunOwner(registryMemory.subagentRuns, entry),
          "live collector owner",
        );
        expect(live.collectorCompletion?.status).toBe("killed");
        expect(abortedRunIds).toContain(nativeRunId);
        // Termination discharged the custody, so restart has nothing left to reconcile.
        const settled = loadSubagentRegistryFromSqlite().get(entry.runId);
        expect(settled?.acceptedSpawnRollback).toBeUndefined();
        expect(settled?.collectorCompletion?.status).toBe("killed");
      } finally {
        releaseStop.resolve();
        if (nativeRunId) {
          const source = rpcSourceTesting.get(nativeRunId);
          if (source) {
            requestRpcSourceCancellation(source);
          }
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
