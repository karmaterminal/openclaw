// Managed delegate-artifact delivery state (prepare, terminal unavailability,
// attempt/replay/acknowledgement bindings), run as shared-state worker
// commands inside the command's state write transaction.
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { executeSqliteQuerySync, executeSqliteQueryTakeFirstSync } from "../infra/kysely-sync.js";
import {
  policyRequiresCrossSessionGate,
  projectionMatchesDurableFacts,
} from "./delegate-artifact-store.js";
import {
  artifactDb,
  auditOperation,
  claimRowsForFlow,
  projectionsForCompletedPolicy,
} from "./delegate-artifact-store.kernel.js";
import type { DelegateArtifactWorkerOperations } from "./delegate-artifacts.worker-contract.js";

type Operation<Key extends keyof DelegateArtifactWorkerOperations> =
  DelegateArtifactWorkerOperations[Key];

export function prepareDelegateArtifactDeliveryInDatabase(
  db: DatabaseSync,
  input: Operation<"delegateArtifacts.prepareDelivery">["input"],
): Operation<"delegateArtifacts.prepareDelivery">["output"] {
  const now = input.now ?? Date.now();
  const context = input.projection.arrivalContext;
  const markUnavailable = () => {
    markDelegateArtifactDeliveryUnavailableInDatabase({
      db,
      dispatchId: context.dispatchId,
      recipientSessionKey: context.binding.recipientSessionKey,
      recipientSessionId: context.binding.recipientSessionId,
      reason: "delivery-state-unavailable",
      now,
    });
    return { status: "unavailable" } as const;
  };
  const kdb = artifactDb(db);
  const policy = executeSqliteQueryTakeFirstSync(
    db,
    kdb
      .selectFrom("delegate_artifact_policies")
      .selectAll()
      .where("flow_id", "=", context.dispatchId),
  );
  if (
    !policy ||
    (policy.status !== "completed" && policy.status !== "failed") ||
    policy.completion_id !== context.completionId
  ) {
    return { status: "unavailable" } as const;
  }
  try {
    if (!input.crossSessionEnabled && policyRequiresCrossSessionGate(policy)) {
      return { status: "deferred" } as const;
    }
  } catch {
    return { status: "unavailable" } as const;
  }
  const recipientOutcome = executeSqliteQueryTakeFirstSync(
    db,
    kdb
      .selectFrom("delegate_artifact_recipient_outcomes")
      .selectAll()
      .where("flow_id", "=", context.dispatchId)
      .where("recipient_session_key", "=", context.binding.recipientSessionKey)
      .where("recipient_session_id", "=", context.binding.recipientSessionId),
  );
  if (
    recipientOutcome?.outcome !== "available" ||
    recipientOutcome.delivery_terminal_reason !== null
  ) {
    return recipientOutcome?.delivery_terminal_reason
      ? { status: "unavailable" }
      : markUnavailable();
  }
  if (recipientOutcome.delivery_acknowledged_at !== null) {
    return { status: "acknowledged" } as const;
  }
  if (input.currentRecipientSessionId !== context.binding.recipientSessionId) {
    markDelegateArtifactDeliveryUnavailableInDatabase({
      db,
      dispatchId: context.dispatchId,
      recipientSessionKey: context.binding.recipientSessionKey,
      recipientSessionId: context.binding.recipientSessionId,
      reason: "recipient-incarnation-changed",
      now,
    });
    return { status: "unavailable" } as const;
  }
  const claims = claimRowsForFlow(db, context.dispatchId).filter(
    (claim) => claim.status === "available",
  );
  const corruptBacking = claims.some(
    (claim) =>
      claim.backing === null ||
      claim.backing.byteLength !== claim.size_bytes ||
      createHash("sha256").update(claim.backing).digest("hex") !== claim.sha256,
  );
  if (policy.retention_deadline <= now || corruptBacking) {
    return markUnavailable();
  }
  const bindings = executeSqliteQuerySync(
    db,
    kdb
      .selectFrom("delegate_artifact_bindings")
      .innerJoin(
        "delegate_artifact_claims",
        "delegate_artifact_claims.claim_id",
        "delegate_artifact_bindings.claim_id",
      )
      .select([
        "delegate_artifact_bindings.claim_id",
        "delegate_artifact_bindings.status",
        "delegate_artifact_bindings.arrived_at",
      ])
      .where("delegate_artifact_claims.flow_id", "=", context.dispatchId)
      .where("recipient_session_key", "=", context.binding.recipientSessionKey)
      .where("recipient_session_id", "=", context.binding.recipientSessionId),
  ).rows;
  if (
    bindings.length !== claims.length ||
    bindings.some((binding) => binding.status === "discarded" || binding.status === "unavailable")
  ) {
    return markUnavailable();
  }
  const deliveredAt = recipientOutcome.first_delivery_at ?? now;
  const durableProjection = projectionsForCompletedPolicy({
    db,
    policy,
    deliveredAt,
    availability: policy.completion_disposition === "available" ? "available" : "unavailable",
  }).get(context.binding.recipientSessionKey);
  if (!durableProjection || !projectionMatchesDurableFacts(input.projection, durableProjection)) {
    return { status: "unavailable" } as const;
  }
  return {
    status: "ready",
    projection: durableProjection,
  } as const;
}

export function markDelegateArtifactDeliveryUnavailableInDatabase(params: {
  db: DatabaseSync;
  dispatchId: string;
  recipientSessionKey: string;
  recipientSessionId: string;
  reason: string;
  now: number;
}): void {
  const kdb = artifactDb(params.db);
  executeSqliteQuerySync(
    params.db,
    kdb
      .updateTable("delegate_artifact_bindings")
      .set({ status: "unavailable", unavailable_reason: params.reason })
      .where(
        "claim_id",
        "in",
        kdb
          .selectFrom("delegate_artifact_claims")
          .select("claim_id")
          .where("flow_id", "=", params.dispatchId),
      )
      .where("recipient_session_key", "=", params.recipientSessionKey)
      .where("recipient_session_id", "=", params.recipientSessionId)
      .where("status", "in", ["available", "materialized"])
      .where("delivery_acknowledged_at", "is", null),
  );
  executeSqliteQuerySync(
    params.db,
    kdb
      .updateTable("delegate_artifact_recipient_outcomes")
      .set({ delivery_terminal_reason: params.reason })
      .where("flow_id", "=", params.dispatchId)
      .where("recipient_session_key", "=", params.recipientSessionKey)
      .where("recipient_session_id", "=", params.recipientSessionId)
      .where("delivery_acknowledged_at", "is", null),
  );
  auditOperation({
    db: params.db,
    action: "delivery-terminal",
    outcome: "unavailable",
    flowId: params.dispatchId,
    recipientSessionKey: params.recipientSessionKey,
    recipientSessionId: params.recipientSessionId,
    now: params.now,
  });
}

export function recordDelegateArtifactDeliveryBindingInDatabase(
  db: DatabaseSync,
  input: Operation<"delegateArtifacts.recordDeliveryBinding">["input"],
): void {
  const now = input.now ?? Date.now();
  const kdb = artifactDb(db);
  const recipientOutcome = executeSqliteQueryTakeFirstSync(
    db,
    kdb
      .selectFrom("delegate_artifact_recipient_outcomes")
      .selectAll()
      .where("flow_id", "=", input.dispatchId)
      .where("recipient_session_key", "=", input.recipientSessionKey)
      .where("recipient_session_id", "=", input.recipientSessionId),
  );
  if (
    !recipientOutcome ||
    recipientOutcome.outcome !== "available" ||
    recipientOutcome.delivery_terminal_reason !== null
  ) {
    throw new Error("delegate artifact delivery binding is unavailable");
  }
  if (input.phase === "acknowledged" && recipientOutcome.first_delivery_at === null) {
    throw new Error("delegate artifact delivery cannot be acknowledged before its attempt");
  }
  if (input.phase === "acknowledged" && recipientOutcome.delivery_acknowledged_at !== null) {
    return;
  }
  if (input.phase !== "acknowledged" && recipientOutcome.delivery_acknowledged_at !== null) {
    return;
  }
  if (input.phase === "attempt" && recipientOutcome.first_delivery_at !== null) {
    return;
  }
  executeSqliteQuerySync(
    db,
    kdb
      .updateTable("delegate_artifact_recipient_outcomes")
      .set(
        input.phase === "acknowledged"
          ? { delivery_acknowledged_at: now }
          : input.phase === "attempt"
            ? { first_delivery_at: now }
            : recipientOutcome.first_delivery_at === null
              ? { first_delivery_at: now, replayed_at: now }
              : { replayed_at: now },
      )
      .where("flow_id", "=", input.dispatchId)
      .where("recipient_session_key", "=", input.recipientSessionKey)
      .where("recipient_session_id", "=", input.recipientSessionId),
  );
  const bindings = executeSqliteQuerySync(
    db,
    kdb
      .selectFrom("delegate_artifact_bindings")
      .innerJoin(
        "delegate_artifact_claims",
        "delegate_artifact_claims.claim_id",
        "delegate_artifact_bindings.claim_id",
      )
      .select(["delegate_artifact_bindings.claim_id", "delegate_artifact_bindings.arrived_at"])
      .where("delegate_artifact_claims.flow_id", "=", input.dispatchId)
      .where("delegate_artifact_bindings.recipient_session_key", "=", input.recipientSessionKey)
      .where("delegate_artifact_bindings.recipient_session_id", "=", input.recipientSessionId),
  ).rows;
  for (const binding of bindings) {
    const update =
      input.phase === "acknowledged"
        ? { delivery_acknowledged_at: now }
        : input.phase === "attempt"
          ? { arrived_at: now, last_delivery_attempt_at: now }
          : binding.arrived_at === null
            ? { arrived_at: now, replayed_at: now, last_delivery_attempt_at: now }
            : { replayed_at: now, last_delivery_attempt_at: now };
    executeSqliteQuerySync(
      db,
      kdb
        .updateTable("delegate_artifact_bindings")
        .set(update)
        .where("claim_id", "=", binding.claim_id)
        .where("recipient_session_key", "=", input.recipientSessionKey)
        .where("recipient_session_id", "=", input.recipientSessionId),
    );
  }
  auditOperation({
    db,
    action:
      input.phase === "acknowledged"
        ? "delivery-acknowledged"
        : input.phase === "replay"
          ? "delivery-replay"
          : "delivery-attempt",
    outcome: input.availability ?? "available",
    flowId: input.dispatchId,
    recipientSessionKey: input.recipientSessionKey,
    recipientSessionId: input.recipientSessionId,
    now,
  });
}
