// Recipient actions on delegate artifacts (list, inspect, read, materialize,
// discard), run as shared-state worker commands. Each action authorizes and
// writes its audit row in the same state write transaction.
import type { DatabaseSync } from "node:sqlite";
import { executeSqliteQuerySync, executeSqliteQueryTakeFirstSync } from "../infra/kysely-sync.js";
import {
  toClaim,
  toDelegateArtifactSummaryV1,
  type DelegateArtifactOperationOutcome,
  type DelegateArtifactSummaryV1,
} from "./delegate-artifact-store.js";
import {
  artifactDb,
  auditOperation,
  resolveClaimForRecipient,
} from "./delegate-artifact-store.kernel.js";
import type { DelegateArtifactWorkerOperations } from "./delegate-artifacts.worker-contract.js";

type Operation<Key extends keyof DelegateArtifactWorkerOperations> =
  DelegateArtifactWorkerOperations[Key];

export function listDelegateArtifactsForRecipientInDatabase(
  db: DatabaseSync,
  input: Operation<"delegateArtifacts.listForRecipient">["input"],
): Operation<"delegateArtifacts.listForRecipient">["output"] {
  const kdb = artifactDb(db);
  const now = input.now ?? Date.now();
  const authorized = executeSqliteQueryTakeFirstSync(
    db,
    kdb
      .selectFrom("delegate_artifact_recipient_outcomes")
      .select("flow_id")
      .where("recipient_session_key", "=", input.recipientSessionKey)
      .where("recipient_session_id", "=", input.recipientSessionId)
      .where("outcome", "=", "available")
      .where("delivery_terminal_reason", "is", null)
      .where("delivery_acknowledged_at", "is not", null)
      .orderBy("flow_id")
      .limit(1),
  );
  if (!authorized) {
    auditOperation({
      db,
      action: "list",
      outcome: "unauthorized",
      recipientSessionKey: input.recipientSessionKey,
      recipientSessionId: input.recipientSessionId,
      now,
    });
    return { outcome: "unauthorized" };
  }
  const bindings = executeSqliteQuerySync(
    db,
    kdb
      .selectFrom("delegate_artifact_bindings")
      .select("claim_id")
      .where("delegate_artifact_bindings.recipient_session_key", "=", input.recipientSessionKey)
      .where("delegate_artifact_bindings.recipient_session_id", "=", input.recipientSessionId)
      .where("delegate_artifact_bindings.delivery_acknowledged_at", "is not", null)
      .orderBy("delegate_artifact_bindings.arrived_at")
      .orderBy("delegate_artifact_bindings.claim_id"),
  ).rows;
  const artifacts: DelegateArtifactSummaryV1[] = [];
  const unavailableOutcomes = new Set<Exclude<DelegateArtifactOperationOutcome, "available">>();
  for (const binding of bindings) {
    const resolved = resolveClaimForRecipient({
      db,
      claimId: binding.claim_id,
      recipientSessionKey: input.recipientSessionKey,
      recipientSessionId: input.recipientSessionId,
      crossSessionEnabled: input.crossSessionEnabled,
      now,
    });
    if (resolved.outcome !== "available") {
      unavailableOutcomes.add(resolved.outcome);
      continue;
    }
    artifacts.push(toDelegateArtifactSummaryV1(toClaim(resolved.claim)));
  }
  if (artifacts.length === 0) {
    const outcomePriority = [
      "corrupt",
      "unauthorized",
      "revoked",
      "missing",
      "expired",
    ] as const satisfies readonly Exclude<DelegateArtifactOperationOutcome, "available">[];
    const outcome = outcomePriority.find((candidate) => unavailableOutcomes.has(candidate));
    if (outcome) {
      auditOperation({
        db,
        action: "list",
        outcome,
        recipientSessionKey: input.recipientSessionKey,
        recipientSessionId: input.recipientSessionId,
        now,
      });
      return { outcome };
    }
  }
  auditOperation({
    db,
    action: "list",
    outcome: "available",
    recipientSessionKey: input.recipientSessionKey,
    recipientSessionId: input.recipientSessionId,
    now,
  });
  return {
    outcome: "available",
    artifacts,
  };
}

export function inspectDelegateArtifactForRecipientInDatabase(
  db: DatabaseSync,
  input: Operation<"delegateArtifacts.inspectForRecipient">["input"],
): Operation<"delegateArtifacts.inspectForRecipient">["output"] {
  const now = input.now ?? Date.now();
  const resolved = resolveClaimForRecipient({
    db,
    claimId: input.claimId,
    recipientSessionKey: input.recipientSessionKey,
    recipientSessionId: input.recipientSessionId,
    crossSessionEnabled: input.crossSessionEnabled,
    now,
  });
  auditOperation({
    db,
    action: "inspect",
    outcome: resolved.outcome,
    claimId: input.claimId,
    ...("flowId" in resolved && resolved.flowId ? { flowId: resolved.flowId } : {}),
    recipientSessionKey: input.recipientSessionKey,
    recipientSessionId: input.recipientSessionId,
    now,
  });
  return resolved.outcome === "available"
    ? { outcome: "available", artifact: toDelegateArtifactSummaryV1(toClaim(resolved.claim)) }
    : { outcome: resolved.outcome };
}

export function readDelegateArtifactForMaterializationInDatabase(
  db: DatabaseSync,
  input: Operation<"delegateArtifacts.readForMaterialization">["input"],
): Operation<"delegateArtifacts.readForMaterialization">["output"] {
  const now = input.now ?? Date.now();
  const resolved = resolveClaimForRecipient({
    db,
    claimId: input.claimId,
    recipientSessionKey: input.recipientSessionKey,
    recipientSessionId: input.recipientSessionId,
    crossSessionEnabled: input.crossSessionEnabled,
    now,
  });
  auditOperation({
    db,
    action: "materialize-authorize",
    outcome: resolved.outcome,
    claimId: input.claimId,
    ...("flowId" in resolved && resolved.flowId ? { flowId: resolved.flowId } : {}),
    recipientSessionKey: input.recipientSessionKey,
    recipientSessionId: input.recipientSessionId,
    now,
  });
  if (resolved.outcome !== "available") {
    return { outcome: resolved.outcome };
  }
  if (resolved.claim.backing === null) {
    return { outcome: "corrupt" };
  }
  return { outcome: "available", bytes: Uint8Array.from(resolved.claim.backing) };
}

export function markDelegateArtifactMaterializedInDatabase(
  db: DatabaseSync,
  input: Operation<"delegateArtifacts.markMaterialized">["input"],
): Operation<"delegateArtifacts.markMaterialized">["output"] {
  const now = input.now ?? Date.now();
  const resolved = resolveClaimForRecipient({
    db,
    claimId: input.claimId,
    recipientSessionKey: input.recipientSessionKey,
    recipientSessionId: input.recipientSessionId,
    crossSessionEnabled: input.crossSessionEnabled,
    now,
  });
  if (resolved.outcome === "available") {
    const kdb = artifactDb(db);
    executeSqliteQuerySync(
      db,
      kdb
        .updateTable("delegate_artifact_bindings")
        .set({ status: "materialized", materialized_at: now })
        .where("claim_id", "=", input.claimId)
        .where("recipient_session_key", "=", input.recipientSessionKey)
        .where("recipient_session_id", "=", input.recipientSessionId),
    );
  }
  auditOperation({
    db,
    action: "materialize",
    outcome: resolved.outcome,
    claimId: input.claimId,
    ...("flowId" in resolved && resolved.flowId ? { flowId: resolved.flowId } : {}),
    recipientSessionKey: input.recipientSessionKey,
    recipientSessionId: input.recipientSessionId,
    destination: input.destination,
    now,
  });
  return { outcome: resolved.outcome };
}

export function discardDelegateArtifactForRecipientInDatabase(
  db: DatabaseSync,
  input: Operation<"delegateArtifacts.discardForRecipient">["input"],
): Operation<"delegateArtifacts.discardForRecipient">["output"] {
  const now = input.now ?? Date.now();
  const resolved = resolveClaimForRecipient({
    db,
    claimId: input.claimId,
    recipientSessionKey: input.recipientSessionKey,
    recipientSessionId: input.recipientSessionId,
    crossSessionEnabled: input.crossSessionEnabled,
    now,
  });
  if (resolved.outcome === "available") {
    const kdb = artifactDb(db);
    executeSqliteQuerySync(
      db,
      kdb
        .updateTable("delegate_artifact_bindings")
        .set({ status: "discarded", discarded_at: now })
        .where("claim_id", "=", input.claimId)
        .where("recipient_session_key", "=", input.recipientSessionKey)
        .where("recipient_session_id", "=", input.recipientSessionId),
    );
  }
  auditOperation({
    db,
    action: "discard",
    outcome: resolved.outcome,
    claimId: input.claimId,
    ...("flowId" in resolved && resolved.flowId ? { flowId: resolved.flowId } : {}),
    recipientSessionKey: input.recipientSessionKey,
    recipientSessionId: input.recipientSessionId,
    now,
  });
  return { outcome: resolved.outcome };
}
