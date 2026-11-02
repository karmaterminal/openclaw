import { expectDefined } from "@openclaw/normalization-core/expect";
import { expect, it, vi } from "vitest";
import {
  admitModelTurn,
  completionConfig,
} from "../../agents/bash-tools.lifecycle.test-support.js";
import { handleRetryLimitExhaustion } from "../../agents/embedded-agent-runner/run/retry-limit.js";
import { runEmbeddedAgent } from "../../agents/embedded-agent.js";
import { FailoverError } from "../../agents/failover-error.js";
import { PROVIDER_SCHEMA_REJECTION_USER_TEXT } from "../../agents/failover/assistant-request-failure-copy.js";
import { buildChannelInboundEventContext } from "../../channels/inbound-event/context.js";
import type { ChannelOutboundAdapter } from "../../channels/plugins/outbound.types.js";
import type { ChannelPlugin } from "../../channels/plugins/types.public.js";
import { setRuntimeConfigSnapshot } from "../../config/runtime-snapshot.js";
import { replaceSessionEntry } from "../../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { makeCronJob } from "../../cron/delivery.test-helpers.js";
import { TEST_SCHEDULED_OCCURRENCE } from "../../cron/scheduled-occurrence.test-support.js";
import { runCronSessionTurn } from "../../cron/session-run.js";
import { resetSystemEventsForTest } from "../../infra/system-events.js";
import {
  captureActivePluginRegistrySnapshot,
  restoreActivePluginRegistrySnapshot,
  setActivePluginRegistry,
} from "../../plugins/runtime.js";
import { drainGlobalSingletonLifecycleState } from "../../shared/global-singleton.js";
import { openOpenClawStateDatabase } from "../../state/openclaw-state-db.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { normalizeSessionDeliveryState } from "../../utils/delivery-context.shared.js";
import { dispatchInboundMessage } from "../dispatch.js";
import { setReplyPayloadMetadata, type ReplyPayload } from "../reply-payload.js";
import { createReplyDispatcher } from "./reply-dispatcher.js";
import { enqueueSessionEventForHost } from "./session-event-handoff.js";

// mock-isolation: Only model decisions are synthetic; controller, delivery and storage owners stay real.
vi.mock("../../agents/embedded-agent-runner/run.js", () => ({ runEmbeddedAgent: vi.fn() }));
const model = vi.mocked(runEmbeddedAgent);
const summary = "Room report ready.";
const request = "Check the synthetic room.";
await Promise.all([
  import("../dispatch.js"),
  import("./get-reply-from-config.runtime.js").then((runtime) =>
    runtime.prewarmConfigDrivenReplyRuntime(),
  ),
]);

const scope = { agentId: "main", sessionKey: "agent:main:discord:channel:room-1447" };
const route = { channel: "discord", to: "channel:1447", accountId: "default" };

// The assistant-failure owner throws the rendered schema-rejection copy as the message.
function schemaRejection() {
  return new FailoverError(PROVIDER_SCHEMA_REJECTION_USER_TEXT, {
    reason: "format",
    status: 400,
    provider: "mock-openai",
    model: "gpt-5.6-luna",
  });
}

async function withRoomSession(
  signal: AbortSignal,
  run: (sendText: ReturnType<typeof vi.fn>, cfg: OpenClawConfig) => Promise<void>,
) {
  await withOpenClawTestState(
    { label: "scheduled-room-failure", env: { OPENCLAW_TEST_FAST: "0" } },
    async (state) => {
      const cfg = completionConfig(state.workspaceDir);
      setRuntimeConfigSnapshot(cfg);
      await state.writeConfig(cfg);
      openOpenClawStateDatabase();
      const registry = captureActivePluginRegistrySnapshot();
      const current = expectDefined(registry.activeRegistry, "active plugin registry");
      const sendText = vi
        .fn<NonNullable<ChannelOutboundAdapter["sendText"]>>()
        .mockResolvedValue({ channel: "discord", messageId: "room-message" });
      const channels = createTestRegistry([
        {
          pluginId: "discord",
          source: "test",
          plugin: {
            ...createChannelTestPluginBase({ id: "discord" }),
            messaging: {
              normalizeTarget: (raw) => raw,
              targetResolver: { looksLikeId: (raw) => raw === route.to },
            },
            outbound: { deliveryMode: "direct", sendText },
          } satisfies ChannelPlugin,
        },
      ]);
      setActivePluginRegistry({
        ...current,
        channels: [
          ...current.channels.filter((entry) => entry.plugin.id !== "discord"),
          ...channels.channels,
        ],
        channelSetups: [
          ...current.channelSetups.filter((entry) => entry.plugin.id !== "discord"),
          ...channels.channelSetups,
        ],
      });
      await replaceSessionEntry(scope, {
        sessionId: "room-session",
        lifecycleRevision: "original",
        permissionMode: "full",
        chatType: "channel",
        delivery: normalizeSessionDeliveryState({ context: route }),
        updatedAt: Date.now(),
      });
      try {
        await run(sendText, cfg);
      } finally {
        signal.throwIfAborted();
        await drainGlobalSingletonLifecycleState("restart");
        resetSystemEventsForTest();
        restoreActivePluginRegistrySnapshot(registry);
      }
    },
  );
}

function runScheduledRoomTurn(cfg: OpenClawConfig, signal: AbortSignal) {
  return runCronSessionTurn({
    occurrence: TEST_SCHEDULED_OCCURRENCE,
    ...scope,
    cfg,
    job: makeCronJob({
      id: "room-automation",
      sessionTarget: `session:${scope.sessionKey}`,
      delivery: { mode: "announce", ...route },
      payload: { kind: "agentTurn", message: request },
    }),
    text: request,
    admissionSource: "operator-schedule",
    deliveryAttemptFence: { beforeAttempt: async () => {}, assertCurrent() {} },
    abortSignal: signal,
    assertCurrent() {},
  });
}

it.for([{ failure: "thrown" }, { failure: "payload" }, { failure: "retry_limit" }] as const)(
  "records a scheduled room-session run failure ($failure) without a room message",
  async ({ failure }, { signal }) => {
    await withRoomSession(signal, async (sendText, cfg) => {
      model.mockReset().mockImplementation(async (params) => {
        await admitModelTurn(params);
        if (failure === "thrown") {
          throw schemaRejection();
        }
        if (failure === "retry_limit") {
          return handleRetryLimitExhaustion({
            message: "internal retry diagnostic",
            decision: { action: "return_error_payload" },
            provider: "mock-openai",
            model: "gpt-5.6-luna",
            durationMs: 1,
            agentMeta: {
              sessionId: "room-session",
              provider: "mock-openai",
              model: "gpt-5.6-luna",
            },
          });
        }
        return {
          payloads: [
            setReplyPayloadMetadata(
              { text: PROVIDER_SCHEMA_REJECTION_USER_TEXT, isError: true },
              { terminalProviderError: true, providerFailure: { reason: "format" } },
            ),
          ],
          meta: {
            durationMs: 1,
            error: { kind: "retry_limit", message: PROVIDER_SCHEMA_REJECTION_USER_TEXT },
          },
        };
      });
      const outcome = await runScheduledRoomTurn(cfg, signal);
      expect(outcome).toMatchObject({
        status: "error",
        executionStarted: true,
        delivered: false,
        deliveryAttempted: false,
      });
      // Run history and diagnostics keep the failure that the room never hears.
      expect(outcome.error).toContain(
        failure === "retry_limit" ? "internal retry diagnostic" : "The AI service couldn",
      );
      expect(outcome.diagnostics?.entries).toContainEqual(
        expect.objectContaining({ severity: "error" }),
      );
      expect(sendText).not.toHaveBeenCalled();
    });
  },
);

it("delivers an intentional scheduled room result to its configured target", async ({ signal }) => {
  await withRoomSession(signal, async (sendText, cfg) => {
    model.mockReset().mockImplementation(async (params) => {
      await admitModelTurn(params);
      return { payloads: [{ text: summary }], meta: { durationMs: 1 } };
    });
    const outcome = await runScheduledRoomTurn(cfg, signal);
    expect(outcome).toMatchObject({ status: "ok", delivered: true });
    expect(sendText.mock.calls.map(([sent]) => sent.text)).toEqual([summary]);
  });
});

it("still answers an unscheduled room-session turn with its failure reply", async ({ signal }) => {
  await withRoomSession(signal, async (sendText) => {
    model.mockReset().mockImplementation(async (params) => {
      await admitModelTurn(params);
      throw schemaRejection();
    });
    const outcome = await enqueueSessionEventForHost(request, {
      ...scope,
      source: "session",
      deliveryContext: route,
      abortSignal: signal,
    }).settled;
    expect(outcome.status).not.toBe("completed");
    // Facet copy escapes markdown; the room still receives exactly one failure reply.
    expect(sendText.mock.calls.map(([sent]) => sent.text)).toEqual([
      expect.stringContaining("The AI service couldn"),
    ]);
  });
});

it("still answers a human room request with its failure reply", async ({ signal }) => {
  await withRoomSession(signal, async (_sendText, cfg) => {
    model.mockReset().mockImplementation(async (params) => {
      await admitModelTurn(params);
      throw schemaRejection();
    });
    const replies: ReplyPayload[] = [];
    const dispatcher = createReplyDispatcher({
      deliver: async (payload) => {
        replies.push(payload);
      },
    });
    try {
      await dispatchInboundMessage({
        ctx: buildChannelInboundEventContext({
          ...route,
          messageId: "human-1447",
          from: "synthetic-human",
          sender: { id: "synthetic-human" },
          conversation: { kind: "channel", id: "1447" },
          route: { agentId: "main", accountId: "default", routeSessionKey: scope.sessionKey },
          reply: { to: route.to },
          message: { rawBody: request },
          extra: { WasMentioned: true },
        }),
        cfg,
        dispatcher,
      });
    } finally {
      dispatcher.markComplete();
      await dispatcher.waitForIdle();
    }
    expect(model).toHaveBeenCalledOnce();
    expect(replies).toEqual([
      expect.objectContaining({
        isError: true,
        text: expect.stringContaining("The AI service couldn"),
      }),
    ]);
  });
});
