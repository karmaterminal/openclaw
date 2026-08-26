import { Value } from "typebox/value";
import {
  DiagnosticContextSchema,
  type DiagnosticContext,
} from "../../packages/gateway-protocol/src/schema/diagnostic-context.js";

export type DiagnosticContextSpanAttributes = {
  readonly "openclaw.proof.run_id"?: string;
  readonly "openclaw.proof.row_id"?: string;
  readonly "openclaw.proof.candidate_sha"?: string;
  readonly "openclaw.proof.harness_ref"?: string;
  readonly "openclaw.proof.synthetic"?: boolean;
};

export function normalizeDiagnosticContext(value: unknown): DiagnosticContext | undefined {
  if (!Value.Check(DiagnosticContextSchema, value)) {
    return undefined;
  }
  const proof = value.proof;
  return Object.freeze({
    proof: Object.freeze({
      runId: proof.runId,
      rowId: proof.rowId,
      candidateSha: proof.candidateSha,
      harnessRef: proof.harnessRef,
    }),
  });
}

export function diagnosticContextSpanAttributes(
  context: DiagnosticContext | undefined,
): DiagnosticContextSpanAttributes {
  const proof = normalizeDiagnosticContext(context)?.proof;
  if (!proof) {
    return {};
  }
  return {
    "openclaw.proof.run_id": proof.runId,
    "openclaw.proof.row_id": proof.rowId,
    "openclaw.proof.candidate_sha": proof.candidateSha,
    "openclaw.proof.harness_ref": proof.harnessRef,
    "openclaw.proof.synthetic": true,
  };
}

export type {
  DiagnosticContext,
  DiagnosticProofContext,
} from "../../packages/gateway-protocol/src/schema/diagnostic-context.js";
