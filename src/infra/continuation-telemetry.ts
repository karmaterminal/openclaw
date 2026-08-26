import type { DiagnosticContext } from "./diagnostic-context.js";
import {
  diagnosticContextSpanAttributes,
  type DiagnosticContextSpanAttributes,
} from "./diagnostic-context.js";

export const CONTINUATION_SIGNAL_ORIGINS = [
  "typed-tool",
  "tool-call",
  "bracket",
  "post-compaction",
  "queue-drain",
] as const;
export type ContinuationSignalOrigin = (typeof CONTINUATION_SIGNAL_ORIGINS)[number];

export const CONTINUATION_PRIMITIVES = ["work", "delegate", "compaction"] as const;
export type ContinuationPrimitive = (typeof CONTINUATION_PRIMITIVES)[number];

export const CONTINUATION_OUTCOMES = [
  "scheduled",
  "fired",
  "delivered",
  "finalized",
  "folded",
  "superseded",
  "evaporated",
  "rejected-cap",
  "rejected-policy",
  "no-op",
  "zero-payload",
  "finalization-failed",
  "cancelled",
  "failed",
] as const;
export type ContinuationOutcome = (typeof CONTINUATION_OUTCOMES)[number];

export const CONTINUATION_OUTCOME_REASONS = [
  "dispatch.accepted",
  "dispatch.rejected",
  "dispatch.failed",
  "dispatch.cancelled",
  "dispatch.superseded",
  "cap.chain",
  "cap.cost",
  "cap.delegates_per_turn",
  "cap.pending_work",
  "policy.cross_session_targeting",
  "queue.drained",
  "queue.empty",
  "flow.granted",
  "flow.folded",
  "flow.superseded",
  "flow.reaped",
  "flow.failed",
  "finalization.answered",
  "finalization.empty",
  "finalization.failed",
] as const;
export type ContinuationOutcomeReason = (typeof CONTINUATION_OUTCOME_REASONS)[number];

export const CONTINUATION_FINALIZATION_STATUSES = ["succeeded", "failed", "skipped"] as const;
export type ContinuationFinalizationStatus = (typeof CONTINUATION_FINALIZATION_STATUSES)[number];

export type ContinuationSpanContext = ContinuationCorrelationSource & {
  diagnosticContext?: DiagnosticContext;
};

export type ContinuationTelemetryContext = ContinuationSpanContext & {
  origin: ContinuationSignalOrigin;
  kind: ContinuationPrimitive;
};

export type ContinuationCorrelationSource = {
  runId?: string;
  sessionId?: string;
};

export type ContinuationCorrelationAttributes = {
  readonly "continuation.origin.run.fingerprint"?: string;
  readonly "continuation.session.fingerprint"?: string;
  readonly "continuation.turn.fingerprint"?: string;
};

export type ContinuationProvenanceAttributes = ContinuationCorrelationAttributes &
  DiagnosticContextSpanAttributes & {
    readonly "continuation.signal.origin": ContinuationSignalOrigin;
    readonly "continuation.signal.kind": ContinuationPrimitive;
  };

export type ContinuationTerminalAttributes = {
  readonly "continuation.outcome": ContinuationOutcome;
  readonly "continuation.outcome.reason"?: ContinuationOutcomeReason;
  readonly "continuation.payload.bytes"?: number;
  readonly "continuation.finalization.status"?: ContinuationFinalizationStatus;
};

export type ContinuationTerminal = (
  | { outcome: "scheduled"; reason: "dispatch.accepted" }
  | { outcome: "fired"; reason?: never }
  | { outcome: "delivered"; reason: "queue.drained" | "flow.granted" }
  | { outcome: "finalized"; reason: "finalization.answered" }
  | { outcome: "folded"; reason: "flow.folded" }
  | { outcome: "superseded"; reason: "dispatch.superseded" | "flow.superseded" }
  | { outcome: "evaporated"; reason: "flow.reaped" }
  | {
      outcome: "rejected-cap";
      reason: "cap.chain" | "cap.cost" | "cap.delegates_per_turn" | "cap.pending_work";
    }
  | {
      outcome: "rejected-policy";
      reason: "dispatch.rejected" | "policy.cross_session_targeting";
    }
  | { outcome: "no-op"; reason?: "queue.empty" }
  | { outcome: "zero-payload"; reason: "finalization.empty" }
  | { outcome: "finalization-failed"; reason: "finalization.failed" }
  | { outcome: "cancelled"; reason: "dispatch.cancelled" }
  | { outcome: "failed"; reason: "dispatch.failed" | "flow.failed" }
) & {
  payloadBytes?: number;
  finalizationStatus?: ContinuationFinalizationStatus;
};

export function continuationProvenanceAttributes(
  context: ContinuationTelemetryContext,
): ContinuationProvenanceAttributes {
  return {
    "continuation.signal.origin": context.origin,
    "continuation.signal.kind": context.kind,
    ...diagnosticContextSpanAttributes(context.diagnosticContext),
  };
}

export function continuationTerminalAttributes(
  params: ContinuationTerminal,
): ContinuationTerminalAttributes {
  return {
    "continuation.outcome": params.outcome,
    ...(params.reason ? { "continuation.outcome.reason": params.reason } : {}),
    ...(params.payloadBytes !== undefined
      ? { "continuation.payload.bytes": Math.max(0, Math.floor(params.payloadBytes)) }
      : {}),
    ...(params.finalizationStatus
      ? { "continuation.finalization.status": params.finalizationStatus }
      : {}),
  };
}
