import { assert, expect, it, vi } from "vitest";
import type { SlackMessageEvent } from "../../types.js";
import { prepareSlackMessage } from "./prepare.js";
import { createInboundSlackTestContext, createSlackTestAccount } from "./prepare.test-helpers.js";

vi.mock("openclaw/plugin-sdk/system-event-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("openclaw/plugin-sdk/system-event-runtime")>()),
  enqueueRoutedSystemEvent: vi.fn(),
}));

// Frond (karmaterminal, #1564): account provenance for the owner's queue protection comes only
// from a verified native delivery of a user account's own message.
it.each<
  [string, Parameters<typeof prepareSlackMessage>[0]["opts"], Partial<SlackMessageEvent>, true?]
>([
  ["a verified user message", { source: "message", senderAuthentication: "verified" }, {}, true],
  ["a relay frame, which is always mentioned", { source: "message", wasMentioned: true }, {}],
  ["an asserted sender", { source: "message", senderAuthentication: "asserted" }, {}],
  [
    "a verified bot user's message",
    { source: "message", senderAuthentication: "verified" },
    { bot_id: "B_OTHER" },
  ],
  [
    "a verified app or workflow post",
    { source: "message", senderAuthentication: "verified" },
    { user: undefined, bot_id: "B_OTHER", subtype: "bot_message", username: "deploys" },
  ],
])("marks account provenance for %s", async (_, opts, message, verified) => {
  // Bot room posts need a channel users entry before they reach preparation.
  const channels = { C123: { enabled: true, users: ["U1", "B_OTHER"] } };
  const ctx = createInboundSlackTestContext({
    cfg: { channels: { slack: { enabled: true, groupPolicy: "open", channels } } },
    channelsConfig: channels,
    defaultRequireMention: false,
  });
  ctx.resolveUserName = async () => ({ name: "Alice" });
  ctx.resolveChannelName = async () => ({ name: "general", type: "channel" });
  const prepared = await prepareSlackMessage({
    ctx,
    account: createSlackTestAccount(),
    message: {
      type: "message",
      channel: "C123",
      channel_type: "channel",
      user: "U1",
      text: "hi",
      ts: "1.000",
      ...message,
    },
    opts,
  });
  assert(prepared);
  expect(prepared.ctxPayload.SenderAccountVerified).toBe(verified);
});
