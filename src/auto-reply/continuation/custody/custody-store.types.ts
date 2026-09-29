// Records and operation results of the continuation custody store (RFC
// docs/design/continue-work-signal-v2.md §5.4.2). The store interprets only
// the fields below; per-kind controller state stays opaque JSON owned by the
// continuation codecs.
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
};

/** Every write reports what it committed so callers release files and refresh projections. */
export type ContinuationCommitFacts = {
  owners: readonly ContinuationOwnerLiveSet[];
  /** Attachment references this commit removed from records, keyed to their record. */
  releasedAttachments: readonly { recordId: string; attachmentId: string }[];
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

export type ContinuationDeleteResult =
  | ({ outcome: "deleted"; recordId: string } & ContinuationCommitFacts)
  | ContinuationCasFailure;

export type ContinuationPruneResult = {
  deletedRecordIds: readonly string[];
};

export type ContinuationRecordQuery = {
  ownerSessionKey?: string;
  kinds?: readonly ContinuationRecordKind[];
  statuses?: readonly ContinuationRecordStatus[];
  recordIds?: readonly string[];
};
