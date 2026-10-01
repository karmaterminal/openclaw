// Delegate-artifact policy rows, run as shared-state worker commands inside
// the command's state write transaction.
import type { DatabaseSync } from "node:sqlite";
import { executeSqliteQuerySync, executeSqliteQueryTakeFirstSync } from "../infra/kysely-sync.js";
import {
  ALLOWED_MIME_PATTERNS,
  DELEGATE_ARTIFACT_MAX_BYTES,
  DELEGATE_ARTIFACT_MAX_COUNT,
  DELEGATE_ARTIFACT_MAX_TOTAL_BYTES,
  DELEGATE_ARTIFACT_OUTPUT_ROOT,
  DELEGATE_ARTIFACT_PURGE_BATCH_SIZE,
  DELEGATE_ARTIFACT_RETENTION_MS,
  type DelegateArtifactPolicyV1,
} from "./delegate-artifact-store.js";
import { artifactDb } from "./delegate-artifact-store.kernel.js";

/** Insert-if-absent of an accepted dispatch policy; a replay must match it exactly. */
export function createDelegateArtifactPolicyInDatabase(
  db: DatabaseSync,
  { policy, now }: { policy: DelegateArtifactPolicyV1; now: number },
): void {
  const kdb = artifactDb(db);
  const existing = executeSqliteQueryTakeFirstSync(
    db,
    kdb.selectFrom("delegate_artifact_policies").selectAll().where("flow_id", "=", policy.flowId),
  );
  const recipientsJson = JSON.stringify(policy.recipients);
  const routeJson = JSON.stringify(policy.route);
  const dispatchAcceptedAt = existing?.dispatch_accepted_at ?? policy.dispatchAcceptedAt ?? now;
  if (existing) {
    const immutableMatch =
      existing.producer_session_key === policy.producerSessionKey &&
      existing.producer_session_id === (policy.producerSessionId ?? null) &&
      existing.producer_run_id === policy.producerRunId &&
      existing.origin_parent_session_key === policy.originParentSessionKey &&
      existing.origin_parent_session_id === policy.originParentSessionId &&
      existing.dispatch_revision === policy.dispatchRevision &&
      existing.dispatch_accepted_at === dispatchAcceptedAt &&
      existing.scheduled_at === (policy.scheduledAt ?? null) &&
      existing.not_before === (policy.notBefore ?? null) &&
      existing.artifact_mode === policy.artifactMode &&
      existing.recipient_context === (policy.recipientContext ?? null) &&
      existing.recipients_json === recipientsJson &&
      existing.route_json === routeJson;
    if (!immutableMatch) {
      throw new Error("delegate artifact policy replay did not match accepted dispatch");
    }
    return;
  }
  executeSqliteQuerySync(
    db,
    kdb.insertInto("delegate_artifact_policies").values({
      flow_id: policy.flowId,
      producer_session_key: policy.producerSessionKey,
      producer_session_id: policy.producerSessionId ?? null,
      producer_run_id: policy.producerRunId,
      origin_parent_session_key: policy.originParentSessionKey,
      origin_parent_session_id: policy.originParentSessionId,
      policy_version: 1,
      dispatch_revision: policy.dispatchRevision,
      dispatch_accepted_at: dispatchAcceptedAt,
      scheduled_at: policy.scheduledAt ?? null,
      not_before: policy.notBefore ?? null,
      artifact_mode: policy.artifactMode,
      recipient_context: policy.recipientContext ?? null,
      recipients_json: recipientsJson,
      route_json: routeJson,
      output_root: DELEGATE_ARTIFACT_OUTPUT_ROOT,
      max_artifact_count: DELEGATE_ARTIFACT_MAX_COUNT,
      max_artifact_bytes: DELEGATE_ARTIFACT_MAX_BYTES,
      max_total_bytes: DELEGATE_ARTIFACT_MAX_TOTAL_BYTES,
      allowed_mimes_json: JSON.stringify(ALLOWED_MIME_PATTERNS),
      retention_deadline:
        Math.max(dispatchAcceptedAt, policy.notBefore ?? dispatchAcceptedAt) +
        DELEGATE_ARTIFACT_RETENTION_MS,
      status: "active",
      completion_id: null,
      completion_finalization_key: null,
      completed_at: null,
      completion_status: null,
      completion_delivery_mode: null,
      completion_disposition: null,
    }),
  );
}

/** Whether a dispatch may still run against its accepted policy, at the worker's clock. */
export function readDelegateArtifactPolicyStateInDatabase(
  db: DatabaseSync,
  input: { flowId: string; now: number },
): "active" | "missing" | "unavailable" {
  const policy = executeSqliteQueryTakeFirstSync(
    db,
    artifactDb(db)
      .selectFrom("delegate_artifact_policies")
      .select(["status", "retention_deadline"])
      .where("flow_id", "=", input.flowId),
  );
  if (!policy) {
    return "missing";
  }
  return policy.status !== "active" || policy.retention_deadline <= input.now
    ? "unavailable"
    : "active";
}

export function hasRecordedDelegateArtifactCompletionInDatabase(
  db: DatabaseSync,
  input: { flowId: string; producerSessionKey: string },
): boolean {
  const policy = executeSqliteQueryTakeFirstSync(
    db,
    artifactDb(db)
      .selectFrom("delegate_artifact_policies")
      .select(["completed_at", "producer_session_key"])
      .where("flow_id", "=", input.flowId),
  );
  return policy?.completed_at != null && policy.producer_session_key === input.producerSessionKey;
}

export function isDelegateArtifactReturnConfiguredInDatabase(
  db: DatabaseSync,
  input: { producerRunId: string },
): boolean {
  return Boolean(
    executeSqliteQueryTakeFirstSync(
      db,
      artifactDb(db)
        .selectFrom("delegate_artifact_policies")
        .select("flow_id")
        .where("producer_run_id", "=", input.producerRunId),
    ),
  );
}

/** Delete a policy no child accepted: still active, never bound to a producer session, no claims. */
export function removeUnacceptedDelegateArtifactPolicyInDatabase(
  db: DatabaseSync,
  input: { flowId: string },
): void {
  const kdb = artifactDb(db);
  const policy = executeSqliteQueryTakeFirstSync(
    db,
    kdb
      .selectFrom("delegate_artifact_policies")
      .select(["status", "producer_session_id"])
      .where("flow_id", "=", input.flowId),
  );
  if (!policy) {
    return;
  }
  const claim = executeSqliteQueryTakeFirstSync(
    db,
    kdb
      .selectFrom("delegate_artifact_claims")
      .select("claim_id")
      .where("flow_id", "=", input.flowId)
      .limit(1),
  );
  if (policy.status !== "active" || policy.producer_session_id !== null || claim) {
    return;
  }
  executeSqliteQuerySync(
    db,
    kdb.deleteFrom("delegate_artifact_policies").where("flow_id", "=", input.flowId),
  );
}

/** Purge one batch of expired claim backing; returns the number of policies touched. */
export function purgeExpiredDelegateArtifactsInDatabase(
  db: DatabaseSync,
  input: { now: number },
): number {
  const { now } = input;
  const kdb = artifactDb(db);
  const expiredPolicies = executeSqliteQuerySync(
    db,
    kdb
      .selectFrom("delegate_artifact_policies")
      .innerJoin(
        "delegate_artifact_claims",
        "delegate_artifact_claims.flow_id",
        "delegate_artifact_policies.flow_id",
      )
      .select("delegate_artifact_policies.flow_id")
      .distinct()
      .where("delegate_artifact_policies.retention_deadline", "<=", now)
      .where("delegate_artifact_claims.status", "!=", "purged")
      .limit(DELEGATE_ARTIFACT_PURGE_BATCH_SIZE),
  ).rows;
  for (const policy of expiredPolicies) {
    executeSqliteQuerySync(
      db,
      kdb
        .updateTable("delegate_artifact_claims")
        .set({ status: "purged", backing: null })
        .where("flow_id", "=", policy.flow_id)
        .where("status", "in", [
          "pending",
          "staged",
          "available",
          "expired",
          "revoked",
          "orphaned",
        ]),
    );
  }
  return expiredPolicies.length;
}
