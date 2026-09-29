import type {
  ContinuationAttemptFailureInput,
  ContinuationClaimResult,
  ContinuationCreateResult,
  ContinuationDeleteResult,
  ContinuationElection,
  ContinuationElectionResult,
  ContinuationNoticeSettlementInput,
  ContinuationNoticeSettlementResult,
  ContinuationPostCompactionReleaseInput,
  ContinuationPostCompactionReleaseResult,
  ContinuationPruneResult,
  ContinuationRecord,
  ContinuationRecordQuery,
  ContinuationRecordUpdate,
  ContinuationUpdateResult,
  NewContinuationRecord,
} from "./custody-store.types.js";

/** Shared-state worker operations owned by continuation custody (RFC §5.4.2). */
export type ContinuationCustodyWorkerOperations = {
  "continuationCustody.create": {
    input: { record: NewContinuationRecord };
    output: ContinuationCreateResult;
  };
  "continuationCustody.update": {
    input: { updates: ContinuationRecordUpdate[]; now: number };
    output: ContinuationUpdateResult;
  };
  "continuationCustody.elect": {
    input: ContinuationElection;
    output: ContinuationElectionResult;
  };
  "continuationCustody.claimSpawnAttempt": {
    input: { recordId: string; expectedRevision: number; now: number };
    output: ContinuationClaimResult;
  };
  "continuationCustody.recordSpawnAttemptFailure": {
    input: ContinuationAttemptFailureInput & { now: number };
    output: ContinuationUpdateResult;
  };
  "continuationCustody.delete": {
    input: { recordId: string; expectedRevision: number };
    output: ContinuationDeleteResult;
  };
  "continuationCustody.prune": {
    input: { endedBefore: number };
    output: ContinuationPruneResult;
  };
  "continuationCustody.settleNotice": {
    input: ContinuationNoticeSettlementInput;
    output: ContinuationNoticeSettlementResult;
  };
  "continuationCustody.releasePostCompaction": {
    input: ContinuationPostCompactionReleaseInput;
    output: ContinuationPostCompactionReleaseResult;
  };
  /** Owners whose legacy TaskFlow rows the Doctor import has not committed (§5.4.5). */
  "continuationCustody.listAwaitingImportOwners": {
    input: Record<string, never>;
    output: string[];
  };
  "continuationCustody.list": {
    input: ContinuationRecordQuery;
    output: ContinuationRecord[];
  };
};
