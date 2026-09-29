// Same-session `continue_work` election and its rollback over the continuation
// custody store (RFC docs/design/continue-work-signal-v2.md §5.4.3).
import { abortContinuationDispatchClaim } from "./continuation-dispatch-claims.js";
import { assertContinuationCustodyOwnerImported } from "./custody-import-gate.js";
import {
  electContinuationWork,
  listContinuationRecords,
  requestContinuationRecordCancel,
  updateContinuationRecords,
  type ContinuationElectionPlan,
  newContinuationRecordId,
} from "./custody/custody-store.js";
import type {
  ContinuationRecord,
  ContinuationRecordPatch,
  ContinuationRecordUpdate,
} from "./custody/custody-store.types.js";
import type { ContinuationWorkReplacementFailure } from "./types.js";
import {
  decodeWorkState,
  encodeWorkState,
  isContinuationWorkFlow,
  workRecordDueAt,
  workToRuntime,
  type PendingContinuationWork,
  type PendingWorkState,
} from "./work-flow-state.js";

/** Terminal `succeeded` patch shared by grant, supersede, reap and fold. */
export function buildFinishedWorkPatch(
  state: PendingWorkState,
  params: { phase: string; stateExtra?: Record<string, unknown>; now: number },
): ContinuationRecordPatch & { stateJson: string; phase: string } {
  const { idleRetry: _idleRetry, recoveryDueAt: _recoveryDueAt, ...terminalState } = state;
  return {
    status: "succeeded",
    phase: params.phase,
    failureReason: null,
    stateJson: JSON.stringify({
      ...terminalState,
      turnGrantedAt: params.now,
      ...params.stateExtra,
    }),
    updatedAt: params.now,
  };
}

export type PendingWorkReplacementResult =
  | {
      applied: true;
      work: PendingContinuationWork;
      /** The superseded parked records as they were before the election. */
      supersededFlows: readonly ContinuationRecord[];
    }
  | { applied: false; capped: true }
  | {
      applied: false;
      capped: false;
      reason: ContinuationWorkReplacementFailure;
      flowId?: string;
    };

function isParkedOnTurnEnd(record: ContinuationRecord): boolean {
  return (
    isContinuationWorkFlow(record) &&
    record.status === "queued" &&
    record.cancelRequestedAt === undefined &&
    decodeWorkState(record)?.idleRetry?.trigger === "reply-run-ended"
  );
}

async function listLiveWorkRecords(sessionKey: string): Promise<ContinuationRecord[]> {
  return await listContinuationRecords({
    ownerSessionKey: sessionKey,
    kinds: ["work"],
    statuses: ["queued", "running"],
  });
}

export async function listQueuedTurnEndParkedWork(
  sessionKey: string,
): Promise<ContinuationRecord[]> {
  return (await listLiveWorkRecords(sessionKey)).filter(isParkedOnTurnEnd);
}

export async function listRunningContinuationWorkIds(sessionKey: string): Promise<string[]> {
  return (await listLiveWorkRecords(sessionKey))
    .filter((record) => record.status === "running" && record.cancelRequestedAt === undefined)
    .map((record) => record.recordId);
}

type ElectionRejection =
  | { capped: true }
  | { capped: false; reason: ContinuationWorkReplacementFailure; flowId?: string };

/**
 * Elect same-session work, superseding parked work, in one owner-conditioned
 * custody transaction (RFC §5.4.3). The owner condition covers every live work
 * record of the session whatever its chain (Q5); a conflict is replanned once.
 */
export async function enqueuePendingWorkReplacing(params: {
  work: PendingContinuationWork;
  summary: string;
  maxPendingWork: number;
  replaceParkedWork: boolean;
  expectedRunningFlowIds: readonly string[];
}): Promise<PendingWorkReplacementResult> {
  const sessionKey = params.work.sessionKey;
  assertContinuationCustodyOwnerImported(sessionKey);
  const state = encodeWorkState(params.work);
  const recordId = newContinuationRecordId();
  let priorRecords: readonly ContinuationRecord[] = [];
  const result = await electContinuationWork<ElectionRejection>({
    ownerSessionKey: sessionKey,
    now: Date.now,
    plan: (live): ContinuationElectionPlan | { rejected: ElectionRejection } => {
      const expectedRunning = new Set(params.expectedRunningFlowIds);
      if (
        params.replaceParkedWork &&
        live.some((record) => record.status === "running" && !expectedRunning.has(record.recordId))
      ) {
        return { rejected: { capped: false, reason: "running_owner" } };
      }
      const queued = live.filter((record) => record.status === "queued");
      const priors = params.replaceParkedWork ? queued.filter(isParkedOnTurnEnd) : [];
      const priorIds = new Set(priors.map((record) => record.recordId));
      if (
        queued.filter((record) => !priorIds.has(record.recordId)).length >= params.maxPendingWork
      ) {
        return { rejected: { capped: true } };
      }
      const now = Date.now();
      const supersede: ContinuationElectionPlan["supersede"][number][] = [];
      for (const prior of priors) {
        const priorState = decodeWorkState(prior);
        if (!priorState) {
          return {
            rejected: { capped: false, reason: "invalid_prior", flowId: prior.recordId },
          };
        }
        const patch = buildFinishedWorkPatch(priorState, {
          phase: `superseded: ${params.summary}`.slice(0, 200),
          now,
        });
        supersede.push({
          recordId: prior.recordId,
          expectedRevision: prior.revision,
          phase: patch.phase,
          stateJson: patch.stateJson,
        });
      }
      priorRecords = priors;
      return {
        supersede,
        create: {
          recordId,
          kind: "work",
          ownerSessionKey: sessionKey,
          ...(params.work.chainId ? { chainId: params.work.chainId } : {}),
          status: "queued",
          phase: "Queued for same-session continuation wake",
          createdAt: params.work.electedAt,
          dueAt: workRecordDueAt(state),
          stateJson: JSON.stringify(state),
        },
      };
    },
  });
  switch (result.outcome) {
    case "elected":
      return {
        applied: true,
        work: workToRuntime(result.created, state, "queued"),
        supersededFlows: priorRecords,
      };
    case "rejected":
      return result.rejection.capped
        ? { applied: false, capped: true }
        : { applied: false, ...result.rejection };
    case "invalid_prior":
      return { applied: false, capped: false, reason: "invalid_prior", flowId: result.recordId };
    case "not_found":
      return { applied: false, capped: false, reason: "not_found", flowId: result.recordId };
    case "revision_conflict":
    case "exists":
      return {
        applied: false,
        capped: false,
        reason: "revision_conflict",
        flowId: result.recordId,
      };
    case "owner_changed":
      return { applied: false, capped: false, reason: "revision_conflict" };
  }
  return { applied: false, capped: false, reason: "revision_conflict" };
}

export type PendingWorkReplacementRollbackResult = {
  applied: boolean;
  unresolvedCreatedFlowIds: string[];
  unrestoredPriorFlowIds: string[];
};

async function readRecords(recordIds: readonly string[]): Promise<Map<string, ContinuationRecord>> {
  if (recordIds.length === 0) {
    return new Map();
  }
  const records = await listContinuationRecords({ recordIds });
  return new Map(records.map((record) => [record.recordId, record]));
}

function isUnresolvedCreated(record: ContinuationRecord | undefined): boolean {
  if (!record || record.status === "failed" || record.status === "cancelled") {
    return false;
  }
  return record.status === "running" || record.cancelRequestedAt === undefined;
}

async function listUnresolvedCreatedFlowIds(recordIds: readonly string[]): Promise<string[]> {
  const records = await readRecords(recordIds);
  return recordIds.filter((recordId) => isUnresolvedCreated(records.get(recordId)));
}

async function listUnrestoredPriorFlowIds(
  priors: readonly ContinuationRecord[],
): Promise<string[]> {
  const records = await readRecords(priors.map((prior) => prior.recordId));
  return priors
    .filter((prior) => records.get(prior.recordId)?.status !== "queued")
    .map((prior) => prior.recordId);
}

/** A prior this rollback already restored: queued again with its exact phase, state and fence. */
function isExactRestoredPrior(record: ContinuationRecord, prior: ContinuationRecord): boolean {
  return (
    record.status === "queued" &&
    record.rollbackOf !== undefined &&
    record.phase === prior.phase &&
    record.stateJson === prior.stateJson &&
    record.cancelRequestedAt === prior.cancelRequestedAt &&
    record.endedAt === undefined
  );
}

async function requestCancelForUnresolvedActiveFlows(recordIds: readonly string[]): Promise<void> {
  for (const recordId of recordIds) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const record = (await readRecords([recordId])).get(recordId);
      if (
        !record ||
        (record.status !== "queued" && record.status !== "running") ||
        record.cancelRequestedAt !== undefined
      ) {
        break;
      }
      if (record.status === "running") {
        abortContinuationDispatchClaim({
          sessionKey: record.ownerSessionKey,
          flowId: recordId,
          reason: "continuation replacement cancellation retry",
        });
      }
      const cancelled = await requestContinuationRecordCancel({
        recordId,
        ownerSessionKey: record.ownerSessionKey,
        expectedRevision: record.revision,
        now: Date.now(),
      });
      if (cancelled.outcome === "applied") {
        break;
      }
    }
    const latest = (await readRecords([recordId])).get(recordId);
    if (latest?.status === "running") {
      abortContinuationDispatchClaim({
        sessionKey: latest.ownerSessionKey,
        flowId: recordId,
        reason: "continuation replacement cancellation verification",
      });
    }
  }
}

/**
 * Undo an election whose electing turn failed to finalize (RFC §5.4.2,
 * "Work-scheduling rollback"): fail the created records the electing attempt
 * still owns and restore each superseded prior exactly, in one multi-record
 * CAS with no owner condition. Restored priors carry `rollbackOf` naming the
 * election they were restored from.
 */
export async function rollbackPendingWorkReplacement(params: {
  sessionKey: string;
  createdFlowIds: readonly string[];
  priorFlows: readonly ContinuationRecord[];
  originRunId?: string;
  originTurnId?: string;
  summary: string;
}): Promise<PendingWorkReplacementRollbackResult> {
  let lastUnresolvedCreatedFlowIds: string[] = [];
  let lastUnrestoredPriorFlowIds: string[] = [];
  const electionId = params.createdFlowIds[0];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const updates: ContinuationRecordUpdate[] = [];
    const unresolvedCreatedFlowIds: string[] = [];
    const unrestoredPriorFlowIds: string[] = [];
    let unsafeCreatedOwner = false;
    const now = Date.now();
    const created = await readRecords(params.createdFlowIds);

    for (const recordId of params.createdFlowIds) {
      const record = created.get(recordId);
      if (!record || record.status === "failed" || record.status === "cancelled") {
        continue;
      }
      const state = isContinuationWorkFlow(record) ? decodeWorkState(record) : undefined;
      if (
        !state ||
        state.originRunId !== params.originRunId ||
        state.originTurnId !== params.originTurnId ||
        record.status === "succeeded"
      ) {
        unsafeCreatedOwner = true;
        unresolvedCreatedFlowIds.push(recordId);
        continue;
      }
      if (record.status === "running") {
        abortContinuationDispatchClaim({
          sessionKey: params.sessionKey,
          flowId: recordId,
          reason: params.summary,
        });
        unsafeCreatedOwner = true;
        unresolvedCreatedFlowIds.push(recordId);
        continue;
      }
      updates.push({
        recordId,
        ownerSessionKey: record.ownerSessionKey,
        expectedRevision: record.revision,
        patch: {
          status: "failed",
          phase: "spawn-init continuation finalization failed",
          failureReason: params.summary,
          updatedAt: now,
        },
      });
    }

    if (unsafeCreatedOwner) {
      if (updates.length > 0) {
        await updateContinuationRecords(updates, { now });
      }
      const unresolved = await listUnresolvedCreatedFlowIds(params.createdFlowIds);
      await requestCancelForUnresolvedActiveFlows(unresolved);
      return {
        applied: false,
        unresolvedCreatedFlowIds: await listUnresolvedCreatedFlowIds(params.createdFlowIds),
        unrestoredPriorFlowIds: await listUnrestoredPriorFlowIds(params.priorFlows),
      };
    }

    const current = await readRecords(params.priorFlows.map((prior) => prior.recordId));
    for (const prior of params.priorFlows) {
      const record = current.get(prior.recordId);
      if (record && isExactRestoredPrior(record, prior)) {
        continue;
      }
      if (
        !record ||
        !isContinuationWorkFlow(record) ||
        record.status !== "succeeded" ||
        record.revision !== prior.revision + 1
      ) {
        unrestoredPriorFlowIds.push(prior.recordId);
        continue;
      }
      updates.push({
        recordId: record.recordId,
        ownerSessionKey: record.ownerSessionKey,
        expectedRevision: record.revision,
        patch: {
          status: "queued",
          phase: prior.phase ?? null,
          stateJson: prior.stateJson,
          failureReason: null,
          cancelRequestedAt: prior.cancelRequestedAt ?? null,
          rollbackOf: electionId ?? record.recordId,
          updatedAt: now,
        },
      });
    }

    const result =
      updates.length > 0
        ? await updateContinuationRecords(updates, { now })
        : ({ outcome: "applied" } as const);
    if (result.outcome === "applied") {
      return { applied: true, unresolvedCreatedFlowIds, unrestoredPriorFlowIds };
    }
    lastUnresolvedCreatedFlowIds = await listUnresolvedCreatedFlowIds(params.createdFlowIds);
    lastUnrestoredPriorFlowIds = await listUnrestoredPriorFlowIds(params.priorFlows);
  }
  await requestCancelForUnresolvedActiveFlows(lastUnresolvedCreatedFlowIds);
  return {
    applied: false,
    unresolvedCreatedFlowIds: await listUnresolvedCreatedFlowIds(params.createdFlowIds),
    unrestoredPriorFlowIds: lastUnrestoredPriorFlowIds,
  };
}
