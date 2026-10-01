import type {
  LegacyContinuationFlowRow,
  PendingPostCompactionEntry,
} from "./legacy-taskflow-migration-source.js";

/** One owner session's receipt-less legacy sources, as the import planned them. */
export type LegacyImportOwnerSnapshot = {
  ownerSessionKey: string;
  rows: LegacyContinuationFlowRow[];
  entries: PendingPostCompactionEntry[];
};

/** Payload outcome per flow ID, copied to the new root before the owner commit. */
export type LegacyImportPayloadOutcomes = Record<string, "copied" | "missing">;

export type LegacyImportOwnerResult = {
  imported: number;
  retired: number;
  settledEntries: number;
  notices: number;
  warnings: string[];
  releaseLegacyAttachments: LegacyPayloadRelease[];
};

export type LegacyPayloadRelease = { attachmentId: string; flowId: string };

/**
 * Shared-state worker operations of the continuation TaskFlow custody import
 * (RFC docs/design/continue-work-signal-v2.md §5.4.5). They join the
 * `continuationCustody.*` family, so the custody dispatcher runs each one as one
 * state write transaction under the caller's BEGIN and COMMIT admission.
 */
export type ContinuationLegacyImportWorkerOperations = {
  /** Receipt-less work for every owner, read before any payload copy or write. */
  "continuationCustody.readLegacySnapshot": {
    input: Record<string, never>;
    output: { owners: LegacyImportOwnerSnapshot[]; anomalies: number };
  };
  /** One owner session, one commit; a source changed since the snapshot fails the owner. */
  "continuationCustody.importLegacyOwner": {
    input: {
      snapshot: LegacyImportOwnerSnapshot;
      payloads: LegacyImportPayloadOutcomes;
      now: number;
    };
    output: LegacyImportOwnerResult;
  };
  /** Legacy payload deletes that committed receipts owe; the files may already be gone. */
  "continuationCustody.readOwedLegacyReleases": {
    input: Record<string, never>;
    output: LegacyPayloadRelease[];
  };
};
