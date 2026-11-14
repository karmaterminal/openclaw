// Frond (karmaterminal, #1564): account provenance for the owner's queue protection is decided from
// the gateway frame before any before_channel_ingress policy runs, stored in the durable row beside
// the frame, and reaches the inbound context unchanged across a restart. A policy replacement can
// drop it, never create it. Real durable ingress, ingress policy, preflight and context builder; only
// the turn after the context is replaced.
import { installDiscordIngressTestRuntime } from "../test-support/ingress-runtime.js";
import {
  preflightDiscordMessageMock as preflightMock,
  processDiscordMessageMock as processMessage,
} from "./message-handler.module-test-helpers.js";

installDiscordIngressTestRuntime();
import type { GatewayMessageCreateDispatchData as Frame } from "discord-api-types/v10";
import { createChannelIngressQueueForTests } from "openclaw/plugin-sdk/channel-ingress-test-runtime";
import {
  createMockPluginRegistry,
  initializeGlobalHookRunner,
  resetGlobalHookRunner,
} from "openclaw/plugin-sdk/plugin-test-runtime";
import { withOpenClawTestState } from "openclaw/plugin-sdk/test-state";
import { afterEach, expect, it, vi } from "vitest";
import * as ingressRuntime from "./ingress.js";
import { buildDiscordMessageProcessContext } from "./message-handler.context.js";
import { createDiscordMessageHandler } from "./message-handler.js";
import * as preflightRuntime from "./message-handler.preflight.js";
import { createDiscordMessage } from "./message-handler.preflight.test-helpers.js";
import type {
  DiscordMessagePreflightContext,
  DiscordMessagePreflightParams,
} from "./message-handler.preflight.types.js";
import { createDiscordHandlerParams } from "./message-handler.test-helpers.js";

const createDiscordIngressMonitor = ingressRuntime.createDiscordIngressMonitor;
const realPreflight = preflightRuntime.preflightDiscordMessage;
type DiscordQueue = NonNullable<Parameters<typeof createDiscordIngressMonitor>[0]["queue"]>;
type Seen = { sender?: string; verified?: true };

afterEach(() => resetGlobalHookRunner());

function frame(author: { id: string; bot: boolean }): Frame {
  const message = createDiscordMessage({ id: "1001", channelId: "room", content: "hi", author });
  return { ...message.rawData, guild_id: "guild-1" };
}

function openHandler(queue: DiscordQueue) {
  const params = createDiscordHandlerParams();
  params.discordConfig = { ...params.discordConfig, groupPolicy: "open" };
  params.cfg.channels = { discord: params.discordConfig };
  params.guildEntries = { "guild-1": { requireMention: false } };
  vi.spyOn(ingressRuntime, "createDiscordIngressMonitor").mockImplementation((monitorParams) =>
    createDiscordIngressMonitor({ ...monitorParams, queue }),
  );
  return createDiscordMessageHandler({
    ...params,
    client: {
      fetchChannel: async () => ({ id: "room", type: 0, name: "room" }),
      fetchGuild: async () => ({ id: "guild-1", name: "Synthetic Guild" }),
    } as never,
  });
}

async function seenBy(ctx: DiscordMessagePreflightContext): Promise<Seen> {
  // The context processDiscordMessage builds before its turn.
  const built = await buildDiscordMessageProcessContext({
    ctx,
    text: ctx.messageText,
    mediaList: ctx.preparedMedia,
  });
  return { sender: built?.ctxPayload.SenderId, verified: built?.ctxPayload.SenderAccountVerified };
}

const sameAuthorCopy = (message: Frame) => ({ ...message, content: "[redacted]" });
const withoutBotFlag = (message: Frame) => ({
  ...message,
  author: { id: message.author.id, username: message.author.username },
});
// A privacy policy that pseudonymizes the author: the raw id must never reach storage either.
const pseudonymized = (message: Frame) => ({
  ...message,
  author: { id: "anon-7f3a", username: "anon", discriminator: "0", avatar: null },
});

type Payload = Parameters<DiscordQueue["enqueue"]>[1];

/** Real queue and real preflight; `seen` records each delivery's inbound facts. */
async function withProvenanceQueue(run: (queue: DiscordQueue, seen: Seen[]) => Promise<void>) {
  preflightMock.mockImplementation((params: DiscordMessagePreflightParams) =>
    realPreflight(params),
  );
  const seen: Seen[] = [];
  await withOpenClawTestState(
    { layout: "state-only", prefix: "openclaw-discord-provenance-", applyEnv: false },
    async ({ stateDir }) => {
      const queue = createChannelIngressQueueForTests<Payload>({
        channelId: "discord",
        accountId: "default",
        stateDir,
      });
      await run(queue, seen);
    },
  );
  return seen;
}

/** Records one delivery's inbound facts, then completes its turn. */
function recordAndAdopt(seen: Seen[]) {
  processMessage.mockImplementationOnce(async (ctx: DiscordMessagePreflightContext) => {
    seen.push(await seenBy(ctx));
    await ctx.turnAdoptionLifecycle?.onAdopted();
  });
}

it.each<[string, { id: string; bot: boolean }, ((m: Frame) => unknown) | undefined, Seen]>([
  [
    "a user account's frame as received",
    { id: "user-1", bot: false },
    undefined,
    { sender: "user-1", verified: true },
  ],
  [
    "a policy's same-author copy of a user account's frame",
    { id: "user-1", bot: false },
    sameAuthorCopy,
    { sender: "user-1", verified: true },
  ],
  ["a bot account's frame as received", { id: "bot-1", bot: true }, undefined, { sender: "bot-1" }],
  [
    "a policy rebuild of a bot account's frame without author.bot",
    { id: "bot-1", bot: true },
    withoutBotFlag,
    { sender: "bot-1" },
  ],
  [
    "a privacy policy's pseudonymized author of a user account's frame",
    { id: "user-1", bot: false },
    pseudonymized,
    { sender: "anon-7f3a" },
  ],
])(
  "carries the provenance of %s through storage and a restart",
  async (_, author, rebuild, expected) => {
    if (rebuild) {
      initializeGlobalHookRunner(
        createMockPluginRegistry([
          {
            hookName: "before_channel_ingress",
            handler: (input: unknown) => ({
              event: rebuild((input as { event: Frame }).event),
            }),
          },
        ]),
      );
    }
    let stored: Payload | undefined;
    const seen = await withProvenanceQueue(async (queue, deliveries) => {
      // The first delivery is still running when the Gateway stops; the row replays after restart.
      processMessage.mockImplementationOnce(async (ctx: DiscordMessagePreflightContext) => {
        deliveries.push(await seenBy(ctx));
        await new Promise((resolve) => {
          ctx.abortSignal?.addEventListener("abort", resolve);
        });
      });
      const first = openHandler(queue);
      await first(frame(author), {} as never);
      await vi.waitFor(() => expect(deliveries).toHaveLength(1));
      await first.deactivate();
      stored = (await queue.listPending())[0]?.payload;
      recordAndAdopt(deliveries);
      const second = openHandler(queue);
      try {
        await vi.waitFor(() => expect(deliveries).toHaveLength(2));
      } finally {
        await second.deactivate();
      }
    });
    expect(seen).toEqual([expected, expected]);
    // The stored row carries the host's fact beside the frame, never inside it.
    expect(stored).toMatchObject({ rawMessage: { author: { id: expected.sender } } });
    expect(stored?.senderAccountVerified).toBe(expected.verified);
    expect(stored?.rawMessage).not.toHaveProperty("senderAccountVerified");
    expect(JSON.stringify(stored).includes(author.id)).toBe(expected.sender === author.id);
  },
);

// Rows admitted before ingress recorded provenance carry none, so an upgrade replays them unverified.
it("replays a user account's row stored before ingress recorded provenance as unverified", async () => {
  const seen = await withProvenanceQueue(async (queue, deliveries) => {
    const rawMessage = frame({ id: "user-1", bot: false });
    await queue.enqueue(
      rawMessage.id,
      { version: 1, receivedAt: Date.now(), rawMessage },
      {
        laneKey: "channel:room",
        receivedAt: Date.now(),
      },
    );
    recordAndAdopt(deliveries);
    const handler = openHandler(queue);
    try {
      await vi.waitFor(() => expect(deliveries).toHaveLength(1));
    } finally {
      await handler.deactivate();
    }
  });
  expect(seen).toEqual([{ sender: "user-1" }]);
});
