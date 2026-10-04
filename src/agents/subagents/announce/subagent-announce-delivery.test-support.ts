export * from "./subagent-announce-delivery.js";

import { expect, it, vi } from "vitest";
import type { GatewayContextResolver } from "../../../gateway/server-methods/types.js";
import { createSubagentRunRecord, mockCallArg } from "../../subagent-test-fixtures.test-helpers.js";
import type { SubagentAcceptedSteerDispatch } from "../registry/subagent-registry.types.js";
import {
  hasAnnounceSendEvidence,
  runAnnounceDeliveryWithRetry,
  SourceOwnerChangedError,
} from "./subagent-announce-delivery-retry.js";
import { setSubagentAnnounceDeliveryDepsForTest } from "./subagent-announce-overrides.test-support.js";

export const testing = {
  setDepsForTest: setSubagentAnnounceDeliveryDepsForTest,
  hasAnnounceSendEvidence,
};

type WakeSubagentRunAfterDescendants =
  typeof import("./subagent-announce-descendant-wake.js").wakeSubagentRunAfterDescendants;
type DescendantWakeDeps = Parameters<WakeSubagentRunAfterDescendants>[1];
type DescendantWakeRegistryRuntime = Awaited<
  ReturnType<DescendantWakeDeps["loadSubagentRegistryRuntime"]>
>;

export function registerDescendantWakeCurrencyTests({
  createRoleRestrictedInProcessGatewayMock,
  createGatewayMock,
  wakeSubagentRunAfterDescendants,
}: {
  wakeSubagentRunAfterDescendants: WakeSubagentRunAfterDescendants;
  createRoleRestrictedInProcessGatewayMock: (response: Record<string, unknown>) => {
    cfg: ReturnType<DescendantWakeDeps["getRuntimeConfig"]>;
    dispatchGatewayMethodInProcess: DescendantWakeDeps["dispatchGatewayMethodInProcess"];
  };
  createGatewayMock: (response?: Record<string, unknown>) => DescendantWakeDeps["callGateway"];
}) {
  it.each(["current", "changed", "unavailable"] as const)(
    "settles descendant wakes under restrictive gateway roles with %s currency",
    async (currency) => {
      // A runtime run ID distinct from the wake idempotency key must carry the
      // Gateway's accepted discriminant before it can claim the wake reservation.
      const { cfg, dispatchGatewayMethodInProcess } = createRoleRestrictedInProcessGatewayMock({
        runId: "descendant-wake-run",
        status: "accepted",
      });
      const resolveGatewayContext: GatewayContextResolver = () => undefined;
      const signal = new AbortController().signal;
      const sourceEntry = createSubagentRunRecord({
        runId: "nested-parent-run",
        childSessionKey: "agent:main:subagent:nested-parent",
        task: "collect descendant findings",
        endedAt: Date.now(),
      });
      const replaceSubagentRunAfterSteer = vi.fn<
        DescendantWakeRegistryRuntime["replaceSubagentRunAfterSteerCore"]
      >(() => true);
      const recordAcceptedSubagentSteerDispatch = vi.fn<
        DescendantWakeRegistryRuntime["recordAcceptedSubagentSteerDispatch"]
      >((params) => {
        const dispatch: SubagentAcceptedSteerDispatch = {
          gatewayRunId: params.gatewayRunId,
          phase: params.phase,
          lifecycleGeneration: params.lifecycleGeneration,
          expectedSessionId: params.expectedSessionId,
          expectedLifecycleRevision: params.expectedLifecycleRevision,
        };
        sourceEntry.acceptedSteerDispatch = dispatch;
        return {
          status: "persisted" as const,
          ownerRunId: sourceEntry.runId,
          owner: sourceEntry,
          dispatch,
        };
      });
      const clearSubagentRunSteerRestart = vi.fn<
        DescendantWakeRegistryRuntime["clearSubagentRunSteerRestart"]
      >(() => true);
      let accepted = false;
      const dispatch = vi.mocked(dispatchGatewayMethodInProcess);
      const dispatchWithRoleCheck = dispatch.getMockImplementation()!;
      dispatch.mockImplementation(async (...args) => {
        const response = await dispatchWithRoleCheck(...args);
        accepted = true;
        return response;
      });
      const callGateway = createGatewayMock({
        aborted: true,
        runIds: ["descendant-wake-run"],
      });
      testing.setDepsForTest({
        getRuntimeConfig: () => cfg,
        loadSessionEntryByKey: async () => ({ sessionId: "nested-session", updatedAt: 1 }),
      });

      const outcome = await wakeSubagentRunAfterDescendants(
        {
          runId: "nested-parent-run",
          childSessionKey: "agent:main:subagent:nested-parent",
          taskLabel: "collect descendant findings",
          findings: "The descendant completed successfully.",
          announceId: "descendant-completion",
          prepareCurrent: async () => {
            if (accepted && currency === "unavailable") {
              throw new Error("currency reader closed");
            }
            return !accepted || currency === "current";
          },
          isChildSessionEffectsAllowed: () => true,
          resolveGatewayContext,
          signal,
        },
        {
          callGateway,
          dispatchGatewayMethodInProcess,
          getRuntimeConfig: () => cfg,
          loadSubagentRegistryRuntime: async () => ({
            clearSubagentRunSteerRestart,
            getSubagentRunByRunId: () => sourceEntry,
            recordAcceptedSubagentSteerDispatch,
            replaceSubagentRunAfterSteerCore: replaceSubagentRunAfterSteer,
          }),
        },
      );

      expect(outcome).toBe(currency === "current" ? "woke" : "not-woken");
      expect(mockCallArg(dispatchGatewayMethodInProcess, 0, 2)).toMatchObject({
        cancelOnDeadline: true,
        resolveGatewayContext,
        signal,
      });
      if (currency === "current") {
        expect(callGateway).not.toHaveBeenCalled();
        expect(replaceSubagentRunAfterSteer).toHaveBeenCalledWith(
          expect.objectContaining({
            previousRunId: "nested-parent-run",
            nextRunId: "descendant-wake-run",
          }),
        );
      } else {
        expect(replaceSubagentRunAfterSteer).not.toHaveBeenCalled();
        expect(callGateway).toHaveBeenCalledWith(
          expect.objectContaining({
            method: "chat.abort",
            params: {
              sessionKey: "agent:main:subagent:nested-parent",
              runId: "descendant-wake-run",
            },
          }),
        );
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
}
