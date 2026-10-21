// Continuation (karmaterminal): settles reset-retention marks (session-reset-retention.ts). Runs at
// the end of each reset flow for that reset's marks, and at Gateway boot for marks a previous
// process left pending.
import {
  listPendingContinuationResetRetentions,
  settleContinuationResetRetentions,
} from "../../agents/subagents/registry/subagent-continuation-reset-retention.js";
import { killSubagentRunAdmin } from "../../agents/subagents/registry/subagent-control-kill.js";
import type { SubagentRunRecord } from "../../agents/subagents/registry/subagent-registry.types.js";
import { readSessionEntryReadOnlyInWorker } from "../../config/sessions/session-entry-read-runtime.js";
import { resolveAllAgentSessionStoreTargetsSync } from "../../config/sessions/targets.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  loadPendingSessionDeliveries,
  moveSessionDeliveryToFailed,
} from "../../infra/session-delivery-queue-storage.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { captureOpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.js";

const log = createSubsystemLogger("continuation/reset-retention");

type RetentionOutcome = "adopted" | "aborted" | "orphaned";

function classifyRetention(
  mark: NonNullable<SubagentRunRecord["continuationResetRetention"]>,
  row: SessionEntry | undefined,
): RetentionOutcome | undefined {
  if (!row) {
    return "orphaned";
  }
  if (row.lifecycleRevision === mark.toRevision) {
    return "adopted";
  }
  return row.lifecycleRevision === mark.fromRevision ? "aborted" : undefined;
}

/**
 * Settles pending marks: `resetId` selects one reset's marks (its own flow), `markedBefore`
 * selects marks a previous process left (boot). A mark whose session row holds neither revision
 * stays pending and keeps its results held: a third lifecycle owns that row, and releasing to it
 * is not proven.
 */
export async function resolveContinuationResetRetentions(params: {
  cfg: OpenClawConfig;
  sessionKey?: string;
  agentId?: string;
  storePath?: string;
  resetId?: string;
  markedBefore?: number;
}): Promise<void> {
  const pending = listPendingContinuationResetRetentions({
    sessionKey: params.sessionKey,
    agentId: params.agentId,
  }).filter((entry) => {
    const mark = entry.continuationResetRetention;
    return (
      mark !== undefined &&
      (params.resetId === undefined || mark.resetId === params.resetId) &&
      (params.markedBefore === undefined || mark.markedAt < params.markedBefore)
    );
  });
  if (pending.length === 0) {
    return;
  }
  const storePaths = new Map(
    resolveAllAgentSessionStoreTargetsSync(params.cfg).map((target) => [
      target.agentId,
      target.storePath,
    ]),
  );
  const rows = new Map<string, SessionEntry | undefined>();
  const outcomes = new Map<string, { expected: SubagentRunRecord; state: RetentionOutcome }>();
  for (const entry of pending) {
    const mark = entry.continuationResetRetention;
    if (!mark) {
      continue;
    }
    const rowKey = `${mark.agentId}\u0000${mark.sessionKey}`;
    if (!rows.has(rowKey)) {
      const storePath = params.storePath ?? storePaths.get(mark.agentId);
      rows.set(
        rowKey,
        await readSessionEntryReadOnlyInWorker({
          agentId: mark.agentId,
          sessionKey: mark.sessionKey,
          ...(storePath ? { storePath } : {}),
        }),
      );
    }
    const state = classifyRetention(mark, rows.get(rowKey));
    if (!state) {
      log.warn(
        `[continuation:reset-retention] unresolved: session=${mark.sessionKey} holds neither revision of reset ${mark.resetId}; run=${entry.runId} keeps its results held`,
      );
      continue;
    }
    outcomes.set(entry.runId, { expected: entry, state });
  }
  const settled = await settleContinuationResetRetentions(outcomes);
  if (settled.length === 0) {
    return;
  }
  await releaseHeldContinuationResults(params.cfg, settled, outcomes);
}

async function releaseHeldContinuationResults(
  cfg: OpenClawConfig,
  settledRunIds: readonly string[],
  outcomes: ReadonlyMap<string, { expected: SubagentRunRecord; state: RetentionOutcome }>,
): Promise<void> {
  const context = captureOpenClawStateWorkerContext();
  const settled = new Set(settledRunIds);
  // Only the reset session's own returns were held (the producer and replay gates key on it).
  const heldRows = (await loadPendingSessionDeliveries(context)).filter((row) => {
    const runId = row.kind === "systemEvent" ? row.continuationSourceRunId : undefined;
    const mark = runId && settled.has(runId) ? outcomes.get(runId)?.expected : undefined;
    return mark?.continuationResetRetention?.sessionKey === row.sessionKey;
  });
  const { scheduleSessionDelivery } = await import("../../infra/session-delivery-queue-runtime.js");
  for (const row of heldRows) {
    const runId = row.kind === "systemEvent" ? row.continuationSourceRunId : undefined;
    const state = runId ? outcomes.get(runId)?.state : undefined;
    if (state === "orphaned") {
      // The session is gone; no head may adopt this private result.
      await moveSessionDeliveryToFailed(row.id, context);
    } else if (!(await scheduleSessionDelivery(row.id, context))) {
      // No delivery runtime here; the Gateway's pending sweep replays the released row.
      log.info(`[continuation:reset-retention] released row ${row.id} awaits the pending sweep`);
    }
  }
  for (const runId of settled) {
    const outcome = outcomes.get(runId);
    if (outcome?.state !== "orphaned" || outcome.expected.cleanupCompletedAt !== undefined) {
      continue;
    }
    const result = await killSubagentRunAdmin({
      cfg,
      sessionKey: outcome.expected.childSessionKey,
      expectedRunId: runId,
      expectedOwnerKey: outcome.expected.requesterSessionKey,
    });
    if ("error" in result && result.error) {
      log.warn(
        `[continuation:reset-retention] orphaned run ${runId} could not be stopped: ${result.error}`,
      );
    }
  }
}
