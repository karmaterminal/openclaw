import { createHash } from "node:crypto";
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
  "rejected-threshold",
  "no-op",
  "zero-payload",
  "cleanup-failed",
  "finalization-failed",
  "cancelled",
  "interrupted",
  "disabled",
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
  "threshold.noop_rearm",
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
  "finalization.skipped",
] as const;
export type ContinuationOutcomeReason = (typeof CONTINUATION_OUTCOME_REASONS)[number];

export const CONTINUATION_FINALIZATION_STATUSES = ["succeeded", "failed", "skipped"] as const;
export type ContinuationFinalizationStatus = (typeof CONTINUATION_FINALIZATION_STATUSES)[number];

export type ContinuationTelemetryContext = {
  origin: ContinuationSignalOrigin;
  kind: ContinuationPrimitive;
  runId?: string;
  sessionId?: string;
  diagnosticContext?: DiagnosticContext;
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

const CONTINUATION_FINGERPRINT_HEX_LENGTH = 16;
const CONTINUATION_FINGERPRINT_DOMAIN = "openclaw.continuation.telemetry.v1";

function continuationFingerprint(kind: "run" | "session" | "turn", values: readonly string[]) {
  return createHash("sha256")
    .update(JSON.stringify([CONTINUATION_FINGERPRINT_DOMAIN, kind, ...values]))
    .digest("hex")
    .slice(0, CONTINUATION_FINGERPRINT_HEX_LENGTH);
}

export function continuationCorrelationAttributes(params: {
  runId?: string;
  sessionId?: string;
}): ContinuationCorrelationAttributes {
  const runId = params.runId?.trim();
  const sessionId = params.sessionId?.trim();
  return {
    ...(runId
      ? { "continuation.origin.run.fingerprint": continuationFingerprint("run", [runId]) }
      : {}),
    ...(sessionId
      ? { "continuation.session.fingerprint": continuationFingerprint("session", [sessionId]) }
      : {}),
    ...(runId && sessionId
      ? {
          "continuation.turn.fingerprint": continuationFingerprint("turn", [sessionId, runId]),
        }
      : {}),
  };
}

export function continuationProvenanceAttributes(
  context: ContinuationTelemetryContext,
): ContinuationProvenanceAttributes {
  return {
    "continuation.signal.origin": context.origin,
    "continuation.signal.kind": context.kind,
    ...continuationCorrelationAttributes(context),
    ...diagnosticContextSpanAttributes(context.diagnosticContext),
  };
}

export function continuationTerminalAttributes(params: {
  outcome: ContinuationOutcome;
  reason?: ContinuationOutcomeReason;
  payloadBytes?: number;
  finalizationStatus?: ContinuationFinalizationStatus;
}): ContinuationTerminalAttributes {
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
