// Frond (karmaterminal, #1415): a scheduled turn in a room session reads that room's history as
// the room's own turns mark it, so a heartbeat no longer re-answers a message they handled.
import { afterEach, expect, it, vi } from "vitest";
import { admitModelTurn, completionConfig } from "../agents/bash-tools.lifecycle.test-support.js";
import { runEmbeddedAgent } from "../agents/embedded-agent.js";
import type { HistoryEntry } from "../auto-reply/reply/history.types.js";
import type { ChannelOutboundAdapter } from "../channels/plugins/outbound.types.js";
import type { ChannelPlugin } from "../channels/plugins/types.public.js";
import { setRuntimeConfigSnapshot } from "../config/runtime-snapshot.js";
import {
  persistSessionTranscriptTurn,
  replaceSessionEntry,
} from "../config/sessions/session-accessor.js";
import { readRecentUserAssistantTextForSession } from "../config/sessions/transcript.js";
import {
  captureActivePluginRegistrySnapshot,
  restoreActivePluginRegistrySnapshot,
  setActivePluginRegistry,
} from "../plugins/runtime.js";
import { createChannelTestPluginBase, createTestRegistry } from "../test-utils/channel-plugins.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { normalizeSessionDeliveryState } from "../utils/delivery-context.shared.js";
import { makeCronJob } from "./delivery.test-helpers.js";
import { TEST_SCHEDULED_OCCURRENCE } from "./scheduled-occurrence.test-support.js";
import { runCronSessionTurn } from "./session-run.js";

// mock-isolation: Only the model and the channel are synthetic; prompt preparation, admission
// and announce delivery stay real.
vi.mock("../agents/embedded-agent-runner/run.js", () => ({
  runEmbeddedAgent: vi.fn(),
}));
const runEmbeddedAgentMock = vi.mocked(runEmbeddedAgent);
await Promise.all([
  import("../auto-reply/dispatch.js"),
  import("../auto-reply/reply/get-reply-from-config.runtime.js").then((runtime) =>
    runtime.prewarmConfigDrivenReplyRuntime(),
  ),
]);

const roomKey = "agent:main:roomchat:channel:room";
const route = { channel: "roomchat", to: "channel:room", accountId: "default" };
const startedAt = Date.parse("2026-10-31T14:00:00.000Z");
type RoomMessage = { id: string; sender: string; body: string };
const breakfast: RoomMessage = { id: "1001", sender: "figs", body: "what's for breakfast?" };
const stuckDeploy: RoomMessage = { id: "1002", sender: "cael", body: "the deploy is stuck" };

afterEach(() => {
  runEmbeddedAgentMock.mockReset();
});

/**
 * Stands in for the model: answers each room message in its context unless some rendering of it
 * is marked already seen, relays a pending alert from its prompt, and otherwise acknowledges.
 * Unmarked room messages read as new, as they did before room-history watermarks.
 */
function scriptedReply(context: string): string {
  const lines = context.split("\n");
  const roomIds = new Set(
    lines.flatMap((line) => [...line.matchAll(/#(\d{4})\b/gu)].flatMap((match) => match[1] ?? [])),
  );
  const handled = (id: string) =>
    lines.some((line) => line.includes(`#${id}`) && line.includes("[already seen]"));
  const replies = [...roomIds].filter((id) => !handled(id)).map((id) => `Answering #${id}.`);
  const alert = /Pending alert: (.+)/u.exec(context)?.[1];
  if (alert) {
    replies.push(`ALERT: ${alert}`);
  }
  return replies.length > 0 ? replies.join("\n") : "HEARTBEAT_OK";
}

/**
 * Runs the room-session heartbeat after a room turn answered `breakfast`. The room serves its
 * history marked as its room turns left it: handled through `breakfast`, anything later new.
 */
async function runHeartbeat(params: { room: RoomMessage[]; prompt: string; readFails?: true }) {
  return await withOpenClawTestState({ label: "cron-room-history" }, async (state) => {
    const registry = captureActivePluginRegistrySnapshot();
    const cfg = completionConfig(state.workspaceDir);
    setRuntimeConfigSnapshot(cfg);
    await state.writeConfig(cfg);
    const sendText = vi.fn<NonNullable<ChannelOutboundAdapter["sendText"]>>(async () => ({
      channel: "roomchat",
      messageId: "announced",
    }));
    const readRoomHistory = vi.fn(async (): Promise<HistoryEntry[]> => {
      if (params.readFails) {
        throw new Error("room history unavailable");
      }
      return params.room.map((message) => ({
        messageId: message.id,
        sender: `${BigInt(message.id) <= BigInt(breakfast.id) ? "[already seen]" : "[new]"} ${message.sender}`,
        body: message.body,
        timestamp: startedAt + Number(message.id),
      }));
    });
    const contexts: string[] = [];
    runEmbeddedAgentMock.mockImplementation(async (runParams) => {
      const transcript = await readRecentUserAssistantTextForSession({
        agentId: "main",
        sessionKey: roomKey,
        limit: 20,
      });
      const context = [
        ...transcript.map((turn) => turn.text),
        runParams.currentInboundContext?.text ?? "",
        runParams.prompt,
      ].join("\n");
      contexts.push(context);
      await admitModelTurn(runParams);
      return { payloads: [{ text: scriptedReply(context) }], meta: { durationMs: 1 } };
    });
    try {
      const channels = createTestRegistry([
        {
          pluginId: "roomchat",
          source: "test",
          plugin: {
            ...createChannelTestPluginBase({ id: "roomchat" }),
            messaging: { normalizeTarget: (raw) => raw },
            outbound: { deliveryMode: "direct", sendText },
            heartbeat: { readRoomHistory },
          } satisfies ChannelPlugin,
        },
      ]);
      const current = registry.activeRegistry;
      setActivePluginRegistry({
        ...current!,
        channels: [...current!.channels, ...channels.channels],
        channelSetups: [...current!.channelSetups, ...channels.channelSetups],
      });
      const sessionId = "room-session";
      await replaceSessionEntry(
        { agentId: "main", sessionKey: roomKey },
        {
          sessionId,
          updatedAt: startedAt,
          sessionStartedAt: startedAt,
          chatType: "channel",
          delivery: normalizeSessionDeliveryState({ context: route }),
        },
      );
      // The room turn that already answered breakfast, as its transcript row records it.
      await persistSessionTranscriptTurn(
        { agentId: "main", sessionKey: roomKey, sessionId },
        {
          cwd: state.workspaceDir,
          updateMode: "none",
          messages: [
            {
              message: {
                role: "user",
                content: `#${breakfast.id} ${breakfast.sender}: ${breakfast.body}`,
                timestamp: startedAt + 1,
              },
              now: startedAt + 1,
            },
            {
              message: {
                role: "assistant",
                content: [{ type: "text", text: "Eggs and toast at eight." }],
                timestamp: startedAt + 2,
              },
              now: startedAt + 2,
            },
          ],
        },
      );
      const job = makeCronJob({
        id: "heartbeat-main",
        name: "heartbeat-main",
        agentId: "main",
        sessionTarget: `session:${roomKey}`,
        wakeMode: "now",
        payload: { kind: "agentTurn", message: params.prompt },
        delivery: { mode: "announce", channel: route.channel, to: route.to },
      });
      const result = await runCronSessionTurn({
        occurrence: TEST_SCHEDULED_OCCURRENCE,
        cfg,
        agentId: "main",
        sessionKey: roomKey,
        job,
        text: params.prompt,
        admissionSource: "operator-schedule",
        deliveryAttemptFence: null,
        assertCurrent() {},
      });
      return {
        result,
        contexts,
        readRoomHistory,
        announced: sendText.mock.calls.map(([send]) => send.text),
      };
    } finally {
      restoreActivePluginRegistrySnapshot(registry);
    }
  });
}

it("keeps the heartbeat quiet about a room message a room turn already answered", async () => {
  const { result, contexts, readRoomHistory, announced } = await runHeartbeat({
    room: [breakfast],
    prompt: "Heartbeat check. Reply HEARTBEAT_OK if nothing needs attention.",
  });

  expect(result.status, result.error).toBe("ok");
  expect(announced).toEqual([]);
  expect(contexts).toHaveLength(1);
  expect(contexts[0]).toMatch(/#1001 .*\[already seen\] figs: what's for breakfast\?/u);
  expect(readRoomHistory).toHaveBeenCalledWith(
    expect.objectContaining({ sessionKey: roomKey, to: route.to, accountId: route.accountId }),
  );
});

it("announces the heartbeat's own new alert exactly once, without the answered message", async () => {
  const { result, announced } = await runHeartbeat({
    room: [breakfast],
    prompt: "Heartbeat check. Pending alert: the backup on silas failed",
  });

  expect(result.status, result.error).toBe("ok");
  expect(announced).toEqual(["ALERT: the backup on silas failed"]);
});

it("shows the heartbeat a room message no room turn handled as new", async () => {
  const { result, contexts, announced } = await runHeartbeat({
    room: [breakfast, stuckDeploy],
    prompt: "Heartbeat check. Reply HEARTBEAT_OK if nothing needs attention.",
  });

  expect(result.status, result.error).toBe("ok");
  expect(contexts[0]).toMatch(/#1002 .*\[new\] cael: the deploy is stuck/u);
  expect(announced).toEqual(["Answering #1002."]);
});

it("runs the heartbeat as before when the room's history cannot be read", async () => {
  const { result, contexts, announced } = await runHeartbeat({
    room: [breakfast],
    prompt: "Heartbeat check. Reply HEARTBEAT_OK if nothing needs attention.",
    readFails: true,
  });

  // Best effort: the turn still runs, on the unmarked transcript alone.
  expect(result.status, result.error).toBe("ok");
  expect(contexts).toHaveLength(1);
  expect(contexts[0]).not.toContain("[already seen]");
  expect(announced).toEqual(["Answering #1001."]);
});
