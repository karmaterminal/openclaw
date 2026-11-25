// Frond (karmaterminal, #1415): the message context Discord builds for one guild channel message,
// from the gateway frame as delivered, for core queue fixtures.
import { GatewayDispatchEvents, MessageType } from "discord-api-types/v10";
import type { InboundEventKind } from "openclaw/plugin-sdk/channel-inbound";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { mapGatewayDispatchData } from "../internal/gateway-dispatch.js";
import { buildDiscordMessageProcessContext } from "./message-handler.context.js";
import { createBaseDiscordMessageContext } from "./message-handler.test-harness.js";
import { isDiscordAccountOwnPost } from "./sender-identity.js";

export type DiscordRoomLine = {
  /** A snowflake: arrival order. */
  id: string;
  author: { id: string; name: string; bot?: true };
  text: string;
  /** The message this one quotes, as Discord's reply button sends it. */
  replyTo?: string;
  kind: InboundEventKind;
};

export async function buildDiscordRoomLineContext(params: {
  cfg: OpenClawConfig;
  storePath: string;
  sessionKey: string;
  channelId: string;
  line: DiscordRoomLine;
}) {
  const { cfg, sessionKey, channelId, line } = params;
  const frame = {
    id: line.id,
    channel_id: channelId,
    guild_id: "g1",
    timestamp: new Date(Number(line.id)).toISOString(),
    type: line.replyTo ? MessageType.Reply : MessageType.Default,
    content: line.text,
    attachments: [],
    author: {
      id: line.author.id,
      username: line.author.name,
      discriminator: "0",
      global_name: null,
      avatar: null,
      ...(line.author.bot ? { bot: true } : {}),
    },
    ...(line.replyTo
      ? { message_reference: { channel_id: channelId, message_id: line.replyTo } }
      : {}),
  };
  const { message, author } = mapGatewayDispatchData(
    { rest: {} } as never,
    GatewayDispatchEvents.MessageCreate,
    frame,
  ) as { message: unknown; author: unknown };
  const ctx = await createBaseDiscordMessageContext(
    {
      cfg,
      inboundEventKind: line.kind,
      replyToMode: "batched",
      message,
      author,
      // Durable ingress decides account provenance from the frame, before any policy runs.
      senderAccountVerified: isDiscordAccountOwnPost(frame.author, frame) ? true : undefined,
      sender: {
        id: line.author.id,
        label: line.author.name,
        name: line.author.name,
        isPluralKit: false,
      },
      messageChannelId: channelId,
      baseText: line.text,
      messageText: line.text,
      shouldRequireMention: false,
      effectiveWasMentioned: line.kind === "user_request",
      baseSessionKey: sessionKey,
      route: {
        agentId: "main",
        channel: "discord",
        accountId: "default",
        sessionKey,
        mainSessionKey: "agent:main:main",
      },
    },
    { storePath: params.storePath },
  );
  const built = await buildDiscordMessageProcessContext({ ctx, text: line.text, mediaList: [] });
  if (!built) {
    throw new Error("Expected a Discord message context");
  }
  return built.ctxPayload;
}
