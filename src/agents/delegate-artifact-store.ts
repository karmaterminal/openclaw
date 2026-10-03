// Shared delegate-artifact vocabulary: limits, row and projection types, and the
// pure validators both the host and the shared-state worker use. SQL lives in
// `delegate-artifact-store.kernel.ts`, which only worker operations import.
import type { ArtifactSummary } from "@openclaw/gateway-protocol";
import { z } from "zod";

export const DELEGATE_ARTIFACT_OUTPUT_ROOT = ".openclaw/delegate-output";
export const DELEGATE_ARTIFACT_MAX_COUNT = 8;
export const DELEGATE_ARTIFACT_MAX_BYTES = 16 * 1024 * 1024;
export const DELEGATE_ARTIFACT_MAX_TOTAL_BYTES = 32 * 1024 * 1024;
export const DELEGATE_ARTIFACT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const DELEGATE_ARTIFACT_PURGE_BATCH_SIZE = 100;

const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
export const ALLOWED_MIME_PATTERNS = [
  "image/*",
  "audio/*",
  "video/*",
  "text/*",
  "application/json",
  "application/pdf",
  "application/zip",
] as const;

type DelegateArtifactModeV1 = "forbidden" | "optional" | "required";

export type DelegateArtifactRecipientV1 = {
  sessionKey: string;
  sessionId: string;
  relation: "parent" | "inter_session";
  purpose?: string;
};

export type DelegateArtifactRouteV1 =
  | { kind: "parent" }
  | { kind: "target"; targetSessionKey: string }
  | { kind: "targets"; targetSessionKeys: string[] }
  | { kind: "fanout"; fanoutMode: "tree" | "all" };

export type DelegateArtifactPolicyV1 = {
  flowId: string;
  producerSessionKey: string;
  producerSessionId?: string;
  producerRunId: string;
  originParentSessionKey: string;
  originParentSessionId: string;
  dispatchRevision: number;
  dispatchAcceptedAt?: number;
  scheduledAt?: number;
  notBefore?: number;
  artifactMode: Exclude<DelegateArtifactModeV1, "forbidden">;
  recipientContext?: string;
  recipients: DelegateArtifactRecipientV1[];
  route: DelegateArtifactRouteV1;
};

type DelegateArtifactClaim = {
  claimId: string;
  flowId: string;
  type: string;
  title: string;
  mimeType?: string;
  sizeBytes: number;
  createdAt: number;
  finalizedAt?: number;
};

export type DelegateArtifactSummaryV1 = Pick<
  ArtifactSummary,
  "id" | "type" | "title" | "mimeType" | "sizeBytes" | "source" | "download"
> & {
  source: "delegate-return";
  download: { mode: "unsupported" };
};

type DelegateArtifactArrivalContextV1 = {
  deliveryClass: "delegate result" | "inter-session enrichment";
  deliveryMode: "announced" | "silent";
  dispatchId: string;
  producer: { sessionKey: string; runId: string };
  completionId: string;
  binding: { recipientSessionKey: string; recipientSessionId: string };
  dispatchAcceptedAt: number;
  scheduledAt?: number;
  notBefore?: number;
  completedAt: number;
  deliveredAt: number;
  replayedAt?: number;
  policyVersion: 1;
  availability: "available" | "unavailable";
  recipientContext?: { purpose: string };
};

export type DelegateArtifactRecipientProjectionV1 = {
  artifacts: DelegateArtifactSummaryV1[];
  arrivalContext: DelegateArtifactArrivalContextV1;
};

export type DelegateArtifactOperationOutcome =
  | "available"
  | "expired"
  | "revoked"
  | "missing"
  | "corrupt"
  | "unauthorized";

export type DelegateArtifactDatabase = {
  delegate_artifact_policies: {
    flow_id: string;
    producer_session_key: string;
    producer_session_id: string | null;
    producer_run_id: string;
    origin_parent_session_key: string;
    origin_parent_session_id: string;
    policy_version: number;
    dispatch_revision: number;
    dispatch_accepted_at: number;
    scheduled_at: number | null;
    not_before: number | null;
    artifact_mode: string;
    recipient_context: string | null;
    recipients_json: string;
    route_json: string;
    output_root: string;
    max_artifact_count: number;
    max_artifact_bytes: number;
    max_total_bytes: number;
    allowed_mimes_json: string;
    retention_deadline: number;
    status: string;
    completion_id: string | null;
    completion_finalization_key: string | null;
    completed_at: number | null;
    completion_status: string | null;
    completion_delivery_mode: string | null;
    completion_disposition: string | null;
  };
  delegate_artifact_claims: {
    claim_id: string;
    flow_id: string;
    publication_key: string;
    publication_index: number;
    ordinal: number;
    artifact_type: string;
    title: string;
    mime_type: string | null;
    size_bytes: number;
    sha256: string;
    backing: Uint8Array | null;
    status: string;
    created_at: number;
    finalized_at: number | null;
  };
  delegate_artifact_recipient_outcomes: {
    flow_id: string;
    recipient_session_key: string;
    recipient_session_id: string;
    recipient_relation: string;
    purpose: string | null;
    outcome: string;
    unavailable_reason: string | null;
    decided_at: number;
    first_delivery_at: number | null;
    replayed_at: number | null;
    delivery_acknowledged_at: number | null;
    delivery_terminal_reason: string | null;
  };
  delegate_artifact_bindings: {
    claim_id: string;
    recipient_session_key: string;
    recipient_session_id: string;
    recipient_relation: string;
    purpose: string | null;
    status: string;
    unavailable_reason: string | null;
    arrived_at: number | null;
    replayed_at: number | null;
    materialized_at: number | null;
    discarded_at: number | null;
    last_delivery_attempt_at: number | null;
    delivery_acknowledged_at: number | null;
  };
  delegate_artifact_audit: {
    sequence?: number;
    action: string;
    outcome: string;
    claim_id: string | null;
    flow_id: string | null;
    recipient_session_key: string;
    recipient_session_id: string;
    destination: string | null;
    occurred_at: number;
  };
};

export type PolicyRow = DelegateArtifactDatabase["delegate_artifact_policies"];
export type ClaimRow = DelegateArtifactDatabase["delegate_artifact_claims"];

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

const PurposeSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 1024)
  .refine((value) => !hasControlCharacter(value));
const RecipientSchema = z.discriminatedUnion("relation", [
  z
    .object({
      sessionKey: z.string().trim().min(1),
      sessionId: z.string().trim().min(1),
      relation: z.literal("parent"),
    })
    .strict(),
  z
    .object({
      sessionKey: z.string().trim().min(1),
      sessionId: z.string().trim().min(1),
      relation: z.literal("inter_session"),
      purpose: PurposeSchema,
    })
    .strict(),
]);

export const RecipientsSchema = z.array(RecipientSchema).min(1);
export const RouteSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("parent") }).strict(),
  z.object({ kind: z.literal("target"), targetSessionKey: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("targets"), targetSessionKeys: z.array(z.string().min(1)) }).strict(),
  z.object({ kind: z.literal("fanout"), fanoutMode: z.enum(["tree", "all"]) }).strict(),
]);
const SummarySchema = z
  .object({
    id: z.string().uuid(),
    type: z.string().min(1),
    title: z.string().min(1),
    mimeType: z.string().regex(MIME_PATTERN).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    source: z.literal("delegate-return"),
    download: z.object({ mode: z.literal("unsupported") }).strict(),
  })
  .strict();
export const DelegateArtifactRecipientProjectionSchema = z
  .object({
    artifacts: z.array(SummarySchema),
    arrivalContext: z
      .object({
        deliveryClass: z.enum(["delegate result", "inter-session enrichment"]),
        deliveryMode: z.enum(["announced", "silent"]),
        dispatchId: z.string().min(1),
        producer: z
          .object({
            sessionKey: z.string().min(1),
            runId: z.string().min(1),
          })
          .strict(),
        completionId: z.string().min(1),
        binding: z
          .object({
            recipientSessionKey: z.string().min(1),
            recipientSessionId: z.string().min(1),
          })
          .strict(),
        dispatchAcceptedAt: z.number().int().nonnegative(),
        scheduledAt: z.number().int().nonnegative().optional(),
        notBefore: z.number().int().nonnegative().optional(),
        completedAt: z.number().int().nonnegative(),
        deliveredAt: z.number().int().nonnegative(),
        replayedAt: z.number().int().nonnegative().optional(),
        policyVersion: z.literal(1),
        availability: z.enum(["available", "unavailable"]),
        recipientContext: z.object({ purpose: PurposeSchema }).strict().optional(),
      })
      .strict(),
  })
  .strict();

export function parseRecipients(
  row: Pick<PolicyRow, "recipients_json">,
): DelegateArtifactRecipientV1[] {
  return RecipientsSchema.parse(JSON.parse(row.recipients_json));
}

export function parseRoute(row: Pick<PolicyRow, "route_json">): DelegateArtifactRouteV1 {
  return RouteSchema.parse(JSON.parse(row.route_json));
}

export function policyRequiresCrossSessionGate(
  policy: Pick<PolicyRow, "route_json" | "recipients_json">,
): boolean {
  const route = parseRoute(policy);
  return (
    route.kind !== "parent" &&
    !(route.kind === "fanout" && route.fanoutMode === "tree") &&
    parseRecipients(policy).some((recipient) => recipient.relation === "inter_session")
  );
}

const AllowedMimePatternsSchema = z
  .array(
    z
      .string()
      .min(3)
      .max(127)
      .regex(/^[a-z0-9!#$&^_.+-]+\/(?:[a-z0-9!#$&^_.+-]+|\*)$/),
  )
  .min(1)
  .max(64);

export function isAllowedMime(mimeType: string, allowedPatterns: readonly string[]): boolean {
  if (!MIME_PATTERN.test(mimeType)) {
    return false;
  }
  return allowedPatterns.some((pattern) =>
    pattern.endsWith("/*") ? mimeType.startsWith(pattern.slice(0, -1)) : mimeType === pattern,
  );
}

export function parseAllowedMimePatterns(policy: PolicyRow): string[] | undefined {
  try {
    const parsed = AllowedMimePatternsSchema.safeParse(JSON.parse(policy.allowed_mimes_json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function classifyArtifact(mimeType: string): { type: string; title: string } {
  if (mimeType.startsWith("image/")) {
    return { type: "image", title: "Delegate image" };
  }
  if (mimeType.startsWith("audio/")) {
    return { type: "audio", title: "Delegate audio" };
  }
  if (mimeType.startsWith("video/")) {
    return { type: "video", title: "Delegate video" };
  }
  if (mimeType === "application/pdf") {
    return { type: "report", title: "Delegate report" };
  }
  if (mimeType === "application/json" || mimeType === "text/csv") {
    return { type: "dataset", title: "Delegate dataset" };
  }
  if (mimeType === "text/x-diff" || mimeType === "text/x-patch") {
    return { type: "patch", title: "Delegate patch" };
  }
  return { type: "file", title: "Delegate file" };
}

export function toClaim(row: ClaimRow): DelegateArtifactClaim {
  return {
    claimId: row.claim_id,
    flowId: row.flow_id,
    type: row.artifact_type,
    title: row.title,
    ...(row.mime_type ? { mimeType: row.mime_type } : {}),
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    ...(row.finalized_at !== null ? { finalizedAt: row.finalized_at } : {}),
  };
}

function assertSafeArtifactScalar(value: string, field: "type" | "title" | "mimeType"): void {
  const unsafe =
    hasControlCharacter(value) ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("://") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value) ||
    /^bearer(?:\s|$)/i.test(value);
  if (unsafe || (field === "mimeType" && !MIME_PATTERN.test(value))) {
    throw new Error("invalid delegate artifact " + field);
  }
}

/** Construct the only recipient-visible artifact projection from host-validated claim metadata. */
export function toDelegateArtifactSummaryV1(
  claim: DelegateArtifactClaim,
): DelegateArtifactSummaryV1 {
  assertSafeArtifactScalar(claim.type, "type");
  assertSafeArtifactScalar(claim.title, "title");
  if (claim.mimeType) {
    if (!MIME_PATTERN.test(claim.mimeType)) {
      throw new Error("invalid delegate artifact mimeType");
    }
  }
  return SummarySchema.parse({
    id: claim.claimId,
    type: claim.type,
    title: claim.title,
    ...(claim.mimeType ? { mimeType: claim.mimeType } : {}),
    sizeBytes: claim.sizeBytes,
    source: "delegate-return",
    download: { mode: "unsupported" },
    // SAFETY: sizeBytes is always supplied above from claim.sizeBytes, so despite SummarySchema marking it optional (for unrelated reuse), the parsed output always matches this type.
  }) as DelegateArtifactSummaryV1;
}

export function projectionMatchesDurableFacts(
  supplied: DelegateArtifactRecipientProjectionV1,
  durable: DelegateArtifactRecipientProjectionV1,
): boolean {
  const {
    deliveredAt: _suppliedDeliveredAt,
    replayedAt: _suppliedReplayedAt,
    ...suppliedContext
  } = supplied.arrivalContext;
  const {
    deliveredAt: _durableDeliveredAt,
    replayedAt: _durableReplayedAt,
    ...durableContext
  } = durable.arrivalContext;
  return (
    JSON.stringify(supplied.artifacts) === JSON.stringify(durable.artifacts) &&
    JSON.stringify(suppliedContext) === JSON.stringify(durableContext)
  );
}
