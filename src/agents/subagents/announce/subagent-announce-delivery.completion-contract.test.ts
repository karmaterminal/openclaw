// Completion-delivery contract cases for continuation trigger/trace forwarding and
// typed no-visible-result gating (split from subagent-announce-delivery.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateAgentParams } from "../../../../packages/gateway-protocol/src/index.js";
import { formatValidationErrors } from "../../../../packages/gateway-protocol/src/validation-errors.js";
import type { SessionEntry } from "../../../config/sessions.js";
import type { callGateway as runtimeCallGateway } from "../../../gateway/call.js";
import { sendMessage as runtimeSendMessage } from "../../../infra/outbound/message.js";
import { setActivePluginRegistry } from "../../../plugins/runtime.js";
import { captureOpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.types.js";
import { createTestRegistry } from "../../../test-utils/channel-plugins.js";
import type {
  EmbeddedAgentQueueMessageOptions,
  EmbeddedAgentQueueMessageOutcome,
} from "../../embedded-agent-runner/runs.js";
import type { AgentInternalEvent } from "../../internal-events.js";
import {
  expectDeliveryPath,
  expectRecordFields,
  mockCallArg,
  musicCompletionEvents,
  taskCompletionEvents,
} from "../../subagent-test-fixtures.test-helpers.js";
import { testing, deliverSubagentAnnouncement } from "./subagent-announce-delivery.test-support.js";

const sessionDeliveryQueueMocks = vi.hoisted(() => ({
  enqueueClaimedSessionDelivery: vi.fn(
    (_payload: unknown, _leaseMs: number, _queueContext: OpenClawStateWorkerContext) => ({
      id: "session-delivery-media",
      claimed: true,
      status: "pending" as "pending" | "failed" | "completed" | "unknown",
    }),
  ),
  releaseSessionDeliveryClaim: vi.fn(async () => {}),
  scheduleSessionDelivery: vi.fn(async () => true),
}));

let fixtureQueueContext: OpenClawStateWorkerContext;

beforeEach(() => {
  fixtureQueueContext = captureOpenClawStateWorkerContext();
});

function expectQueueContext() {
  const queuedContext =
    sessionDeliveryQueueMocks.enqueueClaimedSessionDelivery.mock.calls.at(-1)?.[2];
  if (!queuedContext) {
    throw new Error("Expected the durable handoff to capture its queue context");
  }
  return expect.objectContaining({
    environment: fixtureQueueContext.environment,
    admission: expect.objectContaining({
      databasePath: fixtureQueueContext.admission.databasePath,
      identity: queuedContext.admission.identity,
    }),
  });
}

vi.mock("../completion/subagent-completion-delivery.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../completion/subagent-completion-delivery.js")>()),
  admitCorrelatedSubagentSessionDelivery: (params: { payload: Record<string, unknown> }) =>
    sessionDeliveryQueueMocks.enqueueClaimedSessionDelivery(
      params.payload,
      125_000,
      captureOpenClawStateWorkerContext(),
    ),
}));

vi.mock("../../../infra/session-delivery-queue-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../infra/session-delivery-queue-storage.js")>()),
  enqueueClaimedSessionDelivery: async (
    ...args: Parameters<typeof sessionDeliveryQueueMocks.enqueueClaimedSessionDelivery>
  ) => sessionDeliveryQueueMocks.enqueueClaimedSessionDelivery(...args),
  releaseSessionDeliveryClaim: sessionDeliveryQueueMocks.releaseSessionDeliveryClaim,
}));

vi.mock("../../../infra/session-delivery-queue-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../infra/session-delivery-queue-runtime.js")>()),
  scheduleSessionDelivery: sessionDeliveryQueueMocks.scheduleSessionDelivery,
}));

afterEach(() => {
  vi.useRealTimers();
  setActivePluginRegistry(createTestRegistry());
  testing.setDepsForTest();
  sessionDeliveryQueueMocks.enqueueClaimedSessionDelivery.mockClear();
  sessionDeliveryQueueMocks.releaseSessionDeliveryClaim.mockClear();
  sessionDeliveryQueueMocks.scheduleSessionDelivery.mockClear();
});

const sentDeliveryStatus = { status: "sent", resultCount: 1 } as const;

function createGatewayMock(response: Record<string, unknown> = {}, onCall?: () => void) {
  return vi.fn(async (opts: Parameters<typeof runtimeCallGateway>[0]) => {
    onCall?.();
    opts.onAccepted?.({ status: "accepted" });
    return response;
  }) as unknown as typeof runtimeCallGateway;
}

function createPayloadGatewayMock(...payloads: Record<string, unknown>[]) {
  return createGatewayMock({
    result: { payloads, ...(payloads.length > 0 ? { deliveryStatus: sentDeliveryStatus } : {}) },
  });
}

function createSendMessageMock() {
  return vi.fn(async () => ({
    channel: "slack",
    to: "channel:C123",
    via: "direct" as const,
    mediaUrl: null,
    result: { messageId: "msg-1" },
  })) as unknown as typeof runtimeSendMessage;
}

type QueueEmbeddedAgentMessageWithOutcome = (
  sessionId: string,
  message: string,
  options?: EmbeddedAgentQueueMessageOptions,
) => EmbeddedAgentQueueMessageOutcome | Promise<EmbeddedAgentQueueMessageOutcome>;

function createQueueOutcomeMock(
  queued: boolean,
): ReturnType<typeof vi.fn<QueueEmbeddedAgentMessageWithOutcome>> {
  return vi.fn((sessionId: string) =>
    queued
      ? {
          queued: true,
          sessionId,
          target: "embedded_run",
          gatewayHealth: "live",
          enqueuedAtMs: 4_100,
          deliveredAtMs: 4_200,
        }
      : {
          queued: false,
          sessionId,
          reason: "not_streaming",
          gatewayHealth: "live",
        },
  );
}

function expectGatewayAgentParams(
  callGateway: typeof runtimeCallGateway,
  expected: Record<string, unknown>,
) {
  const request = expectRecordFields(mockCallArg(callGateway), { method: "agent" });
  return expectRecordFields(request.params, expected);
}

async function deliverDiscordDirectMessageCompletion(params: {
  callGateway: typeof runtimeCallGateway;
  sendMessage?: typeof runtimeSendMessage;
  completionTarget?: "parent";
  currentRequesterSessionId?: string | null;
  internalEvents?: AgentInternalEvent[];
  isActive?: boolean;
  requesterSessionKey?: string;
  requesterAgentId?: string;
  requesterIsSubagent?: boolean;
  origin?: Parameters<typeof deliverSubagentAnnouncement>[0]["requesterSessionOrigin"];
  completionDirectOrigin?: Parameters<
    typeof deliverSubagentAnnouncement
  >[0]["completionDirectOrigin"];
  runtimeConfig?: Record<string, unknown>;
  queueEmbeddedAgentMessageWithOutcome?: QueueEmbeddedAgentMessageWithOutcome;
  sourceSessionKey?: string;
  sourceTool?: string;
  signal?: AbortSignal;
  continuationTriggerOverride?: "work-wake" | "delegate-return" | "subagent-return";
  traceparent?: string;
  onDeliveryResult?: Parameters<typeof deliverSubagentAnnouncement>[0]["onDeliveryResult"];
  isSourceSessionEffectsAllowed?: () => boolean;
}) {
  const origin = params.origin ?? {
    channel: "discord",
    to: "dm:U123",
    accountId: "acct-1",
  };
  const requesterSessionKey = params.requesterSessionKey ?? "agent:main:discord:dm:U123";
  testing.setDepsForTest({
    callGateway: params.callGateway,
    getRequesterSessionActivity: () => ({
      sessionId:
        params.currentRequesterSessionId === null
          ? undefined
          : (params.currentRequesterSessionId ?? "requester-session-dm"),
      isActive: params.isActive === true,
    }),
    getRuntimeConfig: () => (params.runtimeConfig ?? {}) as never,
    sendMessage: params.sendMessage ?? runtimeSendMessage,
    ...(params.queueEmbeddedAgentMessageWithOutcome
      ? { queueEmbeddedAgentMessageWithOutcome: params.queueEmbeddedAgentMessageWithOutcome }
      : {}),
  });

  return deliverSubagentAnnouncement({
    requesterSessionKey,
    requesterAgentId: params.requesterAgentId,
    targetRequesterSessionKey: requesterSessionKey,
    triggerMessage: "child done",
    requesterSessionOrigin: origin,
    completionDirectOrigin: params.completionDirectOrigin ?? origin,
    directOrigin: origin,
    requesterIsSubagent: params.requesterIsSubagent === true,
    expectsCompletionMessage: true,
    ...(params.completionTarget
      ? {
          completionTarget: params.completionTarget,
          completionRequesterSessionId: "requester-session-dm",
        }
      : {}),
    bestEffortDeliver: true,
    directIdempotencyKey: "announce-dm-fallback-empty",
    internalEvents: params.internalEvents,
    sourceRunId: "run-generated-media",
    sourceSessionKey: params.sourceSessionKey,
    sourceTool: params.sourceTool,
    signal: params.signal,
    continuationTriggerOverride: params.continuationTriggerOverride,
    traceparent: params.traceparent,
    onDeliveryResult: params.onDeliveryResult,
    isSourceSessionEffectsAllowed: params.isSourceSessionEffectsAllowed,
  });
}

async function deliverSlackChannelAnnouncement(params: {
  callGateway: typeof runtimeCallGateway;
  isActive?: boolean;
  sessionId?: string;
  expectsCompletionMessage?: boolean;
  directIdempotencyKey: string;
  requesterSessionKey?: string;
  requesterOrigin?: {
    channel?: string;
    to?: string;
    accountId?: string;
    threadId?: string | number;
  };
  completionDirectOrigin?: {
    channel?: string;
    to?: string;
    accountId?: string;
    threadId?: string | number;
  };
  queueEmbeddedAgentMessageWithOutcome?: QueueEmbeddedAgentMessageWithOutcome;
  sendMessage?: typeof runtimeSendMessage;
  internalEvents?: AgentInternalEvent[];
  sourceSessionKey?: string;
  sourceTool?: string;
  runtimeConfig?: Record<string, unknown>;
  requesterSessionEntry?: SessionEntry;
  isSourceSessionEffectsAllowed?: () => boolean;
}) {
  const origin = {
    channel: "slack",
    to: "channel:C123",
    accountId: "acct-1",
  } as const;
  testing.setDepsForTest({
    callGateway: params.callGateway,
    getRequesterSessionActivity: () => ({
      sessionId: params.sessionId ?? "requester-session-channel",
      isActive: params.isActive === true,
    }),
    getRuntimeConfig: () => (params.runtimeConfig ?? {}) as never,
    ...(params.requesterSessionEntry
      ? {
          loadRequesterSessionEntry: (sessionKey: string) => ({
            cfg: (params.runtimeConfig ?? {}) as never,
            entry: params.requesterSessionEntry,
            canonicalKey: sessionKey,
          }),
        }
      : {}),
    sendMessage: params.sendMessage ?? runtimeSendMessage,
    ...(params.queueEmbeddedAgentMessageWithOutcome
      ? { queueEmbeddedAgentMessageWithOutcome: params.queueEmbeddedAgentMessageWithOutcome }
      : {}),
  });

  return deliverSubagentAnnouncement({
    requesterSessionKey: params.requesterSessionKey ?? "agent:main:slack:channel:C123",
    targetRequesterSessionKey: params.requesterSessionKey ?? "agent:main:slack:channel:C123",
    triggerMessage: "child done",
    requesterSessionOrigin: params.requesterOrigin ?? origin,
    completionDirectOrigin: params.completionDirectOrigin ?? params.requesterOrigin ?? origin,
    directOrigin: params.requesterOrigin ?? origin,
    requesterIsSubagent: false,
    expectsCompletionMessage: params.expectsCompletionMessage !== false,
    bestEffortDeliver: true,
    directIdempotencyKey: params.directIdempotencyKey,
    internalEvents: params.internalEvents,
    sourceRunId: "run-generated-media",
    sourceSessionKey: params.sourceSessionKey,
    sourceTool: params.sourceTool,
    isSourceSessionEffectsAllowed: params.isSourceSessionEffectsAllowed,
  });
}

describe("deliverSubagentAnnouncement completion delivery", () => {
  it("keeps synthetic missing output on the generic retry path", async () => {
    const callGateway = createPayloadGatewayMock();
    const sendMessage = createSendMessageMock();
    const queueEmbeddedAgentMessageWithOutcome = createQueueOutcomeMock(false);
    const childSessionKey = "agent:worker:subagent:empty-success";
    const result = await deliverDiscordDirectMessageCompletion({
      callGateway,
      sendMessage,
      isActive: true,
      queueEmbeddedAgentMessageWithOutcome,
      sourceSessionKey: childSessionKey,
      internalEvents: taskCompletionEvents({
        childSessionKey,
        childSessionId: "child-session-id",
        status: "ok",
        statusLabel: "completed successfully",
        result: "(no output)",
        noVisibleResult: true,
      }),
    });

    expectRecordFields(result, {
      delivered: false,
      path: "direct",
      error: "completion agent did not produce a visible reply",
      reason: "visible_reply_missing",
      phases: [
        {
          phase: "direct-primary",
          delivered: false,
          path: "direct",
          reason: "visible_reply_missing",
          error: "completion agent did not produce a visible reply",
        },
        {
          phase: "steer-fallback",
          delivered: false,
          path: "none",
          reason: "steer_dropped",
          error: undefined,
        },
      ],
    });
    expect(result.terminal).toBeUndefined();
    expect(queueEmbeddedAgentMessageWithOutcome).toHaveBeenCalledTimes(2);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("preserves continuation trigger and trace on the direct completion path", async () => {
    const traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    const callGateway = createGatewayMock({
      result: { payloads: [{ text: "The track is ready." }] },
    });
    const sendMessage = createSendMessageMock();

    await deliverDiscordDirectMessageCompletion({
      callGateway,
      sendMessage,
      continuationTriggerOverride: "delegate-return",
      traceparent,
      internalEvents: taskCompletionEvents({
        childSessionId: "task-continuation",
        taskLabel: "continuation track",
      }),
    });

    expectGatewayAgentParams(callGateway, {
      continuationTrigger: "delegate-return",
      traceparent,
    });
  });

  it("persists continuation trigger and trusted trace for generated media", async () => {
    const traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    const callGateway = createGatewayMock();

    const result = await deliverDiscordDirectMessageCompletion({
      callGateway,
      sourceTool: "music_generate",
      continuationTriggerOverride: "delegate-return",
      traceparent,
      internalEvents: musicCompletionEvents(),
    });

    expectDeliveryPath(result, "queued");
    expect(sessionDeliveryQueueMocks.enqueueClaimedSessionDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "agentTurn",
        continuationTrigger: "delegate-return",
        traceparent,
        traceparentProvenance: "internal",
      }),
      expect.any(Number),
      expectQueueContext(),
    );
    expect(callGateway).not.toHaveBeenCalled();
  });

  // These inputs differ only in the typed no-visible-result fact. Keep the
  // authority boundary on the fact rather than the placeholder wording.
  it("gates a reworded no-visible-result placeholder for channel completions", async () => {
    const callGateway = createPayloadGatewayMock({ text: "NO_REPLY" });
    const childSessionKey = "agent:worker:subagent:reworded-placeholder";
    const result = await deliverSlackChannelAnnouncement({
      callGateway,
      directIdempotencyKey: "announce-channel-subagent-reworded-placeholder",
      sourceTool: "subagent_announce",
      sourceSessionKey: childSessionKey,
      runtimeConfig: { messages: { groupChat: { visibleReplies: "automatic" } } },
      internalEvents: taskCompletionEvents({
        childSessionKey,
        childSessionId: "child-session-id",
        taskLabel: "reworded placeholder completion smoke",
        status: "ok",
        statusLabel: "completed successfully",
        result: "(no result yet; child still running)",
        noVisibleResult: true,
      }),
    });

    expectRecordFields(result, {
      delivered: false,
      path: "direct",
      reason: "visible_reply_missing",
      error: "completion agent did not produce a visible reply",
    });
  });

  it("does not gate visible output that only resembles the placeholder", async () => {
    const callGateway = createPayloadGatewayMock({ text: "NO_REPLY" });
    const childSessionKey = "agent:worker:subagent:placeholder-shaped-output";
    const result = await deliverSlackChannelAnnouncement({
      callGateway,
      directIdempotencyKey: "announce-channel-subagent-placeholder-shaped-output",
      sourceTool: "subagent_announce",
      sourceSessionKey: childSessionKey,
      runtimeConfig: { messages: { groupChat: { visibleReplies: "automatic" } } },
      internalEvents: taskCompletionEvents({
        childSessionKey,
        childSessionId: "child-session-id",
        taskLabel: "placeholder-shaped output completion smoke",
        status: "ok",
        statusLabel: "completed successfully",
        result: "(no output)",
      }),
    });

    expectDeliveryPath(result, "direct");
  });

  it("sends no-output completion params accepted by the Gateway validator", async () => {
    const callGateway = createPayloadGatewayMock({ text: "NO_REPLY" });
    const childSessionKey = "agent:worker:subagent:no-output-wire-contract";
    await deliverSlackChannelAnnouncement({
      callGateway,
      directIdempotencyKey: "announce-channel-no-output-wire-contract",
      sourceTool: "subagent_announce",
      sourceSessionKey: childSessionKey,
      internalEvents: taskCompletionEvents({
        childSessionKey,
        childSessionId: "child-session-id",
        taskLabel: "no-output completion wire contract",
        result: "(no output)",
        noVisibleResult: true,
      }),
    });

    const request = expectRecordFields(mockCallArg(callGateway), { method: "agent" });
    const sentEvents = (request.params as { internalEvents?: Array<{ noVisibleResult?: boolean }> })
      .internalEvents;
    expect(sentEvents?.[0]?.noVisibleResult).toBe(true);
    const isValid = validateAgentParams(request.params);
    expect(isValid ? "" : formatValidationErrors(validateAgentParams.errors)).toBe("");
  });
});
