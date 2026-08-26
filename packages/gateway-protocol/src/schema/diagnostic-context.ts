import type { Static } from "typebox";
import { Type } from "typebox";
import { closedObject } from "./closed-object.js";

const PROOF_RUN_ID_PATTERN = "^[a-f0-9]{16}$";
const PROOF_ROW_ID_PATTERN = "^[A-Z][A-Z0-9-]{2,63}$";
const IMMUTABLE_GIT_SHA_PATTERN = "^[a-f0-9]{40}$";

export const DiagnosticProofContextSchema = closedObject({
  runId: Type.String({ pattern: PROOF_RUN_ID_PATTERN }),
  rowId: Type.String({ pattern: PROOF_ROW_ID_PATTERN }),
  candidateSha: Type.String({ pattern: IMMUTABLE_GIT_SHA_PATTERN }),
  harnessRef: Type.String({ pattern: IMMUTABLE_GIT_SHA_PATTERN }),
});

/**
 * Closed, public-safe diagnostics metadata admitted with one run.
 *
 * The envelope is intentionally generic while every supported context kind is
 * schema-owned. Callers cannot inject arbitrary span attribute names or values.
 */
export const DiagnosticContextSchema = closedObject({
  proof: DiagnosticProofContextSchema,
});

export type DiagnosticProofContext = Static<typeof DiagnosticProofContextSchema>;
export type DiagnosticContext = Static<typeof DiagnosticContextSchema>;
