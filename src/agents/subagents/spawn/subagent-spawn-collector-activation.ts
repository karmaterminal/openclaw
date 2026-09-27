/** Hands an accepted collector subagent registration to the swarm scheduler for launch. */
import { getCanonicalGatewayContextResolver } from "../../../plugins/runtime/gateway-request-scope.js";
import { activateSwarmRun } from "../swarm/swarm-scheduler.js";
import { createCollectorLaunchCallbacks } from "./subagent-spawn-collector.js";

export function activateSubagentCollectorSwarmRun(
  groupId: string,
  callbacks: Parameters<typeof createCollectorLaunchCallbacks>[0],
): void {
  const { gatewayContextResolver } = callbacks;
  activateSwarmRun({
    groupId,
    runId: callbacks.childRunId,
    lifecycleOwner: gatewayContextResolver
      ? getCanonicalGatewayContextResolver(gatewayContextResolver)
      : undefined,
    ...createCollectorLaunchCallbacks(callbacks),
  });
}
