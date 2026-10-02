// Delegate-artifact SQL kernel. Only the shared-state worker operations in
// `delegate-artifact-*.worker.ts` import it, so every statement here runs on
// the worker thread inside the command's state write transaction.
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  executeSqliteQuerySync,
  executeSqliteQueryTakeFirstSync,
  getNodeSqliteKysely,
} from "../infra/kysely-sync.js";
import { createOpenClawStateSchemaEnsurer } from "../state/openclaw-state-feature-schema.js";
import {
  policyRequiresCrossSessionGate,
  toClaim,
  toDelegateArtifactSummaryV1,
  type ClaimRow,
  type DelegateArtifactDatabase,
  type DelegateArtifactOperationOutcome,
  type DelegateArtifactRecipientProjectionV1,
  type PolicyRow,
} from "./delegate-artifact-store.js";

/**
 * Creates the five canonical delegate-artifact tables and their indexes once
 * per database handle, before the command's write transaction.
 */
export const ensureDelegateArtifactsSchema = createOpenClawStateSchemaEnsurer({
  table: "delegate_artifact_policies",
  endMarker:
    "  ON delegate_artifact_audit(recipient_session_key, recipient_session_id, occurred_at, sequence);\n",
  operationLabel: "delegate-artifacts.schema.ensure",
});

export function artifactDb(db: DatabaseSync) {
  return getNodeSqliteKysely<DelegateArtifactDatabase>(db);
}

export function claimRowsForFlow(db: DatabaseSync, flowId: string): ClaimRow[] {
  const kdb = artifactDb(db);
  return executeSqliteQuerySync(
    db,
    kdb
      .selectFrom("delegate_artifact_claims")
      .selectAll()
      .where("flow_id", "=", flowId)
      .orderBy("ordinal"),
  ).rows;
}

export function projectionsForCompletedPolicy(params: {
  db: DatabaseSync;
  policy: PolicyRow;
  deliveredAt: number;
  replayedAt?: number;
  availability?: "available" | "unavailable";
}): Map<string, DelegateArtifactRecipientProjectionV1> {
  if (!params.policy.completion_id || params.policy.completed_at === null) {
    return new Map();
  }
  const deliveryMode = z
    .enum(["announced", "silent"])
    .safeParse(params.policy.completion_delivery_mode);
  if (!deliveryMode.success) {
    return new Map();
  }
  const kdb = artifactDb(params.db);
  const claims = claimRowsForFlow(params.db, params.policy.flow_id)
    .filter((row) => row.status === "available")
    .map(toClaim);
  const outcomes = executeSqliteQuerySync(
    params.db,
    kdb
      .selectFrom("delegate_artifact_recipient_outcomes")
      .selectAll()
      .where("flow_id", "=", params.policy.flow_id)
      .where("outcome", "=", "available"),
  ).rows;
  const projections = new Map<string, DelegateArtifactRecipientProjectionV1>();
  for (const outcome of outcomes) {
    const binding = executeSqliteQueryTakeFirstSync(
      params.db,
      kdb
        .selectFrom("delegate_artifact_bindings")
        .innerJoin(
          "delegate_artifact_claims",
          "delegate_artifact_claims.claim_id",
          "delegate_artifact_bindings.claim_id",
        )
        .select(["arrived_at", "replayed_at"])
        .where("delegate_artifact_claims.flow_id", "=", params.policy.flow_id)
        .where("recipient_session_key", "=", outcome.recipient_session_key)
        .where("recipient_session_id", "=", outcome.recipient_session_id)
        .limit(1),
    );
    const recipientContext =
      outcome.recipient_relation === "inter_session" && outcome.purpose
        ? { purpose: outcome.purpose }
        : undefined;
    projections.set(outcome.recipient_session_key, {
      artifacts: claims.map(toDelegateArtifactSummaryV1),
      arrivalContext: {
        deliveryClass:
          outcome.recipient_relation === "parent" ? "delegate result" : "inter-session enrichment",
        deliveryMode: deliveryMode.data,
        dispatchId: params.policy.flow_id,
        producer: {
          sessionKey: params.policy.producer_session_key,
          runId: params.policy.producer_run_id,
        },
        completionId: params.policy.completion_id,
        binding: {
          recipientSessionKey: outcome.recipient_session_key,
          recipientSessionId: outcome.recipient_session_id,
        },
        dispatchAcceptedAt: params.policy.dispatch_accepted_at,
        ...(params.policy.scheduled_at !== null ? { scheduledAt: params.policy.scheduled_at } : {}),
        ...(params.policy.not_before !== null ? { notBefore: params.policy.not_before } : {}),
        completedAt: params.policy.completed_at,
        deliveredAt: binding?.arrived_at ?? outcome.first_delivery_at ?? params.deliveredAt,
        ...(params.replayedAt !== undefined
          ? { replayedAt: params.replayedAt }
          : binding?.replayed_at !== null && binding?.replayed_at !== undefined
            ? { replayedAt: binding.replayed_at }
            : outcome.replayed_at !== null
              ? { replayedAt: outcome.replayed_at }
              : {}),
        policyVersion: 1,
        availability: params.availability ?? "available",
        ...(recipientContext ? { recipientContext } : {}),
      },
    });
  }
  return projections;
}

export function auditOperation(params: {
  db: DatabaseSync;
  action: string;
  outcome: string;
  claimId?: string;
  flowId?: string;
  recipientSessionKey: string;
  recipientSessionId: string;
  destination?: string;
  now: number;
}): void {
  const kdb = artifactDb(params.db);
  executeSqliteQuerySync(
    params.db,
    kdb.insertInto("delegate_artifact_audit").values({
      action: params.action,
      outcome: params.outcome,
      claim_id: params.claimId ?? null,
      flow_id: params.flowId ?? null,
      recipient_session_key: params.recipientSessionKey,
      recipient_session_id: params.recipientSessionId,
      destination: params.destination ?? null,
      occurred_at: params.now,
    }),
  );
}

export function resolveClaimForRecipient(params: {
  db: DatabaseSync;
  claimId: string;
  recipientSessionKey: string;
  recipientSessionId: string;
  crossSessionEnabled: boolean;
  now: number;
}):
  | { outcome: "available"; claim: ClaimRow; policy: PolicyRow }
  | { outcome: Exclude<DelegateArtifactOperationOutcome, "available">; flowId?: string } {
  const kdb = artifactDb(params.db);
  const claim = executeSqliteQueryTakeFirstSync(
    params.db,
    kdb.selectFrom("delegate_artifact_claims").selectAll().where("claim_id", "=", params.claimId),
  );
  if (!claim) {
    return { outcome: "missing" };
  }
  const policy = executeSqliteQueryTakeFirstSync(
    params.db,
    kdb.selectFrom("delegate_artifact_policies").selectAll().where("flow_id", "=", claim.flow_id),
  );
  const binding = executeSqliteQueryTakeFirstSync(
    params.db,
    kdb
      .selectFrom("delegate_artifact_bindings")
      .selectAll()
      .where("claim_id", "=", params.claimId)
      .where("recipient_session_key", "=", params.recipientSessionKey)
      .where("recipient_session_id", "=", params.recipientSessionId),
  );
  if (!policy || !binding) {
    return { outcome: "unauthorized", flowId: claim.flow_id };
  }
  if (policy.retention_deadline <= params.now || claim.status === "expired") {
    return { outcome: "expired", flowId: claim.flow_id };
  }
  if (claim.status === "revoked" || binding.status === "discarded") {
    return { outcome: "revoked", flowId: claim.flow_id };
  }
  if (binding.status === "unavailable") {
    return { outcome: "unauthorized", flowId: claim.flow_id };
  }
  try {
    if (!params.crossSessionEnabled && policyRequiresCrossSessionGate(policy)) {
      return { outcome: "unauthorized", flowId: claim.flow_id };
    }
  } catch {
    return { outcome: "corrupt", flowId: claim.flow_id };
  }
  if (binding.arrived_at === null || binding.delivery_acknowledged_at === null) {
    return { outcome: "unauthorized", flowId: claim.flow_id };
  }
  if (
    claim.status !== "available" ||
    policy.status !== "completed" ||
    claim.backing === null ||
    claim.backing.byteLength !== claim.size_bytes ||
    createHash("sha256").update(claim.backing).digest("hex") !== claim.sha256
  ) {
    return { outcome: "corrupt", flowId: claim.flow_id };
  }
  return { outcome: "available", claim, policy };
}
