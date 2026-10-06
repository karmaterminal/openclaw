/**
 * Gate 2.5 F12: scheduled heartbeat wakes keep continuation trigger mapping and
 * trusted routing whether or not a Gateway context resolver is wired.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createTestGatewayScheduler } from "../test-utils/gateway-scheduler-clock.js";
import {
  createLog,
  runtimeServiceMocks as hoisted,
  resetRuntimeServiceMocks,
} from "./server-runtime-services.test-harness.js";

const { activateGatewayScheduledServices } = await import("./server-runtime-services.js");

function activate(resolveGatewayContext?: () => undefined) {
  const services = activateGatewayScheduledServices({
    scheduler: createTestGatewayScheduler(),
    minimalTestGateway: false,
    cfgAtStart: {} as never,
    deps: {} as never,
    sessionDeliveryRecoveryMaxEnqueuedAt: 123,
    cronEnabled: true,
    log: createLog(),
    ...(resolveGatewayContext ? { resolveGatewayContext } : {}),
  });
  const runOnce = hoisted.startHeartbeatRunner.mock.calls[0]?.[0].runOnce;
  return { services, runOnce };
}

describe("scheduled heartbeat continuation routing", () => {
  beforeEach(() => {
    resetRuntimeServiceMocks();
  });

  it.each([
    { name: "with a Gateway context resolver", resolver: () => undefined },
    { name: "without a Gateway context resolver", resolver: undefined },
  ])("maps continuation wakes through the continuation runner $name", async ({ resolver }) => {
    const { services, runOnce } = activate(resolver);
    try {
      if (!runOnce) {
        throw new Error("Expected the Gateway to supply a continuation-aware heartbeat runner");
      }
      await runOnce({
        agentId: "main",
        reason: "delegate-return",
        sessionKey: "agent:main:subagent:child",
        trustedContinuationRouting: true,
      } as never);

      expect(hoisted.runHeartbeatOnce).toHaveBeenCalledOnce();
      const [runOptions] = (hoisted.runHeartbeatOnce.mock.calls[0] ?? []) as unknown[];
      expect(runOptions).toMatchObject({
        continuationTrigger: "delegate-return",
        trustedTargetSessionKey: "agent:main:subagent:child",
      });
    } finally {
      services.heartbeatRunner.stop();
    }
  });
});
