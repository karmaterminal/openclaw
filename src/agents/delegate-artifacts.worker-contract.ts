import type {
  DelegateArtifactOperationOutcome,
  DelegateArtifactPolicyV1,
  DelegateArtifactRecipientProjectionV1,
  DelegateArtifactSummaryV1,
} from "./delegate-artifact-store.js";

type DelegateArtifactRecipientScope = {
  recipientSessionKey: string;
  recipientSessionId: string;
  crossSessionEnabled: boolean;
  /** Absent means the worker's clock when the command's transaction runs. */
  now?: number;
};

type Refused = { outcome: Exclude<DelegateArtifactOperationOutcome, "available"> };

export type DelegateArtifactPublicationResult =
  | { status: "published"; count: number }
  | {
      status: "rejected";
      reason:
        | "forbidden"
        | "runtime_disabled"
        | "invalid_candidate"
        | "policy_limit"
        | "policy_expired";
    };

export type DelegateArtifactFinalizeResult =
  | { status: "not-configured" }
  | { status: "deferred" }
  | {
      status: "failed";
      disposition: string;
      projections?: Map<string, DelegateArtifactRecipientProjectionV1>;
    }
  | {
      status: "finalized";
      disposition: "available" | "optional-no-artifacts" | "optional-zero-eligible";
      projections: Map<string, DelegateArtifactRecipientProjectionV1>;
    };

export type DelegateArtifactFinalizeInput = {
  producerSessionKey: string;
  producerSessionId: string;
  producerRunId: string;
  completionId: string;
  finalizationKey: string;
  completionStatus: "ok" | "timeout" | "error" | "unknown";
  completedAt: number;
  silent: boolean;
  runtimeEnabled: boolean;
  crossSessionEnabled: boolean;
  /**
   * Current incarnations the host resolved before the command, keyed by session
   * key; `null` means the session no longer exists. A finalization that needs
   * a key missing here commits nothing and names the keys to resolve.
   */
  sessionIds: Record<string, string | null>;
  now?: number;
};

export type DelegateArtifactDeliveryPreparation =
  | { status: "ready"; projection: DelegateArtifactRecipientProjectionV1 }
  | { status: "acknowledged" }
  | { status: "deferred" }
  | { status: "unavailable" };

export type DelegateArtifactDeliveryUnavailableReason =
  | "recipient-incarnation-changed"
  | "recipient-no-longer-active"
  | "delivery-state-unavailable";

/** Shared-state worker operations owned by managed delegate-artifact returns. */
export type DelegateArtifactWorkerOperations = {
  "delegateArtifacts.publish": {
    input: {
      producerSessionKey: string;
      producerSessionId: string;
      producerRunId: string;
      publicationKey: string;
      candidates: Array<{ bytes: Uint8Array; mimeType: string }>;
      crossSessionEnabled: boolean;
      now?: number;
    };
    output: DelegateArtifactPublicationResult;
  };
  "delegateArtifacts.finalize": {
    input: DelegateArtifactFinalizeInput;
    output: DelegateArtifactFinalizeResult | { status: "needs-session-ids"; sessionKeys: string[] };
  };
  "delegateArtifacts.createPolicy": {
    input: { policy: DelegateArtifactPolicyV1 };
    output: void;
  };
  "delegateArtifacts.readPolicyState": {
    input: { flowId: string };
    output: "active" | "missing" | "unavailable";
  };
  "delegateArtifacts.hasRecordedCompletion": {
    input: { flowId: string; producerSessionKey: string };
    output: boolean;
  };
  "delegateArtifacts.isReturnConfigured": {
    input: { producerRunId: string };
    output: boolean;
  };
  "delegateArtifacts.removeUnacceptedPolicy": {
    input: { flowId: string };
    output: void;
  };
  "delegateArtifacts.purgeExpired": {
    input: { now?: number };
    output: number;
  };
  "delegateArtifacts.listForRecipient": {
    input: DelegateArtifactRecipientScope;
    output: { outcome: "available"; artifacts: DelegateArtifactSummaryV1[] } | Refused;
  };
  "delegateArtifacts.inspectForRecipient": {
    input: DelegateArtifactRecipientScope & { claimId: string };
    output: { outcome: "available"; artifact: DelegateArtifactSummaryV1 } | Refused;
  };
  "delegateArtifacts.readForMaterialization": {
    input: DelegateArtifactRecipientScope & { claimId: string };
    output: { outcome: "available"; bytes: Uint8Array } | Refused;
  };
  "delegateArtifacts.markMaterialized": {
    input: DelegateArtifactRecipientScope & { claimId: string; destination: string };
    output: { outcome: DelegateArtifactOperationOutcome };
  };
  "delegateArtifacts.discardForRecipient": {
    input: DelegateArtifactRecipientScope & { claimId: string };
    output: { outcome: DelegateArtifactOperationOutcome };
  };
  "delegateArtifacts.prepareDelivery": {
    input: {
      projection: DelegateArtifactRecipientProjectionV1;
      crossSessionEnabled: boolean;
      currentRecipientSessionId?: string;
      now?: number;
    };
    output: DelegateArtifactDeliveryPreparation;
  };
  "delegateArtifacts.markDeliveryUnavailable": {
    input: {
      dispatchId: string;
      recipientSessionKey: string;
      recipientSessionId: string;
      reason: DelegateArtifactDeliveryUnavailableReason;
      now?: number;
    };
    output: void;
  };
  "delegateArtifacts.recordDeliveryBinding": {
    input: {
      dispatchId: string;
      recipientSessionKey: string;
      recipientSessionId: string;
      phase: "attempt" | "replay" | "acknowledged";
      availability?: "available" | "unavailable";
      now?: number;
    };
    output: void;
  };
};
