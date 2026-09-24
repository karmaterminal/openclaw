import type { SubagentAnnounceDeliveryResult } from "../announce/subagent-announce-dispatch.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

export function requesterCompletionSettlementNeedsTask(
  subagent: SubagentRunRecord,
  outcome: SubagentAnnounceDeliveryResult,
): boolean {
  if (subagent.pauseReason === "sessions_yield" || subagent.expectsCompletionMessage !== true) {
    return false;
  }
  const delivery = subagent.delivery;
  return (
    ["pending", "in_progress"].includes(delivery?.status ?? "pending") ||
    (outcome.delivered === true &&
      delivery?.status === "suspended" &&
      delivery.suspendedReason === "expiry")
  );
}
