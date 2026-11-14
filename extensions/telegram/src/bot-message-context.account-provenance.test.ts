// Frond (karmaterminal, #1564): account provenance for the owner's queue protection comes only from
// the Bot API's required User.is_bot on a message the account sent itself.
import { expect, it } from "vitest";
import { buildTelegramMessageContextForTest } from "./bot-message-context.test-harness.js";

const room = { id: -1001234567890, type: "supergroup", title: "Room" } as const;
const user = { id: 1234, is_bot: false, first_name: "Pat" };

it.each<[string, Record<string, unknown>, true?]>([
  ["a user account's own message", {}, true],
  ["a bot account", { from: { ...user, is_bot: true } }],
  ["a sender without the Bot API's is_bot", { from: { id: 1234, first_name: "Pat" } }],
  [
    "a linked channel's automatic forward",
    {
      from: { id: 777000, is_bot: false, first_name: "Telegram" },
      sender_chat: { id: -1009876543210, type: "channel", title: "News" },
      is_automatic_forward: true,
    },
  ],
  [
    "an anonymous administrator posting as the group",
    {
      from: { id: 1087968824, is_bot: true, first_name: "Group" },
      sender_chat: room,
    },
  ],
  [
    "a business bot sending for the account",
    { sender_business_bot: { id: 4321, is_bot: true, first_name: "Helper" } },
  ],
])("marks account provenance for %s", async (_, patch, verified) => {
  const ctx = await buildTelegramMessageContextForTest({
    cfg: {
      channels: { telegram: { dmPolicy: "open", allowFrom: ["*"] } },
      messages: { groupChat: { mentionPatterns: [], unmentionedInbound: "room_event" } },
    },
    message: { chat: room, from: user, message_id: 12, date: 1_700_000_012, text: "hi", ...patch },
  });
  expect(ctx?.ctxPayload.InboundEventKind).toBe("room_event");
  expect(ctx?.ctxPayload.SenderAccountVerified).toBe(verified);
});
