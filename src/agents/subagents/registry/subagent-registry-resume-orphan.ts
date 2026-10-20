import { hasRetainedRequiredCompletionDelivery } from "./subagent-delivery-state.js";
import { SUBAGENT_ENDED_REASON_ERROR } from "./subagent-lifecycle-events.js";
import type { SubagentCompletionRequest, SubagentRunRecord } from "./subagent-registry.types.js";
import type { SubagentRunOrphanReason } from "./subagent-session-reconciliation.js";

/**
 * Settle a resumed run whose orphan check already resolved. Returns false when
 * the run is not an orphan, or when its requester delivery is still durable.
 */
export function handleOrphanedSubagentResume(params: {
  runId: string;
  entry: SubagentRunRecord;
  orphanReason: SubagentRunOrphanReason | null;
  complete: (completion: SubagentCompletionRequest, source: string) => Promise<void>;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  isHostCurrent?: () => boolean;
}): boolean {
  if (!params.orphanReason) {
    return false;
  }
  // The child session may be gone while its requester delivery remains durable.
  // Keep that owner intact and let the delivery recovery path resume it.
  if (hasRetainedRequiredCompletionDelivery(params.entry)) {
    return false;
  }
  const { isHostCurrent } = params;
  // An orphan still owns its task and requester obligation. Settle through
  // the same completion path before cleanup can remove that ownership.
  void params
    .complete(
      {
        runId: params.runId,
        expectedEntry: params.entry,
        endedAt: params.entry.execution.endedAt ?? Date.now(),
        outcome: { status: "error", error: `subagent run orphaned: ${params.orphanReason}` },
        reason: SUBAGENT_ENDED_REASON_ERROR,
        triggerCleanup: true,
        ...(isHostCurrent
          ? { recoveryCurrent: { isHostCurrent, prepare: async () => isHostCurrent() } }
          : {}),
      },
      "orphan-resume",
    )
    .catch((error: unknown) => {
      params.warn("failed to settle orphaned subagent run", { runId: params.runId, error });
    });
  return true;
}
