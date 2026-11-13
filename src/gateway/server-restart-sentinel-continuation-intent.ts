import type { RestartSentinelPayload } from "../infra/restart-sentinel.js";
import type {
  QueuedSessionDelivery,
  QueuedSessionDeliveryPayload,
  SessionDeliveryRoute,
} from "../infra/session-delivery-queue.records.js";
import type { DeliveryContext } from "../utils/delivery-context.shared.js";

export const RESTART_CONTINUATION_BUSY_MAX_ATTEMPTS = 20;
export const RESTART_CONTINUATION_BUSY_RETRY_ERROR =
  "restart continuation deferred because previous run is still shutting down";

export function isRestartContinuationBusyRetry(entry: QueuedSessionDelivery | null): boolean {
  return entry?.lastError === RESTART_CONTINUATION_BUSY_RETRY_ERROR;
}

export function buildQueuedRestartContinuation(params: {
  sessionKey: string;
  agentId?: string;
  continuation: NonNullable<RestartSentinelPayload["continuation"]>;
  route?: SessionDeliveryRoute;
  expectedSessionId?: string | undefined;
  revision: number;
  deliveryContext?: DeliveryContext;
  idempotencyKey?: string;
}): QueuedSessionDeliveryPayload {
  const idempotencyKey =
    params.idempotencyKey ??
    `restart-sentinel:${params.sessionKey}:${params.continuation.kind}:${params.revision}`;
  if (params.continuation.kind === "systemEvent") {
    return {
      kind: "systemEvent",
      sessionKey: params.sessionKey,
      ...(params.agentId ? { agentId: params.agentId } : {}),
      text: params.continuation.text,
      ...(params.expectedSessionId ? { expectedSessionId: params.expectedSessionId } : {}),
      ...(params.deliveryContext ? { deliveryContext: params.deliveryContext } : {}),
      idempotencyKey,
      maxRetries: RESTART_CONTINUATION_BUSY_MAX_ATTEMPTS,
      completionRetention: "permanent",
    };
  }
  return {
    kind: "agentTurn",
    sessionKey: params.sessionKey,
    message: params.continuation.message,
    messageId: idempotencyKey,
    ...(params.expectedSessionId ? { expectedSessionId: params.expectedSessionId } : {}),
    maxRetries: RESTART_CONTINUATION_BUSY_MAX_ATTEMPTS,
    completionRetention: "permanent",
    ...(params.route ? { route: params.route } : {}),
    ...(params.deliveryContext ? { deliveryContext: params.deliveryContext } : {}),
    idempotencyKey,
  };
}
