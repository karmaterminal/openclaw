/** Native child-run dispatch for a subagent spawn, behind the continuation-ownership gate. */
import type { GatewayContextResolver } from "../../../gateway/server-methods/types.js";
import { registerSubagentTraceparentHandoff } from "../../subagent-traceparent-handoff.js";
import type { ContinuationSpawnParams } from "../announce/subagent-announce.runtime.js";
import type { bindSubagentSpawnCleanup } from "./subagent-spawn-cleanup.js";
import type { SpawnSubagentContext } from "./subagent-spawn-contract.js";
import { withSubagentGatewayExecutionIdentity } from "./subagent-spawn-execution-identity.js";
import type { buildSubagentSpawnGatewayIdentity } from "./subagent-spawn-gateway-identity.js";
import { callNativeSubagentGateway, readGatewayRunId } from "./subagent-spawn-gateway.js";
import type { buildSubagentLaunchRequest } from "./subagent-spawn-launch-request.js";

export function createSubagentChildRunLauncher(launch: {
  ctx: Pick<SpawnSubagentContext, "continuationDelegateAdmission">;
  traceparent: ContinuationSpawnParams["traceparent"];
  childIdem: string;
  childSessionKey: string;
  childLaunch: ReturnType<typeof buildSubagentLaunchRequest>["childLaunch"];
  gatewayIdentity: () => ReturnType<typeof buildSubagentSpawnGatewayIdentity>;
  gatewayContextResolver: GatewayContextResolver | undefined;
  cleanupOwner: ReturnType<typeof bindSubagentSpawnCleanup> | undefined;
  onAccepted: (acceptedChildRunId: string) => void;
}) {
  const { ctx, childIdem, childSessionKey, childLaunch } = launch;
  return async (assertDispatchCurrent?: () => void) => {
    // Our continuation-ownership gate runs before dispatch; upstream's accepted-run
    // binding runs after it. Independent gates, both required.
    ctx.continuationDelegateAdmission?.assertCurrent("gateway-dispatch");
    registerSubagentTraceparentHandoff({
      idempotencyKey: childIdem,
      sessionKey: childSessionKey,
      traceparent: launch.traceparent,
    });
    const result = await callNativeSubagentGateway(
      withSubagentGatewayExecutionIdentity(
        {
          method: "agent",
          assertDispatchCurrent,
          params: childLaunch.request,
          timeoutMs: childLaunch.timeoutMs,
        },
        launch.gatewayIdentity(),
      ),
      childLaunch.authorization,
      launch.gatewayContextResolver,
    );
    const acceptedChildRunId = readGatewayRunId(result.response) ?? childIdem;
    launch.onAccepted(acceptedChildRunId);
    launch.cleanupOwner?.bindAcceptedRun(acceptedChildRunId);
    return result;
  };
}
