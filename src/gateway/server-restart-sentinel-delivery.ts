import type { RuntimeContextFragment } from "../agents/internal-runtime-context.js";
import { resolveCorrelatedSubagentDelivery } from "../agents/subagents/completion/subagent-completion-delivery.js";
import { finalizeInboundContext } from "../auto-reply/reply/inbound-context.js";
import { deliverQueuedPostCompactionDelegate } from "../auto-reply/reply/post-compaction-delegate-delivery.js";
import { dispatchReplyWithBufferedBlockDispatcherCore } from "../auto-reply/reply/provider-dispatcher.js";
import { recordInboundSession } from "../channels/session.js";
import { dispatchAssembledChannelTurn } from "../channels/turn/lifecycle.js";
import type { CliDeps } from "../cli/deps.types.js";
import { isSessionRecipientAuthorityCurrent } from "../config/sessions/session-accessor.js";
import type { SessionRecipientAuthority } from "../config/sessions/session-recipient-authority-types.js";
import { toErrorObject } from "../infra/errors.js";
import { requestHeartbeat } from "../infra/heartbeat-wake.js";
import {
  markSessionDeliveryAttemptStarted,
  markSessionDeliverySettlement,
  SessionDeliveryDeadLetteredError,
  SessionDeliveryDeferredError,
  SessionDeliverySafeRetryError,
  type QueuedSessionDelivery,
} from "../infra/session-delivery-queue-storage.js";
import { withSystemEventOwner } from "../infra/system-event-ownership.js";
import {
  enqueueSystemEvent,
  hasQueuedSystemEventDelivery,
  removeSystemEvents,
} from "../infra/system-events.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { normalizeAgentId, parseAgentSessionKey } from "../routing/session-key.js";
import type { OpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.types.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../utils/message-channel.js";
import { deliverQueuedGeneratedMediaAgentTurn } from "./server-restart-sentinel-agent-delivery.js";
import {
  isRestartContinuationBusyPayload,
  resolveQueuedRestartContinuationMessageId,
  RESTART_CONTINUATION_BUSY_RETRY_ERROR,
} from "./server-restart-sentinel-continuation-intent.js";
import { loadSessionEntry } from "./session-utils.js";

const log = createSubsystemLogger("gateway/restart-sentinel");

type ResolvedQueuedSessionDelivery = QueuedSessionDelivery & {
  runtimeContextFragments?: RuntimeContextFragment[];
};

/**
 * - `queued`: the event is in the queue (newly admitted, or its durable row
 *   already rides a queued copy).
 * - `refused`: the queue is full and nothing was queued. The caller must keep
 *   the durable row pending for a retry and must not report success.
 * - `stale-authority`: recipient authority changed; the event was withdrawn.
 */
type RestartSentinelWakeOutcome = "queued" | "refused" | "stale-authority";

/** The row stays pending and the delivery scheduler retries it without charging its retry budget. */
function deferRefusedRestartSentinelWake(params: { sessionKey: string; queueId: string }): never {
  log.warn("session event delivery deferred: system event queue is full", params);
  throw new SessionDeliveryDeferredError("system event queue is full; retrying the durable row");
}

function enqueueRestartSentinelWake(params: {
  /** Durable queue row id; keys the wake so recovered work keeps its turn budget. */
  entryId: string;
  message: string;
  sessionKey: string;
  agentId: string;
  deliveryContext?: {
    channel?: string;
    to?: string;
    accountId?: string;
    threadId?: string | number;
  };
  traceparent?: string;
  sessionDeliveryAckId?: string;
  sessionDeliveryAckStateDir?: string;
  recipientAuthority?: SessionRecipientAuthority;
  awaitsTurnAdoption?: boolean;
  isRecipientAuthorityCurrent?: () => boolean;
}): RestartSentinelWakeOutcome {
  const eventOptions = {
    sessionKey: params.sessionKey,
    // Recovered work keeps its ordinary turn budget when delivered by heartbeat.
    contextKey: `task:restart-sentinel:${params.entryId}`,
    trusted: true,
    // The durable row owns this contract; a replayed event must carry it too, or
    // the re-created in-memory copy would be acked at prompt preparation.
    ...(params.awaitsTurnAdoption ? { sessionDeliveryAwaitsTurnAdoption: true } : {}),
    ...(params.deliveryContext ? { deliveryContext: params.deliveryContext } : {}),
    ...(params.traceparent ? { traceparent: params.traceparent } : {}),
    ...(params.sessionDeliveryAckId ? { sessionDeliveryAckId: params.sessionDeliveryAckId } : {}),
    ...(params.sessionDeliveryAckStateDir
      ? { sessionDeliveryAckStateDir: params.sessionDeliveryAckStateDir }
      : {}),
    ...(params.recipientAuthority ? { recipientAuthority: params.recipientAuthority } : {}),
  };
  const ownedOptions = withSystemEventOwner(eventOptions, params.agentId);
  const admitted = enqueueSystemEvent(params.message, ownedOptions);
  if (params.recipientAuthority && params.isRecipientAuthorityCurrent?.() !== true) {
    removeSystemEvents(
      params.sessionKey,
      (event) =>
        event.sessionDeliveryAckId === params.sessionDeliveryAckId &&
        event.sessionDeliveryAckStateDir === params.sessionDeliveryAckStateDir,
    );
    return "stale-authority";
  }
  if (!admitted) {
    // `false` is either a capacity refusal or a de-duplicated re-enqueue of a
    // row that already rides a queued event (whose producer already woke the
    // session). Only the latter is delivered; neither needs another wake.
    return hasQueuedSystemEventDelivery(ownedOptions) ? "queued" : "refused";
  }
  requestHeartbeat({
    source: "restart-sentinel",
    intent: "immediate",
    reason: "wake",
    agentId: params.agentId,
    sessionKey: params.sessionKey,
  });
  return "queued";
}

function resolveQueuedSessionDeliveryContext(entry: QueuedSessionDelivery):
  | {
      channel?: string;
      to?: string;
      accountId?: string;
      threadId?: string | number;
    }
  | undefined {
  if (entry.kind === "agentTurn" && entry.route) {
    return {
      channel: entry.route.channel,
      to: entry.route.to,
      ...(entry.route.accountId ? { accountId: entry.route.accountId } : {}),
      ...(entry.route.threadId ? { threadId: entry.route.threadId } : {}),
    };
  }
  return entry.deliveryContext;
}

export async function deliverQueuedSessionDeliveryCore(params: {
  deps: CliDeps;
  entry: QueuedSessionDelivery;
  queueContext: OpenClawStateWorkerContext;
  resolveGatewayContext?: import("./server-methods/types.js").GatewayContextResolver;
}) {
  return await deliverResolvedQueuedSessionDelivery({
    ...params,
    entry: resolveCorrelatedSubagentDelivery(params.entry),
  });
}

async function deliverResolvedQueuedSessionDelivery(params: {
  deps: CliDeps;
  entry: ResolvedQueuedSessionDelivery;
  queueContext: OpenClawStateWorkerContext;
  resolveGatewayContext?: import("./server-methods/types.js").GatewayContextResolver;
}) {
  params.queueContext.admission.assertCurrent();
  const stateDir = params.queueContext.environment.OPENCLAW_STATE_DIR;
  if (params.entry.kind === "postCompactionDelegate") {
    await deliverQueuedPostCompactionDelegate({
      entry: params.entry,
      queueContext: params.queueContext,
    });
    return;
  }
  const isContinuationReturn =
    params.entry.kind === "systemEvent" &&
    params.entry.idempotencyKey?.startsWith("continuation-return:");
  const recipientAgentId =
    params.entry.kind === "systemEvent" ? params.entry.agentId?.trim() : undefined;
  if (isContinuationReturn && !recipientAgentId) {
    throw new SessionDeliveryDeadLetteredError(
      "continuation return recipient owner is unavailable",
    );
  }
  const explicitTargetAgentId = parseAgentSessionKey(params.entry.sessionKey)?.agentId;
  if (
    recipientAgentId &&
    explicitTargetAgentId &&
    normalizeAgentId(explicitTargetAgentId) !== normalizeAgentId(recipientAgentId)
  ) {
    throw new SessionDeliveryDeadLetteredError(
      "continuation return recipient owner mismatches its target",
    );
  }
  const { cfg, agentId, entry, storePath, canonicalKey } = loadSessionEntry(
    params.entry.sessionKey,
    {
      env: params.queueContext.environment,
      ...(recipientAgentId ? { agentId: recipientAgentId } : {}),
    },
  );
  if (
    isContinuationReturn &&
    (normalizeAgentId(agentId) !== normalizeAgentId(recipientAgentId) ||
      (!explicitTargetAgentId && !entry))
  ) {
    throw new SessionDeliveryDeadLetteredError(
      "continuation return recipient owner is no longer authoritative",
    );
  }
  const queuedDeliveryContext = resolveQueuedSessionDeliveryContext(params.entry);

  if (params.entry.kind === "systemEvent") {
    const recipientAuthority = params.entry.recipientAuthority;
    const recipientAuthorityCurrent = () =>
      !recipientAuthority ||
      isSessionRecipientAuthorityCurrent(
        { agentId, sessionKey: canonicalKey, storePath },
        recipientAuthority,
      );
    if (!recipientAuthorityCurrent()) {
      log.warn("session event delivery skipped: recipient authority changed", {
        sessionKey: canonicalKey,
        queueId: params.entry.id,
      });
      return;
    }
    // A continuation return settles only on prompt adoption, whether or not it
    // carries recipient authority; rows written before that rule replay the same way.
    const awaitsTurnAdoption = params.entry.awaitPromptAdoption === true || isContinuationReturn;
    const replayed = enqueueRestartSentinelWake({
      entryId: params.entry.id,
      message: params.entry.text,
      sessionKey: canonicalKey,
      agentId: params.entry.agentId ?? agentId,
      deliveryContext: queuedDeliveryContext,
      traceparent: params.entry.traceparent,
      sessionDeliveryAckId: params.entry.id,
      sessionDeliveryAckStateDir: stateDir,
      recipientAuthority,
      awaitsTurnAdoption,
      isRecipientAuthorityCurrent: recipientAuthorityCurrent,
    });
    if (replayed === "refused") {
      deferRefusedRestartSentinelWake({ sessionKey: canonicalKey, queueId: params.entry.id });
    }
    if (replayed === "stale-authority") {
      log.warn("session event delivery wake skipped: recipient authority changed", {
        sessionKey: canonicalKey,
        queueId: params.entry.id,
      });
      return;
    }
    if (awaitsTurnAdoption) {
      // The in-memory queue is not durable, so completing the row here would
      // drop the notice if the process
      // died before the prompt consumed it. The prompt-drain path acks the row
      // via the event's sessionDeliveryAckId once it is actually adopted.
      throw new SessionDeliveryDeferredError("system event is awaiting durable prompt adoption");
    }
    return;
  }

  if (
    params.entry.expectedSessionId &&
    (!entry?.sessionId || entry.sessionId !== params.entry.expectedSessionId)
  ) {
    log.warn("restart continuation skipped: session changed", {
      sessionKey: canonicalKey,
      queueId: params.entry.id,
      expectedSessionId: params.entry.expectedSessionId,
      actualSessionId: entry?.sessionId ?? null,
    });
    const replayed = enqueueRestartSentinelWake({
      entryId: params.entry.id,
      message: params.entry.message,
      sessionKey: canonicalKey,
      agentId,
      deliveryContext: queuedDeliveryContext,
      traceparent: params.entry.traceparent,
      sessionDeliveryAckId: params.entry.id,
      sessionDeliveryAckStateDir: stateDir,
    });
    if (replayed === "refused") {
      deferRefusedRestartSentinelWake({ sessionKey: canonicalKey, queueId: params.entry.id });
    }
    return;
  }

  if (!params.entry.route) {
    const replayed = enqueueRestartSentinelWake({
      entryId: params.entry.id,
      message: params.entry.message,
      sessionKey: canonicalKey,
      agentId,
      deliveryContext: queuedDeliveryContext,
      traceparent: params.entry.traceparent,
      sessionDeliveryAckId: params.entry.id,
      sessionDeliveryAckStateDir: stateDir,
    });
    if (replayed === "refused") {
      deferRefusedRestartSentinelWake({ sessionKey: canonicalKey, queueId: params.entry.id });
    }
    return;
  }

  if (
    await deliverQueuedGeneratedMediaAgentTurn({
      entry: params.entry,
      runtimeContextFragments: params.entry.runtimeContextFragments,
      canonicalKey,
      agentId,
      storePath,
      sessionEntry: entry,
      queueContext: params.queueContext,
      ...(params.resolveGatewayContext
        ? { resolveGatewayContext: params.resolveGatewayContext }
        : {}),
    })
  ) {
    return;
  }
  if (params.entry.deliveryStartedAt !== undefined) {
    await markSessionDeliverySettlement(params.entry, "moved-to-failed", params.queueContext);
    throw new SessionDeliveryDeadLetteredError(
      "queued agent turn dead-lettered after an interrupted unproven attempt",
    );
  }

  const route = params.entry.route;
  const messageId = resolveQueuedRestartContinuationMessageId(params.entry);
  const userMessage = params.entry.message.trim();
  let dispatchError: unknown;
  const ctxPayload = finalizeInboundContext(
    {
      // The per-message timestamp prefix is applied at the single LLM boundary
      // (normalizeMessagesForLlmBoundary) from each message's own timestamp, so
      // the current turn and historical turns carry identical bytes on the wire.
      // See: https://github.com/openclaw/openclaw/issues/3658
      Body: userMessage,
      BodyForAgent: userMessage,
      BodyForCommands: "",
      RawBody: userMessage,
      CommandBody: "",
      SessionKey: canonicalKey,
      AccountId: route.accountId,
      MessageSid: messageId,
      Timestamp: Date.now(),
      InputProvenance: {
        kind: "internal_system",
        sourceChannel: route.channel,
        sourceTool: "restart-sentinel",
      },
      Provider: INTERNAL_MESSAGE_CHANNEL,
      Surface: INTERNAL_MESSAGE_CHANNEL,
      ChatType: route.chatType,
      CommandAuthorized: true,
      GatewayClientScopes: ["operator.admin"],
      GatewayClientCaps: [],
      ReplyToId: route.replyToId,
      OriginatingChannel: route.channel,
      OriginatingTo: route.to,
      ExplicitDeliverRoute: false,
      MessageThreadId: route.threadId,
    },
    {
      forceBodyForCommands: true,
      forceChatType: true,
    },
  );
  await dispatchAssembledChannelTurn({
    cfg,
    channel: route.channel,
    accountId: route.accountId,
    agentId,
    routeSessionKey: canonicalKey,
    storePath,
    ctxPayload,
    recordInboundSession,
    dispatchReplyWithBufferedBlockDispatcher: dispatchReplyWithBufferedBlockDispatcherCore,
    replyOptions: {
      sourceReplyDeliveryMode: "message_tool_only",
    },
    // Preflight remains retryable. Ownership starts only after the agent runner
    // has durably adopted the turn and before it can execute tools or reply.
    turnAdoptionLifecycle: {
      admission: "cancel-only",
      onAdopted: async () => {
        await markSessionDeliveryAttemptStarted(params.entry, params.queueContext);
        params.queueContext.admission.assertCurrent();
      },
    },
    delivery: {
      preparePayload: (payload) => {
        if (isRestartContinuationBusyPayload(payload)) {
          throw new SessionDeliverySafeRetryError(RESTART_CONTINUATION_BUSY_RETRY_ERROR);
        }
        return payload;
      },
      durable: false,
      // Restart continuations are internal lifecycle turns. Visible follow-up
      // must go through the message tool; automatic final delivery stays off.
      deliver: async () => ({ visibleReplySent: false }),
      onError: (err, info) => {
        dispatchError ??= err;
        log.warn(`restart continuation dispatch failed during ${info.kind}: ${String(err)}`, {
          sessionKey: canonicalKey,
        });
      },
    },
    record: {
      onRecordError: (err) => {
        log.warn(`restart continuation failed to record inbound session metadata: ${String(err)}`, {
          sessionKey: canonicalKey,
        });
      },
    },
  });
  if (dispatchError) {
    throw toErrorObject(dispatchError, "Non-Error thrown");
  }
}
