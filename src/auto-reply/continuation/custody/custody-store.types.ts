// Records and operation results of the continuation custody store (RFC
// docs/design/continue-work-signal-v2.md §5.4.2). The store interprets only
// the fields below; per-kind controller state stays opaque JSON owned by the
// continuation codecs.
import type { bindDeliveryQueueEntry } from "../../../infra/delivery-queue-sqlite-bound.js";
import type {
  ContinuationSpawnAttempt,
  ContinuationSpawnFailurePhase,
} from "../../../shared/continuation-run-key.js";

export type ContinuationRecordKind = "work" | "delegate" | "post_compaction";

export type ContinuationRecordStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type ContinuationLiveStatus = Extract<ContinuationRecordStatus, "queued" | "running">;

export type ContinuationTerminalNotice =
  | "retry-exhausted"
  | "delegate-spawn-interrupted"
  | "rollback-election-conflict";

/** Where custody went when a record left the store for another owner. */
export type ContinuationHandoff =
  | {
      target: "subagent_runs";
      childRunId: string;
      childSessionKey: string;
      handedOffAt: number;
    }
  | { target: "session_delivery_queue"; queueEntryId: string; handedOffAt: number };

export type ContinuationRecord = {
  recordId: string;
  kind: ContinuationRecordKind;
  ownerSessionKey: string;
  chainId?: string;
  revision: number;
  status: ContinuationRecordStatus;
  phase?: string;
  failureReason?: string;
  cancelRequestedAt?: number;
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
  dueAt?: number;
  /** Serialized per-kind controller state; the store never interprets it. */
  stateJson: string;
  spawnAttempts: readonly ContinuationSpawnAttempt[];
  handoff?: ContinuationHandoff;
  rollbackOf?: string;
  attachmentId?: string;
  terminalNoticePending?: ContinuationTerminalNotice;
};

export type NewContinuationRecord = {
  recordId: string;
  kind: ContinuationRecordKind;
  ownerSessionKey: string;
  chainId?: string;
  status: ContinuationLiveStatus;
  phase?: string;
  createdAt: number;
  dueAt?: number;
  stateJson: string;
  attachmentId?: string;
};

/**
 * Fields a revision CAS may change. Terminal statuses set `endedAt` and scrub
 * the attachment reference in the same commit; live statuses clear `endedAt`.
 * `null` clears an optional field; an omitted field is unchanged.
 */
export type ContinuationRecordPatch = {
  status?: ContinuationRecordStatus;
  phase?: string | null;
  failureReason?: string | null;
  cancelRequestedAt?: number | null;
  updatedAt?: number;
  dueAt?: number | null;
  stateJson?: string;
  handoff?: ContinuationHandoff | null;
  rollbackOf?: string | null;
  terminalNoticePending?: ContinuationTerminalNotice | null;
  /** Drop the attachment reference while the record stays live. */
  scrubAttachment?: true;
};

export type ContinuationRecordUpdate = {
  recordId: string;
  /** The record's owner; the worker refuses a mismatch, so invalidation targets the right owner. */
  ownerSessionKey: string;
  expectedRevision: number;
  patch: ContinuationRecordPatch;
};

/** Owner-scoped live-record facts that the hot-path projection installs after commit. */
export type ContinuationOwnerLiveSet = {
  ownerSessionKey: string;
  records: readonly ContinuationLiveRecordFact[];
};

export type ContinuationLiveRecordFact = {
  recordId: string;
  kind: ContinuationRecordKind;
  status: ContinuationLiveStatus;
  revision: number;
  cancelRequested: boolean;
  createdAt: number;
  dueAt?: number;
};

/** A record this commit moved from a live status to a terminal one. */
export type ContinuationEndedRecordFact = {
  recordId: string;
  ownerSessionKey: string;
  kind: ContinuationRecordKind;
  status: Exclude<ContinuationRecordStatus, ContinuationLiveStatus>;
  createdAt: number;
  endedAt: number;
};

/** Every write reports what it committed so callers release files and refresh projections. */
export type ContinuationCommitFacts = {
  owners: readonly ContinuationOwnerLiveSet[];
  /** Attachment references this commit removed from records, keyed to their record. */
  releasedAttachments: readonly { recordId: string; attachmentId: string }[];
  /** Records this commit terminalized; queue metrics count drains and failures from these. */
  ended: readonly ContinuationEndedRecordFact[];
};

export type ContinuationCasFailure =
  | { outcome: "not_found"; recordId: string }
  | { outcome: "revision_conflict"; recordId: string; revision: number };

export type ContinuationCreateResult =
  | ({ outcome: "created"; record: ContinuationRecord } & ContinuationCommitFacts)
  | { outcome: "exists"; recordId: string; attachmentId?: string };

/** Another payload already holds the attachment ID; the create wrote nothing. */
export type ContinuationPayloadConflict = {
  outcome: "payload_conflict";
  recordId: string;
  attachmentId: string;
};

export type ContinuationUpdateResult =
  | ({ outcome: "applied"; records: readonly ContinuationRecord[] } & ContinuationCommitFacts)
  | ContinuationCasFailure
  | { outcome: "invalid_transition"; recordId: string; reason: string };

export type ContinuationLiveSnapshotEntry = {
  recordId: string;
  revision: number;
  status: ContinuationLiveStatus;
};

/**
 * One election as C's `enqueuePendingWorkReplacing` planned it: the caller's
 * snapshot of every live work record for the owner, the parked records it
 * supersedes, and the new record. The worker rereads and writes in one
 * transaction (RFC §5.4.3).
 */
export type ContinuationElection = {
  ownerSessionKey: string;
  expectedLive: readonly ContinuationLiveSnapshotEntry[];
  supersede: readonly {
    recordId: string;
    expectedRevision: number;
    phase: string;
    stateJson: string;
  }[];
  create: NewContinuationRecord & { kind: "work" };
  now: number;
};

export type ContinuationElectionResult =
  | ({
      outcome: "elected";
      created: ContinuationRecord;
      superseded: readonly ContinuationRecord[];
    } & ContinuationCommitFacts)
  | { outcome: "owner_changed"; ownerSessionKey: string }
  | ContinuationCasFailure
  | { outcome: "invalid_prior"; recordId: string }
  | { outcome: "exists"; recordId: string };

export type ContinuationClaimResult =
  | ({
      outcome: "claimed";
      record: ContinuationRecord;
      attempt: ContinuationSpawnAttempt;
    } & ContinuationCommitFacts)
  | ContinuationCasFailure
  | { outcome: "not_claimable"; recordId: string; reason: string };

export type ContinuationAttemptFailureInput = {
  recordId: string;
  expectedRevision: number;
  attemptId: number;
  failurePhase: ContinuationSpawnFailurePhase;
  patch?: ContinuationRecordPatch;
};

/** A session-delivery row bound on the main thread, inserted inside a custody transaction. */
type ContinuationBoundQueueEntry = ReturnType<typeof bindDeliveryQueueEntry>;

export type ContinuationQueueEntryStatus = "pending" | "completed" | "failed" | "unknown";

/**
 * Deliver a terminal notice obligation (RFC §5.4.2): the notice's queue insert
 * and the obligation clear commit in one transaction. The notice row is
 * insert-if-absent under its record-derived idempotency key, so a replay
 * resolves to the same row.
 */
export type ContinuationNoticeSettlementInput = {
  recordId: string;
  ownerSessionKey: string;
  expectedRevision: number;
  notice: ContinuationBoundQueueEntry;
  now: number;
};

export type ContinuationNoticeSettlementResult =
  | ({
      outcome: "settled";
      record: ContinuationRecord;
      entryId: string;
      /** `completed` means an earlier pass already delivered and adopted this notice. */
      entryStatus: ContinuationQueueEntryStatus;
    } & ContinuationCommitFacts)
  | ContinuationCasFailure
  | { outcome: "not_owed"; recordId: string };

/**
 * Release a claimed post-compaction record to the session delivery queue
 * (RFC §4.4, §5.4.4): the queue insert and the record's handoff commit in one
 * transaction, so a crash can neither lose the delegate nor release it twice.
 */
export type ContinuationPostCompactionReleaseInput = {
  recordId: string;
  ownerSessionKey: string;
  expectedRevision: number;
  entry: ContinuationBoundQueueEntry;
  phase: string;
  stateJson: string;
  now: number;
};

export type ContinuationPostCompactionReleaseResult =
  | ({
      outcome: "released";
      record: ContinuationRecord;
      entryId: string;
    } & ContinuationCommitFacts)
  | ContinuationCasFailure
  | { outcome: "invalid_transition"; recordId: string; reason: string };

export type ContinuationDeleteResult =
  | ({ outcome: "deleted"; recordId: string } & ContinuationCommitFacts)
  | ContinuationCasFailure
  | { outcome: "invalid_transition"; recordId: string; reason: string };

export type ContinuationPruneResult = {
  deletedRecordIds: readonly string[];
};

export type ContinuationRecordQuery = {
  ownerSessionKey?: string;
  kinds?: readonly ContinuationRecordKind[];
  statuses?: readonly ContinuationRecordStatus[];
  recordIds?: readonly string[];
};
