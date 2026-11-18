// Continuation custody across a Gateway restart (RFC docs/design/continue-work-signal-v2.md
// §5.4.4, boundary 5). A continuation delegate hands custody to its `subagent_runs` row at
// admission. Upstream #185730 keeps restored rows as history and no longer settles a child that
// the previous lifecycle left running, so a delegate the bounded shutdown kill did not reach, or
// one a crash stranded, would stay `running` with no execution owner. A delegate the shutdown
// kill did reach keeps a provisional kill nobody confirms, and upstream #199868 retains its
// pending delivery across the restart. Gateway activation settles those rows once: terminal with
// an explicit interruption or the kill, no completion text, never relaunched, and no
// child-session effects. The lifecycle owner then finishes cleanup without the delegate's own
// requester delivery or settle wake; the root's resume input (graceful restart) or the user
// (crash) reconciles.
import { isAgentEventLifecycleGenerationCurrent } from "../../../infra/agent-events.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { withSubagentOutcomeTiming } from "../announce/subagent-announce-output.js";
import { resolveSubagentChildAuthority } from "./subagent-child-owner-match.js";
import { ensureDeliveryState } from "./subagent-delivery-state.js";
import { SUBAGENT_ENDED_REASON_ERROR } from "./subagent-lifecycle-events.js";
import {
  safeRemoveAttachmentsDir,
  shouldRemoveSubagentAttachments,
} from "./subagent-registry-helpers.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import { mutateSubagentRuns } from "./subagent-registry-persistence.js";
import { isAcceptedSpawnCustodyRow } from "./subagent-registry-spawn-acceptance.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { isSameSubagentRunOwner } from "./subagent-run-generation.js";
import { hasSubagentRunEnded } from "./subagent-run-liveness.js";

const log = createSubsystemLogger("agents/subagent-registry");

const SUBAGENT_RESTART_INTERRUPTED_ERROR =
  "subagent run interrupted: the Gateway restarted before it ended";

/**
 * A delegate execution owned only by an earlier lifecycle: rotation makes every prior-generation
 * owner unreachable. A pending kill keeps the sweeper's durable kill reconcile until restore
 * retires the row's completion authority; the sweeper never reconciles a retired row, so that
 * kill is settled here.
 */
function isOwnerlessExecution(entry: SubagentRunRecord): boolean {
  const { lifecycleGeneration, status } = entry.execution;
  return (
    !hasSubagentRunEnded(entry) &&
    (status === "running" || status === "interrupted") &&
    !(lifecycleGeneration && isAgentEventLifecycleGenerationCurrent(lifecycleGeneration)) &&
    (!entry.killIntent || subagentRuns.isCompletionAuthorityRetired(entry))
  );
}

/**
 * A kill the earlier lifecycle left provisional after its owner decided the requester is not told:
 * the graceful shutdown kill, or an abort the requester already made. Its live settlement ended
 * with that lifecycle and the sweeper never confirms a kill on a retired row, so the requester
 * would wait on a result that cannot arrive. A requester delivery the earlier lifecycle committed
 * (a transcript handoff, or a settle cohort that holds the row) keeps its own owner.
 */
function isUnconfirmedSuppressedKill(entry: SubagentRunRecord): boolean {
  return (
    entry.killReconciliation?.suppressTaskDelivery === true &&
    subagentRuns.isCompletionAuthorityRetired(entry) &&
    entry.delivery?.status === "pending" &&
    !entry.delivery.requesterDelivery &&
    !entry.requesterSettleWake
  );
}

/** H1 acceptance custody keeps its own owner. */
function isOwnerlessContinuationChild(entry: SubagentRunRecord): boolean {
  return (
    entry.drainsContinuationDelegateQueue === true &&
    (isOwnerlessExecution(entry) || isUnconfirmedSuppressedKill(entry)) &&
    !isAcceptedSpawnCustodyRow(entry) &&
    resolveSubagentChildAuthority(entry).status !== "mismatch"
  );
}

/**
 * Runs on Gateway activation, before the root resume input can inspect these children. Best
 * effort: a failed write is logged and the rows wait for the next activation, so it never
 * blocks the restart resume.
 */
export async function settleOwnerlessContinuationChildren(
  startSubagentAnnounceCleanupFlow: (entry: SubagentRunRecord) => boolean,
): Promise<void> {
  const selected = [...subagentRuns.values()].filter(isOwnerlessContinuationChild);
  if (selected.length === 0) {
    return;
  }
  const endedAt = Date.now();
  const settled = await mutateSubagentRuns(
    selected.map((entry) => entry.runId),
    (rows) => {
      const postimages = new Map<string, SubagentRunRecord>();
      for (const expected of selected) {
        const current = rows.get(expected.runId);
        if (
          !current ||
          !isSameSubagentRunOwner(current, expected) ||
          !isOwnerlessContinuationChild(current)
        ) {
          continue;
        }
        const entry = structuredClone(current);
        if (entry.killReconciliation) {
          // The kill stands with its own outcome, and cleanup reopens as the sweeper's
          // confirmation does. Unlike that confirmation it keeps `suppressAnnounceReason`, so
          // cleanup keeps the row inspectable instead of retiring it.
          entry.killReconciliation = undefined;
          entry.cleanupHandled = false;
          entry.cleanupCompletedAt = undefined;
        } else {
          entry.execution = {
            ...entry.execution,
            status: "terminal",
            endedAt,
            suppressSessionEffects: true,
            outcome: withSubagentOutcomeTiming(
              { status: "error", error: SUBAGENT_RESTART_INTERRUPTED_ERROR },
              { startedAt: entry.execution.startedAt, endedAt },
            ),
          };
          entry.endedReason = SUBAGENT_ENDED_REASON_ERROR;
          // A kill the earlier lifecycle never finished has no owner either. Recording it as a
          // kill would retire the row at cleanup; the interruption keeps it inspectable.
          entry.killIntent = undefined;
        }
        entry.suppressCompletionDelivery = true;
        ensureDeliveryState(entry).disposition = "intentional_non_delivery";
        postimages.set(entry.runId, entry);
      }
      return { value: [...postimages.values()], postimages };
    },
    { runs: subagentRuns },
  ).catch((error: unknown) => {
    log.warn("failed to settle continuation children left running by an earlier Gateway", {
      error,
      runIds: selected.map((entry) => entry.runId),
    });
    return [];
  });
  for (const entry of settled) {
    // Suppressed session effects skip the cleanup flow's own removal. A shutdown kill keeps
    // that rule; an interrupted run has no kill, so its attachments are released here.
    if (
      entry.endedReason === SUBAGENT_ENDED_REASON_ERROR &&
      shouldRemoveSubagentAttachments(entry)
    ) {
      await safeRemoveAttachmentsDir(entry);
    }
    startSubagentAnnounceCleanupFlow(entry);
  }
}
