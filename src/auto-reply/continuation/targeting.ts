import { isSessionRecipientAuthorityCurrent } from "../../config/sessions/session-accessor.js";
import type { SessionRecipientAuthority } from "../../config/sessions/session-recipient-authority-types.js";
import { emitContinuationFanoutSpan } from "../../infra/continuation-tracer.js";
import {
  markTrustedContinuationHeartbeatWake,
  requestHeartbeatNow,
} from "../../infra/heartbeat-wake.js";
import type { scheduleSessionDelivery } from "../../infra/session-delivery-queue-runtime.js";
import {
  ackSessionDelivery,
  enqueueSessionDelivery,
} from "../../infra/session-delivery-queue-storage.js";
import type {
  QueuedSessionDeliveryPayload,
  SessionDeliveryContext,
} from "../../infra/session-delivery-queue-storage.js";
import {
  enqueueSystemEventRaw as enqueueSystemEvent,
  hasQueuedSystemEventDelivery,
  removeSystemEvents,
} from "../../infra/system-events.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { normalizeAgentId, resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import { captureContinuationQueueContext } from "./queue-context.js";
import { withContinuationOwner } from "./system-event-ownership.js";
import {
  CONTINUATION_DELEGATE_FANOUT_MODES,
  hasCrossSessionDelegateTargeting,
  normalizeContinuationTargetKey,
  normalizeContinuationTargetKeys,
} from "./targeting-pure.js";
import type {
  ContinuationDelegateFanoutMode,
  ContinuationDelegateTargeting,
} from "./targeting-pure.js";

export {
  CONTINUATION_DELEGATE_FANOUT_MODES,
  hasCrossSessionDelegateTargeting,
  normalizeContinuationTargetKey,
  normalizeContinuationTargetKeys,
};
export function resolveContinuationReturnTargetSessionKeys(
  params: ContinuationDelegateTargeting & {
    defaultSessionKey: string;
    treeSessionKeys?: readonly string[];
    allSessionKeys?: readonly string[];
    childSessionKey?: string;
  },
): string[] {
  const defaultSessionKey = normalizeContinuationTargetKey(params.defaultSessionKey);
  const fallback = defaultSessionKey ? [defaultSessionKey] : [];

  if (params.fanoutMode === "tree") {
    const treeKeys = normalizeContinuationTargetKeys(params.treeSessionKeys);
    return treeKeys.length > 0 ? treeKeys : fallback;
  }

  if (params.fanoutMode === "all") {
    const childSessionKey = normalizeContinuationTargetKey(params.childSessionKey);
    const allKeys = normalizeContinuationTargetKeys(params.allSessionKeys).filter(
      (sessionKey) => sessionKey !== childSessionKey,
    );
    return allKeys.length > 0 ? allKeys : fallback;
  }

  const explicitKeys = normalizeContinuationTargetKeys([
    ...(params.targetSessionKey ? [params.targetSessionKey] : []),
    ...(params.targetSessionKeys ?? []),
  ]);
  return explicitKeys.length > 0 ? explicitKeys : fallback;
}

type ContinuationReturnDeliveryDeps = {
  enqueueSessionDelivery: typeof enqueueSessionDelivery;
  /** Test seam proving queued durable delivery is not acknowledged before prompt adoption. */
  ackSessionDelivery?: typeof import("../../infra/session-delivery-queue-storage.js").ackSessionDelivery;
  enqueueSystemEvent: typeof enqueueSystemEvent;
  requestHeartbeatNow: typeof requestHeartbeatNow;
  isRecipientAuthorityCurrent?: (
    sessionKey: string,
    authority: SessionRecipientAuthority,
  ) => boolean;
  removeSystemEvents?: typeof removeSystemEvents;
  /** Arms the delivery scheduler's retry for a row the full queue refused. */
  scheduleSessionDelivery?: typeof scheduleSessionDelivery;
};

const log = createSubsystemLogger("continuation/targeting");

const defaultContinuationReturnDeliveryDeps: ContinuationReturnDeliveryDeps = {
  enqueueSessionDelivery,
  enqueueSystemEvent,
  requestHeartbeatNow,
};

// Resolved on first use, like continuation-notice-surface: an eager binding
// would force every test that mocks the runtime module to declare it.
const scheduleRefusedReturnDelivery: typeof scheduleSessionDelivery = async (...args) =>
  await (
    await import("../../infra/session-delivery-queue-runtime.js")
  ).scheduleSessionDelivery(...args);

function resolveContinuationReturnDeliveryTarget(params: {
  sessionKey: string;
  recipientAgentIds?: ReadonlyMap<string, string>;
}): { sessionKey: string; recipientAgentId: string } {
  const explicitRecipientAgentId = params.sessionKey.startsWith("agent:")
    ? resolveAgentIdFromSessionKey(params.sessionKey)
    : undefined;
  const boundRecipientAgentId = params.recipientAgentIds?.get(params.sessionKey)?.trim();
  const normalizedBoundRecipientAgentId = boundRecipientAgentId
    ? normalizeAgentId(boundRecipientAgentId)
    : undefined;

  if (
    explicitRecipientAgentId &&
    normalizedBoundRecipientAgentId &&
    explicitRecipientAgentId !== normalizedBoundRecipientAgentId
  ) {
    throw new Error(`Continuation recipient owner mismatches target ${params.sessionKey}`);
  }

  const recipientAgentId = normalizedBoundRecipientAgentId ?? explicitRecipientAgentId;
  if (!recipientAgentId) {
    throw new Error(`Continuation recipient owner is unavailable for target ${params.sessionKey}`);
  }
  return {
    sessionKey: params.sessionKey,
    recipientAgentId,
  };
}

export async function enqueueContinuationReturnDeliveries(
  params: {
    targetSessionKeys: readonly string[];
    text: string;
    idempotencyKeyBase: string;
    recipientAuthorities?: ReadonlyMap<string, SessionRecipientAuthority>;
    deliveryContext?: SessionDeliveryContext;
    wakeRecipients?: boolean;
    childRunId?: string;
    stateDir?: string;
    traceparent?: string;
    fanoutMode?: ContinuationDelegateFanoutMode;
    chainStepRemaining?: number;
    recipientAgentIds?: ReadonlyMap<string, string>;
    ownerAgentId?: string;
  },
  deps: ContinuationReturnDeliveryDeps = defaultContinuationReturnDeliveryDeps,
): Promise<{
  /** Durable rows written for current recipients, including any the full queue refused. */
  enqueued: number;
  /** Rows whose event reached the queue now; `enqueued - delivered` wait for the scheduler's retry. */
  delivered: number;
  deliveryIds: string[];
}> {
  if (!params.ownerAgentId) {
    throw new Error("Continuation return source owner is unavailable.");
  }
  const targetSessionKeys = normalizeContinuationTargetKeys(params.targetSessionKeys);
  const targets = targetSessionKeys.map((sessionKey) =>
    resolveContinuationReturnDeliveryTarget({
      sessionKey,
      recipientAgentIds: params.recipientAgentIds,
    }),
  );
  const deliveryIds: string[] = [];
  let delivered = 0;

  for (const { sessionKey, recipientAgentId } of targets) {
    const text = params.text;
    const recipientAuthority = params.recipientAuthorities?.get(sessionKey);
    const recipientAuthorityCurrent = () =>
      !recipientAuthority ||
      (
        deps.isRecipientAuthorityCurrent ??
        ((key, authority) => isSessionRecipientAuthorityCurrent({ sessionKey: key }, authority))
      )(sessionKey, recipientAuthority);
    if (!recipientAuthorityCurrent()) {
      continue;
    }
    const commonPayload = {
      kind: "systemEvent" as const,
      sessionKey,
      agentId: recipientAgentId,
      text,
      ...(params.deliveryContext ? { deliveryContext: params.deliveryContext } : {}),
      ...(params.traceparent ? { traceparent: params.traceparent } : {}),
      // Recipient position is not stable when a cleaned intermediate is
      // removed from a tree/all fanout. Keep retries keyed to the durable
      // recipient identity instead.
      idempotencyKey: `${params.idempotencyKeyBase}:${sessionKey}`,
    };
    // Every return settles only once a prompt adopts it, with or without
    // recipient authority: if the queue refuses the fast path, or the process
    // dies before adoption, the row is what replays the return.
    const payload: QueuedSessionDeliveryPayload = {
      ...commonPayload,
      ...(recipientAuthority ? { recipientAuthority } : {}),
      awaitPromptAdoption: true,
    };
    const deliveryId = await deps.enqueueSessionDelivery(
      payload,
      captureContinuationQueueContext(params.stateDir),
    );
    if (!recipientAuthorityCurrent()) {
      // Stale authority can never adopt this row; retire it now rather than leave it until replay.
      await (deps.ackSessionDelivery ?? ackSessionDelivery)(
        deliveryId,
        captureContinuationQueueContext(params.stateDir),
      );
      continue;
    }

    const eventOptions = {
      sessionKey,
      trusted: true,
      ...(params.deliveryContext ? { deliveryContext: params.deliveryContext } : {}),
      ...(params.traceparent ? { traceparent: params.traceparent } : {}),
      sessionDeliveryAckId: deliveryId,
      ...(params.stateDir ? { sessionDeliveryAckStateDir: params.stateDir } : {}),
      ...(recipientAuthority ? { recipientAuthority } : {}),
      sessionDeliveryAwaitsTurnAdoption: true,
    };
    const ownedEventOptions = withContinuationOwner(eventOptions, recipientAgentId);
    // Never ack on `false`. It is either a de-duplicated re-enqueue (the
    // idempotent row already rides a queued event that carries its ack id) or a
    // capacity refusal (nothing is queued and the row is the only copy).
    const refused =
      !deps.enqueueSystemEvent(text, ownedEventOptions) &&
      !hasQueuedSystemEventDelivery(ownedEventOptions);
    if (!recipientAuthorityCurrent()) {
      (deps.removeSystemEvents ?? removeSystemEvents)(
        sessionKey,
        (event) =>
          event.sessionDeliveryAckId === deliveryId &&
          event.sessionDeliveryAckStateDir === params.stateDir,
      );
      await (deps.ackSessionDelivery ?? ackSessionDelivery)(
        deliveryId,
        captureContinuationQueueContext(params.stateDir),
      );
      continue;
    }
    deliveryIds.push(deliveryId);
    if (refused) {
      // Not delivered and not woken: a wake now would run a turn without the
      // return. The scheduler retries the row (deferred while the queue stays
      // full) and the replay that admits it wakes the recipient.
      log.warn(
        `[continuation:return-held] system event queue full; deliveryId=${deliveryId} session=${sessionKey} retry armed`,
      );
      await (deps.scheduleSessionDelivery ?? scheduleRefusedReturnDelivery)(
        deliveryId,
        captureContinuationQueueContext(params.stateDir),
      );
      continue;
    }
    if (params.wakeRecipients) {
      deps.requestHeartbeatNow(
        markTrustedContinuationHeartbeatWake({
          sessionKey,
          agentId: recipientAgentId,
          reason: "delegate-return",
          parentRunId: params.childRunId,
        }),
      );
    }
    // For a queued event, do NOT ack the durable file here. The in-memory event
    // carries the ack id and the prompt-drain path acknowledges it only after
    // recipient consumption; non-attached recipients still need restart recovery
    // to replay this file.
    delivered += 1;
  }

  if (
    (params.traceparent !== undefined || params.chainStepRemaining !== undefined) &&
    (params.fanoutMode !== undefined || targetSessionKeys.length > 1)
  ) {
    emitContinuationFanoutSpan({
      targetSessionKeys,
      deliveredCount: delivered,
      ...(params.fanoutMode ? { fanoutMode: params.fanoutMode } : {}),
      ...(params.chainStepRemaining !== undefined
        ? { chainStepRemaining: params.chainStepRemaining }
        : {}),
      ...(params.traceparent ? { traceparent: params.traceparent } : {}),
    });
  }

  return {
    enqueued: deliveryIds.length,
    delivered,
    deliveryIds,
  };
}
