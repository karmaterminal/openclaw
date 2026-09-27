import { hasRetainedRequiredCompletionDelivery } from "./subagent-delivery-state.js";
import { SUBAGENT_ENDED_REASON_ERROR } from "./subagent-lifecycle-events.js";
import type { SubagentCompletionRequest, SubagentRunRecord } from "./subagent-registry.types.js";
import { resolveSubagentRunOrphanReason } from "./subagent-session-reconciliation.js";

export function handleOrphanedSubagentResume(params: {
  runId: string;
  entry: SubagentRunRecord;
  source: "live" | "restore";
  complete: (completion: SubagentCompletionRequest, source: string) => Promise<void>;
  warn: (message: string, meta?: Record<string, unknown>) => void;
}): boolean {
  // The child session may be gone while its requester delivery remains durable.
  // Keep that owner intact and let the delivery recovery path resume it.
  if (hasRetainedRequiredCompletionDelivery(params.entry)) {
    return false;
  }
  const orphanReason = resolveSubagentRunOrphanReason({
    entry: params.entry,
    includeStaleUnended: params.source === "restore",
  });
  if (!orphanReason) {
    return false;
  }
  void params
    .complete(
      {
        runId: params.runId,
        expectedEntry: params.entry,
        endedAt: params.entry.execution.endedAt ?? Date.now(),
        outcome: { status: "error", error: `subagent run orphaned: ${orphanReason}` },
        reason: SUBAGENT_ENDED_REASON_ERROR,
        triggerCleanup: true,
      },
      "orphan-resume",
    )
    .catch((error: unknown) => {
      params.warn("failed to settle orphaned subagent run", { runId: params.runId, error });
    });
  return true;
}
