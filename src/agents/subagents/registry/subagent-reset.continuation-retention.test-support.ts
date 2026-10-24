// Continuation (karmaterminal): shared fixture steps for the F4 reset-retention proofs. Callers
// install useSubagentControlFixture() first; these helpers use its state directory.
import { expect } from "vitest";
import { captureContinuationRecipientAuthorities } from "../../../auto-reply/continuation/recipient-authority-binding.js";
import { prepareContinuationResetRetention } from "../../../auto-reply/continuation/session-reset-retention.js";
import { getRuntimeConfig } from "../../../config/config.js";
import {
  applySessionEntryLifecycleMutation,
  loadSessionEntry,
} from "../../../config/sessions/session-accessor.js";
import { deleteSessionEntryRows } from "../../../config/sessions/session-accessor.sqlite-entry-store.js";
import { clearSessionStoreCacheForTest } from "../../../config/sessions/store-writer-state.js";
import { deliverQueuedSessionDeliveryCore } from "../../../gateway/server-restart-sentinel-delivery.js";
import { drainPendingSessionDelivery } from "../../../infra/session-delivery-queue-recovery.js";
import {
  enqueueSessionDelivery,
  loadPendingSessionDeliveries,
  SessionDeliveryDeferredError,
} from "../../../infra/session-delivery-queue-storage.js";
import { resolveSystemEventQueueKey } from "../../../infra/system-event-ownership.js";
import { peekSystemEventEntries } from "../../../infra/system-events.js";
import { runOpenClawAgentWriteTransaction } from "../../../state/openclaw-agent-db.js";
import { captureOpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.js";
import { routeSubagentContinuationReturn } from "../../subagent-announce.continuation-return.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import { mutateSubagentRuns } from "./subagent-registry-persistence.js";
import { markSubagentRunPausedAfterYield } from "./subagent-registry-run-pause.js";
import { registerSubagentRun } from "./subagent-registry.js";
import { writeChildSession } from "./subagent-registry.persistence.test-support.js";

export const parentKey = "agent:main:main";
export const childKey = (id: string) => "agent:main:subagent:" + id;

export function createResetRetentionFixture(stateDir: () => string) {
  const writeSession = (sessionKey: string, sessionId: string, lifecycleRevision?: string) =>
    writeChildSession(stateDir(), sessionKey, sessionId, lifecycleRevision);

  /**
   * A paused child of `requester`; `elected` gives it a continuation recipient binding. A
   * `controller` other than the requester models a chain hop controlled by its spawning child.
   */
  async function addChild(
    runId: string,
    elected: boolean,
    requester = parentKey,
    controller?: string,
  ) {
    await writeSession(childKey(runId), runId);
    await registerSubagentRun({
      runId,
      childSessionKey: childKey(runId),
      childAgentId: "main",
      sessionEntry: { sessionId: runId },
      requesterSessionKey: requester,
      requesterAgentId: "main",
      requesterDisplayKey: requester,
      ...(controller ? { controllerSessionKey: controller } : {}),
      task: runId,
      cleanup: "keep",
      expectsCompletionMessage: true,
    });
    const binding = elected
      ? await captureContinuationRecipientAuthorities([requester])
      : undefined;
    await mutateSubagentRuns([runId], (rows) => {
      const draft = structuredClone(rows.get(runId)!);
      expect(markSubagentRunPausedAfterYield({ entry: draft })).toBe(true);
      if (binding) {
        draft.continuationRecipientAuthorityBinding = binding;
      }
      return { value: undefined, postimages: new Map([[runId, draft]]) };
    });
  }

  /** The child's continuation return through the real router and producer. */
  async function returnFrom(runId: string, text: string, requester = parentKey) {
    return await routeSubagentContinuationReturn({
      cfg: getRuntimeConfig(),
      continuationEnabled: true,
      isContinuationChainDelegate: true,
      maxChainLength: 10,
      task: runId,
      taskLabel: runId,
      triggerMessage: text,
      announceId: `announce:${text}`,
      childSessionKey: childKey(runId),
      childAgentId: "main",
      childRunId: runId,
      targetRequesterSessionKey: requester,
      targetRequesterAgentId: "main",
      continuationRecipientAuthorityBinding:
        subagentRuns.get(runId)?.continuationRecipientAuthorityBinding,
    });
  }

  async function returnRows(runId: string) {
    return (await loadPendingSessionDeliveries(captureOpenClawStateWorkerContext())).filter(
      (row) => row.kind === "systemEvent" && row.continuationSourceRunId === runId,
    );
  }

  /** Replays one row through the real restart-sentinel delivery; returns how it settled. */
  async function replay(row: Awaited<ReturnType<typeof returnRows>>[number]) {
    try {
      await deliverQueuedSessionDeliveryCore({
        deps: {} as never,
        entry: row,
        queueContext: captureOpenClawStateWorkerContext(),
      });
      return "returned";
    } catch (error) {
      if (error instanceof SessionDeliveryDeferredError) {
        return error.heldByOwner ? "held" : error.awaitingAdoptionInMemory ? "queued" : "deferred";
      }
      throw error;
    }
  }

  /**
   * One row through the real recovery drain, as the Gateway's pending sweep runs it. Returns the
   * settlement it recorded (`recovered` acks it as delivered), or whether it is still pending.
   */
  async function drain(row: Awaited<ReturnType<typeof returnRows>>[number]) {
    let settled: string | undefined;
    const remaining = await drainPendingSessionDelivery({
      id: row.id,
      bypassBackoff: true,
      queueContext: captureOpenClawStateWorkerContext(),
      logLabel: "reset-retention drain",
      log: { info: () => {}, warn: () => {}, error: () => {} },
      deliver: (entry, context) =>
        deliverQueuedSessionDeliveryCore({
          deps: {} as never,
          entry,
          queueContext: context.queueContext,
        }),
      onSettled: (_entry, outcome) => {
        settled = outcome;
      },
    });
    return settled ?? (remaining ? "pending" : "gone");
  }

  /** Deletes the session row through the shared deletion edge, which advances its authority. */
  function removeSessionRow(sessionKey: string) {
    runOpenClawAgentWriteTransaction((database) => deleteSessionEntryRows(database, sessionKey), {
      agentId: "main",
    });
    clearSessionStoreCacheForTest();
  }

  /**
   * Moves `sessionKey`'s session to `liveKey` through the production lifecycle projection, as
   * canonical alias adoption does: one mutation removes the old key and upserts its entry under
   * the live key, so the projection deletes the old row as a legacy replacement
   * (deleteLegacySessionEntryRows). That is not a deletion edge; the old key's recipient
   * authority stays where it was.
   */
  async function rehomeSessionRow(storePath: string, sessionKey: string, liveKey: string) {
    const entry = loadSessionEntry({ storePath, sessionKey });
    expect(entry?.sessionId).toBeDefined();
    await applySessionEntryLifecycleMutation({
      agentId: "main",
      storePath,
      removals: [{ sessionKey }],
      upserts: [{ sessionKey: liveKey, entry: structuredClone(entry!) }],
      skipMaintenance: true,
    });
    clearSessionStoreCacheForTest();
  }

  /** A return row written before recipient authority existed: replay's authority check is vacuous. */
  async function enqueueReturnWithoutAuthority(runId: string, text: string, requester = parentKey) {
    await enqueueSessionDelivery(
      {
        kind: "systemEvent",
        sessionKey: requester,
        agentId: "main",
        text,
        idempotencyKey: `continuation-return:legacy:${text}:${requester}`,
        awaitPromptAdoption: true,
        continuationSourceRunId: runId,
      },
      captureOpenClawStateWorkerContext(),
    );
  }

  const queuedEvents = (text: string, requester = parentKey) =>
    peekSystemEventEntries(resolveSystemEventQueueKey(requester, "main")).filter(
      (event) => event.text === text,
    );

  /** A reset that marked its tree and then died: nothing in this process resolves the mark. */
  async function leavePendingRetention(
    storePath: string,
    options: { requester?: string; during?: () => Promise<void> } = {},
  ) {
    const retention = prepareContinuationResetRetention({
      cfg: getRuntimeConfig(),
      sessionKey: options.requester ?? parentKey,
      agentId: "main",
      storePath,
    });
    await retention.stopSubagents(
      { fromRevision: "before-reset", assertCurrent: () => {} },
      async () => {
        await options.during?.();
      },
    );
    return retention;
  }

  return {
    writeSession,
    addChild,
    returnFrom,
    returnRows,
    replay,
    drain,
    removeSessionRow,
    rehomeSessionRow,
    enqueueReturnWithoutAuthority,
    queuedEvents,
    leavePendingRetention,
  };
}
