import { getInternalSyncSteeringGetter } from "./internal-hooks.js";
import type { AgentLoopConfig, AgentMessage } from "./types.js";

/** Read queued steering messages, preferring the internal synchronous getter when present. */
export function getSteeringAtCheckpoint(
  config: AgentLoopConfig,
): AgentMessage[] | Promise<AgentMessage[]> {
  const callback = config.getSteeringMessages;
  if (!callback) {
    return [];
  }
  return getInternalSyncSteeringGetter(callback)?.() ?? callback.call(config);
}
