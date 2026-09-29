// Continuation custody store API (RFC docs/design/continue-work-signal-v2.md
// §5.4). Every operation is one shared-state worker command, and so one state
// write transaction serialized through the worker broker's FIFO. After a
// commit this module installs the reported live sets into the hot-path
// projection and releases the payload files whose references the commit
// scrubbed. Nothing else reads or writes `continuation_records`.
import { createSqliteWorkerWriteAdmission } from "../../../infra/sqlite-worker-store.js";
import { captureOpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.types.js";
import { runOpenClawStateWorkerOperation } from "../../../state/openclaw-state-worker-store.js";
import {
  releaseContinuationCustodyPayload,
  storeContinuationCustodyPayload,
  type ContinuationCustodyPayload,
} from "./custody-payload-store.js";
import {
  hydrateContinuationCustodyProjection,
  installContinuationCustodyCommit,
  invalidateContinuationCustodyOwners,
} from "./custody-projection.js";
import type {
  ContinuationClaimResult,
  ContinuationCommitFacts,
  ContinuationCreateResult,
  ContinuationDeleteResult,
  ContinuationElection,
  ContinuationElectionResult,
  ContinuationPayloadConflict,
  ContinuationPruneResult,
  ContinuationRecord,
  ContinuationRecordPatch,
  ContinuationRecordQuery,
  ContinuationRecordUpdate,
  ContinuationUpdateResult,
  NewContinuationRecord,
} from "./custody-store.types.js";
import type { ContinuationCustodyWorkerOperations } from "./custody-store.worker-contract.js";

export type ContinuationCustodyStoreOptions = { env?: NodeJS.ProcessEnv };

/** Attachment bytes for a new delegate record; the store binds them to the record. */
export type ContinuationCustodyPayloadInput = Pick<
  ContinuationCustodyPayload,
  "attachments" | "attachAs"
>;

type Operations = ContinuationCustodyWorkerOperations;

type Custody = { context: OpenClawStateWorkerContext; env: NodeJS.ProcessEnv };

function capture(options?: ContinuationCustodyStoreOptions): Custody {
  const env = options?.env ?? process.env;
  return { context: captureOpenClawStateWorkerContext({ env }), env };
}

function databasePath(custody: Custody): string {
  return custody.context.admission.databasePath;
}

function hasCommitFacts(value: unknown): value is ContinuationCommitFacts {
  return typeof value === "object" && value !== null && "owners" in value;
}

/**
 * Run one custody command. A thrown command may or may not have committed, so
 * its owners become unknown in the projection until a later committed fact.
 */
async function execute<Key extends keyof Operations>(
  custody: Custody,
  type: Key,
  input: Operations[Key]["input"],
  touchedOwners: readonly string[],
): Promise<Operations[Key]["output"]> {
  let output: Operations[Key]["output"];
  try {
    const assertCurrent = () => custody.context.admission.assertCurrent();
    output = await runOpenClawStateWorkerOperation(
      custody.context,
      (scope) => scope.execute({ type, input }),
      {
        assertCurrent,
        // The worker asks for authority after BEGIN and again before COMMIT.
        createAdmission: createSqliteWorkerWriteAdmission(assertCurrent, [databasePath(custody)]),
      },
    );
  } catch (error) {
    invalidateContinuationCustodyOwners(databasePath(custody), touchedOwners);
    throw error;
  }
  if (hasCommitFacts(output)) {
    installContinuationCustodyCommit(databasePath(custody), output.owners);
    await releaseScrubbedPayloads(custody, output);
  }
  return output;
}

/**
 * Payload release follows the commit that scrubbed the reference. A failed
 * release leaves an unreferenced file for the startup reconcile, never a
 * record pointing at a missing file.
 */
async function releaseScrubbedPayloads(
  custody: Custody,
  facts: ContinuationCommitFacts,
): Promise<void> {
  for (const { attachmentId, recordId } of facts.releasedAttachments) {
    try {
      await releaseContinuationCustodyPayload(attachmentId, recordId, custody.env);
    } catch {
      // The startup reconcile removes files that no live record references.
    }
  }
}

/**
 * Durable create keyed by owner and kind (RFC §5.4.8 capability 1). A payload
 * is written once, before the record commits (crash boundary 0), and released
 * again when the record ID already exists without referencing it. A payload
 * already stored under the attachment ID is reused only when byte-identical
 * (a retry); any other file there is a `payload_conflict` and nothing is
 * written. After a thrown create the record may have committed, so the file
 * stays for the startup reconcile to judge.
 */
export async function createContinuationRecord(
  record: NewContinuationRecord,
  options?: ContinuationCustodyStoreOptions & { payload?: ContinuationCustodyPayloadInput },
): Promise<ContinuationCreateResult | ContinuationPayloadConflict> {
  const custody = capture(options);
  const payload = options?.payload;
  if (payload) {
    if (record.attachmentId === undefined) {
      throw new Error("continuation custody payload needs the record's attachment id");
    }
    const stored = await storeContinuationCustodyPayload(
      {
        ...payload,
        attachmentId: record.attachmentId,
        recordId: record.recordId,
        ownerKey: record.ownerSessionKey,
      },
      custody.env,
    );
    if (stored === "conflict") {
      return {
        outcome: "payload_conflict",
        recordId: record.recordId,
        attachmentId: record.attachmentId,
      };
    }
  }
  const result = await execute(custody, "continuationCustody.create", { record }, [
    record.ownerSessionKey,
  ]);
  // Release only a payload the existing record does not reference: a retry
  // after an unseen commit meets its own record and must keep that file. The
  // file here is bound to this record ID, so no other record can own it.
  if (
    result.outcome === "exists" &&
    payload &&
    record.attachmentId !== undefined &&
    result.attachmentId !== record.attachmentId
  ) {
    await releaseScrubbedPayloads(custody, {
      owners: [],
      releasedAttachments: [{ recordId: record.recordId, attachmentId: record.attachmentId }],
    });
  }
  return result;
}

/** Revision CAS on one record, or an all-or-nothing multi-record CAS (rollback). */
export async function updateContinuationRecords(
  updates: readonly ContinuationRecordUpdate[],
  params: { now: number },
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationUpdateResult> {
  return execute(
    capture(options),
    "continuationCustody.update",
    { updates: [...updates], now: params.now },
    updates.map((update) => update.ownerSessionKey),
  );
}

type LifecycleTarget = {
  recordId: string;
  ownerSessionKey: string;
  expectedRevision: number;
  now: number;
};

function transition(
  target: LifecycleTarget,
  patch: ContinuationRecordPatch,
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationUpdateResult> {
  return updateContinuationRecords(
    [
      {
        recordId: target.recordId,
        ownerSessionKey: target.ownerSessionKey,
        expectedRevision: target.expectedRevision,
        patch,
      },
    ],
    { now: target.now },
    options,
  );
}

/** Finish as `succeeded`; a handoff marks custody moved to another owner. */
export function finishContinuationRecord(
  target: LifecycleTarget & Pick<ContinuationRecordPatch, "phase" | "stateJson" | "handoff">,
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationUpdateResult> {
  const { phase, stateJson, handoff } = target;
  return transition(
    target,
    {
      status: "succeeded",
      failureReason: null,
      ...(phase !== undefined ? { phase } : {}),
      ...(stateJson !== undefined ? { stateJson } : {}),
      ...(handoff !== undefined ? { handoff } : {}),
    },
    options,
  );
}

/** Fail with a reason, optionally leaving a terminal-notice obligation (RFC §5.4.2). */
export function failContinuationRecord(
  target: LifecycleTarget & {
    failureReason: string;
  } & Pick<ContinuationRecordPatch, "phase" | "stateJson" | "terminalNoticePending">,
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationUpdateResult> {
  const { failureReason, phase, stateJson, terminalNoticePending } = target;
  return transition(
    target,
    {
      status: "failed",
      failureReason,
      ...(phase !== undefined ? { phase } : {}),
      ...(stateJson !== undefined ? { stateJson } : {}),
      ...(terminalNoticePending !== undefined ? { terminalNoticePending } : {}),
    },
    options,
  );
}

/** Set the "do not drive" fence without ending the record (C's cancel request). */
export function requestContinuationRecordCancel(
  target: LifecycleTarget,
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationUpdateResult> {
  return transition(target, { cancelRequestedAt: target.now }, options);
}

/** End the record as `cancelled` (reset, or a fenced record that will never run). */
export function cancelContinuationRecord(
  target: LifecycleTarget & Pick<ContinuationRecordPatch, "phase">,
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationUpdateResult> {
  return transition(
    target,
    {
      status: "cancelled",
      cancelRequestedAt: target.now,
      ...(target.phase !== undefined ? { phase: target.phase } : {}),
    },
    options,
  );
}

/** Delete an unaccepted record at its exact revision. */
export function deleteContinuationRecord(
  target: Omit<LifecycleTarget, "now">,
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationDeleteResult> {
  return execute(
    capture(options),
    "continuationCustody.delete",
    { recordId: target.recordId, expectedRevision: target.expectedRevision },
    [target.ownerSessionKey],
  );
}

export type ContinuationElectionPlan = Pick<ContinuationElection, "supersede" | "create">;

/**
 * Elect same-session work, replacing parked work (RFC §5.4.3). The planner
 * sees the owner's live work records, as C's caller did, and rejects the
 * `running_owner`, `capped` and `invalid_prior` cases itself. The worker then
 * rereads and writes in one transaction. An owner or revision conflict is
 * replanned once, as at C.
 */
export async function electContinuationWork<Rejection>(
  params: {
    ownerSessionKey: string;
    now: () => number;
    plan: (
      live: readonly ContinuationRecord[],
    ) => ContinuationElectionPlan | { rejected: Rejection };
  },
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationElectionResult | { outcome: "rejected"; rejection: Rejection }> {
  const custody = capture(options);
  let result: ContinuationElectionResult | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const live = (
      await execute(
        custody,
        "continuationCustody.list",
        {
          ownerSessionKey: params.ownerSessionKey,
          kinds: ["work"],
          statuses: ["queued", "running"],
        },
        [params.ownerSessionKey],
      )
    ).filter((record) => record.cancelRequestedAt === undefined);
    const plan = params.plan(live);
    if ("rejected" in plan) {
      return { outcome: "rejected", rejection: plan.rejected };
    }
    result = await execute(
      custody,
      "continuationCustody.elect",
      {
        ownerSessionKey: params.ownerSessionKey,
        expectedLive: live.map((record) => ({
          recordId: record.recordId,
          revision: record.revision,
          // SAFETY: the list selected only live statuses.
          status: record.status as "queued" | "running",
        })),
        supersede: plan.supersede,
        create: plan.create,
        now: params.now(),
      },
      [params.ownerSessionKey],
    );
    if (
      result.outcome !== "owner_changed" &&
      result.outcome !== "revision_conflict" &&
      result.outcome !== "not_found"
    ) {
      return result;
    }
  }
  // SAFETY: the loop body assigns result before any iteration can finish.
  return result as ContinuationElectionResult;
}

/** Claim a queued delegate and record its next spawn attempt before spawning. */
export function claimContinuationSpawnAttempt(
  target: LifecycleTarget,
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationClaimResult> {
  return execute(
    capture(options),
    "continuationCustody.claimSpawnAttempt",
    { recordId: target.recordId, expectedRevision: target.expectedRevision, now: target.now },
    [target.ownerSessionKey],
  );
}

/** Record the failure phase of the latest spawn attempt, with an optional CAS patch. */
export function recordContinuationSpawnAttemptFailure(
  target: LifecycleTarget & {
    attemptId: number;
    failurePhase: "initialize" | "dispatch" | "register";
    patch?: ContinuationRecordPatch;
  },
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationUpdateResult> {
  const { recordId, expectedRevision, attemptId, failurePhase, patch, now } = target;
  return execute(
    capture(options),
    "continuationCustody.recordSpawnAttemptFailure",
    { recordId, expectedRevision, attemptId, failurePhase, now, ...(patch ? { patch } : {}) },
    [target.ownerSessionKey],
  );
}

/** List-by-owner and recovery scans, ordered FIFO by creation (RFC §5.4.6). */
export function listContinuationRecords(
  query: ContinuationRecordQuery,
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationRecord[]> {
  return execute(capture(options), "continuationCustody.list", { ...query }, []);
}

/** Startup hydration of the hot-path projection from the committed live set. */
export async function hydrateContinuationCustody(
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationRecord[]> {
  const custody = capture(options);
  const live = await execute(
    custody,
    "continuationCustody.list",
    { statuses: ["queued", "running"] },
    [],
  );
  hydrateContinuationCustodyProjection(databasePath(custody), live);
  return live;
}

/** Retention: prune terminal records that ended before the cutoff and owe no notice. */
export function pruneContinuationRecords(
  params: { endedBefore: number },
  options?: ContinuationCustodyStoreOptions,
): Promise<ContinuationPruneResult> {
  return execute(capture(options), "continuationCustody.prune", params, []);
}

/** The database path that keys this store's projection for the given options. */
export function resolveContinuationCustodyDatabasePath(
  options?: ContinuationCustodyStoreOptions,
): string {
  return databasePath(capture(options));
}
