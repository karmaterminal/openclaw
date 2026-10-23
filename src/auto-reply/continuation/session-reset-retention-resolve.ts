// Continuation (karmaterminal): settles reset-retention marks (session-reset-retention.ts). Runs at
// the end of each reset flow for that reset's marks, and at Gateway boot for marks a previous
// process left pending.
import type { ContinuationResetRetentionOutcome } from "../../agents/subagents/registry/subagent-continuation-reset-active.js";
import {
  listPendingContinuationResetRetentions,
  settleContinuationResetRetentions,
} from "../../agents/subagents/registry/subagent-continuation-reset-retention.js";
import { killSubagentRunAdmin } from "../../agents/subagents/registry/subagent-control-kill.js";
import type { SubagentRunRecord } from "../../agents/subagents/registry/subagent-registry.types.js";
import { readSessionEntryReadOnlyInWorker } from "../../config/sessions/session-entry-read-runtime.js";
import { isSessionRecipientAuthorityCurrentInWorker } from "../../config/sessions/session-recipient-authority-current.js";
import { resolveAllAgentSessionStoreTargetsSync } from "../../config/sessions/targets.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  loadPendingSessionDeliveries,
  moveSessionDeliveryToFailed,
} from "../../infra/session-delivery-queue-storage.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { captureOpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.js";
import { parseContinuationRecipientAuthorityBinding } from "./recipient-authority-binding.js";

const log = createSubsystemLogger("continuation/reset-retention");

/**
 * The run's captured recipient authority for the reset session. Stale once delete, owner change
 * or visibility narrowing advanced the epoch: no later head may adopt its results. A "current"
 * verdict only releases the held returns; each is fenced again when a prompt adopts it.
 */
async function readRetainedRecipientAuthority(
  entry: SubagentRunRecord,
  mark: NonNullable<SubagentRunRecord["continuationResetRetention"]>,
  storePath: string | undefined,
): Promise<"current" | "stale" | "uncaptured"> {
  const parsed = parseContinuationRecipientAuthorityBinding(
    entry.continuationRecipientAuthorityBinding,
  );
  const authority =
    parsed.state === "valid" && parsed.binding.selection === "selected"
      ? parsed.binding.recipients.find((recipient) => recipient.sessionKey === mark.sessionKey)
          ?.authority
      : undefined;
  if (!authority) {
    return "uncaptured";
  }
  return (await isSessionRecipientAuthorityCurrentInWorker(
    { agentId: mark.agentId, sessionKey: mark.sessionKey, ...(storePath ? { storePath } : {}) },
    authority,
  ))
    ? "current"
    : "stale";
}

function classifyRetention(
  mark: NonNullable<SubagentRunRecord["continuationResetRetention"]>,
  row: SessionEntry | undefined,
  authority: Awaited<ReturnType<typeof readRetainedRecipientAuthority>>,
): ContinuationResetRetentionOutcome | undefined {
  if (authority === "stale" || (authority === "uncaptured" && !row)) {
    return "orphaned";
  }
  // A missing head under still-current authority is not proof the root is gone.
  if (!row) {
    return undefined;
  }
  if (row.lifecycleRevision === mark.toRevision) {
    return "adopted";
  }
  // Either way the rotation is over and the row's head is the conversation's current head under
  // the same authority, which is where these results would have gone without the reset.
  return row.lifecycleRevision === mark.fromRevision ? "aborted" : "superseded";
}

/**
 * Settles pending marks: `resetId` selects one reset's marks (its own flow), `markedBefore`
 * selects marks a previous process left (boot). Successor revision: adopted. Replaced revision:
 * aborted (the reset did not commit). Any other revision: superseded. All three release the held
 * results to the current head. Stale recipient authority, or a missing row when the run captured
 * none: orphaned. A missing row under current authority stays pending with its results held and a
 * warning: that is not proof the root is gone. Each held return still expires to failed after
 * CONTINUATION_RESET_HOLD_MAX_MS at replay, and the run keeps running.
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
  const outcomes = new Map<
    string,
    { expected: SubagentRunRecord; state: ContinuationResetRetentionOutcome }
  >();
  for (const entry of pending) {
    const mark = entry.continuationResetRetention;
    if (!mark) {
      continue;
    }
    const rowKey = `${mark.agentId}\u0000${mark.sessionKey}`;
    const storePath = params.storePath ?? storePaths.get(mark.agentId);
    if (!rows.has(rowKey)) {
      rows.set(
        rowKey,
        await readSessionEntryReadOnlyInWorker({
          agentId: mark.agentId,
          sessionKey: mark.sessionKey,
          ...(storePath ? { storePath } : {}),
        }),
      );
    }
    const state = classifyRetention(
      mark,
      rows.get(rowKey),
      await readRetainedRecipientAuthority(entry, mark, storePath),
    );
    if (!state) {
      log.warn(
        `[continuation:reset-retention] unresolved: session=${mark.sessionKey} is missing under current recipient authority (reset ${mark.resetId}); run=${entry.runId} keeps its results held until a later resolution (Gateway boot) proves an outcome; each held return expires after 7 days`,
      );
      continue;
    }
    outcomes.set(entry.runId, { expected: entry, state });
  }
  if (outcomes.size === 0) {
    return;
  }
  const context = captureOpenClawStateWorkerContext();
  // Only the reset session's own returns were held (the producer and replay gates key on it).
  const heldRows = (await loadPendingSessionDeliveries(context)).filter((row) => {
    const runId = row.kind === "systemEvent" ? row.continuationSourceRunId : undefined;
    const mark = runId ? outcomes.get(runId)?.expected.continuationResetRetention : undefined;
    return mark?.sessionKey === row.sessionKey;
  });
  const sourceState = (row: (typeof heldRows)[number]) =>
    row.kind === "systemEvent" && row.continuationSourceRunId
      ? outcomes.get(row.continuationSourceRunId)?.state
      : undefined;
  // Orphaned results go to failed while their marks are still pending, so the replay fence holds
  // them until then and no sweep can deliver one in between. A failure here throws before any mark
  // settles; the next resolution retries. A row written after this load is caught by the durable
  // orphan fence at replay instead.
  const orphanedRows = heldRows.filter((row) => sourceState(row) === "orphaned");
  for (const row of orphanedRows) {
    await moveSessionDeliveryToFailed(row.id, context);
  }
  if (orphanedRows.length > 0) {
    log.warn(
      `[continuation:reset-retention] moved ${orphanedRows.length} held continuation return(s) to failed: their reset orphaned the source run (rows ${orphanedRows.map((row) => row.id).join(", ")})`,
    );
  }
  const settled = new Set(await settleContinuationResetRetentions(outcomes));
  const { scheduleSessionDelivery } = await import("../../infra/session-delivery-queue-runtime.js");
  for (const row of heldRows) {
    const runId = row.kind === "systemEvent" ? row.continuationSourceRunId : undefined;
    if (!runId || !settled.has(runId) || sourceState(row) === "orphaned") {
      continue;
    }
    if (!(await scheduleSessionDelivery(row.id, context))) {
      // No delivery runtime here; the Gateway's pending sweep replays the released row.
      log.info(`[continuation:reset-retention] released row ${row.id} awaits the pending sweep`);
    }
  }
  await stopOrphanedContinuationRuns(params.cfg, settled, outcomes);
}

async function stopOrphanedContinuationRuns(
  cfg: OpenClawConfig,
  settled: ReadonlySet<string>,
  outcomes: ReadonlyMap<
    string,
    { expected: SubagentRunRecord; state: ContinuationResetRetentionOutcome }
  >,
): Promise<void> {
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
