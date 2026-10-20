// Provisional kill confirmation, split from subagent-registry.ts for its line budget.
// The registry facade supplies the reconcile step; this owner only sequences it after
// controller-operation settlement and behind any kill owner still settling its claim.
import { runWithGatewayDetachedWorkAdmission } from "../../../process/gateway-work-admission.js";
import { findSessionControllerOperationByRunId } from "../../../sessions/session-controller.queries.js";
import { runInDetachedAsyncContext } from "../../../shared/detached-async-context.js";
import { subagentRegistryLog as log } from "./subagent-registry-lifecycle-log.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { isSameSubagentRunOwner } from "./subagent-run-generation.js";

export function createSubagentKillConfirmation(
  reconcile: (current: SubagentRunRecord) => Promise<unknown>,
) {
  // Runs whose kill owner is still settling its claim, and whether a confirmation waited on it.
  const settlingKillOwners = new Map<string, { owners: number; deferred: boolean }>();

  /**
   * Runs one kill owner's claim settlement. A kill confirmation that arrives meanwhile waits,
   * and runs once the last owner finishes publishing under its claim.
   */
  async function withSubagentKillOwner<T>(runId: string, settle: () => Promise<T>): Promise<T> {
    const owner = settlingKillOwners.get(runId) ?? { owners: 0, deferred: false };
    owner.owners += 1;
    settlingKillOwners.set(runId, owner);
    try {
      return await settle();
    } finally {
      owner.owners -= 1;
      if (owner.owners === 0) {
        settlingKillOwners.delete(runId);
        const current = subagentRuns.get(runId);
        if (owner.deferred && current?.killReconciliation) {
          confirmProvisionalSubagentKill(current);
        }
      }
    }
  }

  /**
   * Confirms a provisional kill once the killed run's controller operation settles, when its
   * canonical outcome is final, and once a live requester turn that claims the row has
   * transferred its children. Without such operations the kill confirms immediately; a kill
   * owner still settling its claim confirms it itself when done.
   */
  function confirmProvisionalSubagentKill(entry: SubagentRunRecord): void {
    const settlements = [entry.runId, entry.requesterTurnRunId].flatMap((runId) => {
      const operation = runId ? findSessionControllerOperationByRunId(runId) : undefined;
      return operation ? [operation.ownerSettlement] : [];
    });
    // The caller may be the killed run's own terminal callback; never inherit its turn context.
    void runInDetachedAsyncContext(() => confirmAfterSettlements(entry, settlements));
  }

  async function confirmAfterSettlements(
    entry: SubagentRunRecord,
    settlements: readonly Promise<void>[],
  ): Promise<void> {
    await Promise.allSettled(settlements);
    await runWithGatewayDetachedWorkAdmission(async () => {
      const current = subagentRuns.get(entry.runId);
      if (!current?.killReconciliation || !isSameSubagentRunOwner(current, entry)) {
        return;
      }
      const owner = settlingKillOwners.get(current.runId);
      if (owner) {
        owner.deferred = true;
        return;
      }
      await reconcile(current);
    }, "subagents:kill-confirm").catch((error: unknown) => {
      // The sweeper reconciles a kill whose confirmation could not run here.
      log.warn("failed to confirm provisional subagent kill", { runId: entry.runId, error });
    });
  }

  return { withSubagentKillOwner, confirmProvisionalSubagentKill };
}
