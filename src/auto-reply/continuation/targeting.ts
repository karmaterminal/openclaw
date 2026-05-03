import { emitContinuationFanoutSpan } from "../../infra/continuation-tracer.js";
import { requestHeartbeatNow } from "../../infra/heartbeat-wake.js";
import {
  ackSessionDelivery,
  enqueueSessionDelivery,
} from "../../infra/session-delivery-queue-storage.js";
import type { SessionDeliveryContext } from "../../infra/session-delivery-queue-storage.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";

export const CONTINUATION_DELEGATE_FANOUT_MODES = ["tree", "all"] as const;

export type ContinuationDelegateFanoutMode = (typeof CONTINUATION_DELEGATE_FANOUT_MODES)[number];

export type ContinuationDelegateTargeting = {
  targetSessionKey?: string;
  targetSessionKeys?: readonly string[];
  fanoutMode?: ContinuationDelegateFanoutMode;
};

export function normalizeContinuationTargetKey(value?: string): string | undefined {
  return normalizeOptionalString(value);
}

export function normalizeContinuationTargetKeys(values?: readonly string[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const value of values ?? []) {
    const normalized = normalizeContinuationTargetKey(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    keys.push(normalized);
  }
  return keys;
}

export function hasContinuationDelegateTargeting(
  targeting: ContinuationDelegateTargeting,
): boolean {
  return Boolean(
    normalizeContinuationTargetKey(targeting.targetSessionKey) ||
    normalizeContinuationTargetKeys(targeting.targetSessionKeys).length > 0 ||
    targeting.fanoutMode,
  );
}

export function resolveContinuationReturnTargetSessionKeys(
  params: ContinuationDelegateTargeting & {
    defaultSessionKey: string;
    treeSessionKeys?: readonly string[];
    allSessionKeys?: readonly string[];
  },
): string[] {
  const defaultSessionKey = normalizeContinuationTargetKey(params.defaultSessionKey);
  const fallback = defaultSessionKey ? [defaultSessionKey] : [];

  if (params.fanoutMode === "tree") {
    const treeKeys = normalizeContinuationTargetKeys(params.treeSessionKeys);
    return treeKeys.length > 0 ? treeKeys : fallback;
  }

  if (params.fanoutMode === "all") {
    const allKeys = normalizeContinuationTargetKeys(params.allSessionKeys);
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
  ackSessionDelivery: typeof ackSessionDelivery;
  enqueueSystemEvent: typeof enqueueSystemEvent;
  requestHeartbeatNow: typeof requestHeartbeatNow;
};

const defaultContinuationReturnDeliveryDeps: ContinuationReturnDeliveryDeps = {
  enqueueSessionDelivery,
  ackSessionDelivery,
  enqueueSystemEvent,
  requestHeartbeatNow,
};

export async function enqueueContinuationReturnDeliveries(
  params: {
    targetSessionKeys: readonly string[];
    text: string;
    idempotencyKeyBase: string;
    deliveryContext?: SessionDeliveryContext;
    wakeRecipients?: boolean;
    childRunId?: string;
    stateDir?: string;
    traceparent?: string;
    fanoutMode?: ContinuationDelegateFanoutMode;
    chainStepRemaining?: number;
  },
  deps: ContinuationReturnDeliveryDeps = defaultContinuationReturnDeliveryDeps,
): Promise<{ enqueued: number; delivered: number; deliveryIds: string[] }> {
  const targetSessionKeys = normalizeContinuationTargetKeys(params.targetSessionKeys);
  const deliveryIds: string[] = [];
  let delivered = 0;

  for (const [index, sessionKey] of targetSessionKeys.entries()) {
    const deliveryId = await deps.enqueueSessionDelivery(
      {
        kind: "systemEvent",
        sessionKey,
        text: params.text,
        ...(params.deliveryContext ? { deliveryContext: params.deliveryContext } : {}),
        ...(params.traceparent ? { traceparent: params.traceparent } : {}),
        idempotencyKey: `${params.idempotencyKeyBase}:${index}:${sessionKey}`,
      },
      params.stateDir,
    );
    deliveryIds.push(deliveryId);

    deps.enqueueSystemEvent(params.text, {
      sessionKey,
      ...(params.deliveryContext ? { deliveryContext: params.deliveryContext } : {}),
      ...(params.traceparent ? { traceparent: params.traceparent } : {}),
    });
    if (params.wakeRecipients) {
      deps.requestHeartbeatNow({
        sessionKey,
        reason: "delegate-return",
        parentRunId: params.childRunId,
      });
    }
    await deps.ackSessionDelivery(deliveryId, params.stateDir);
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
