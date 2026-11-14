import { installDiscordIngressTestRuntime } from "../test-support/ingress-runtime.js";

installDiscordIngressTestRuntime();
import { expect, it } from "vitest";
import {
  createDiscordMessageHandler,
  preflightDiscordMessageMock,
  processDiscordMessageMock,
} from "./message-handler.module-test-helpers.js";
import {
  createDiscordHandlerParams,
  createDiscordQueuePreflightContext,
} from "./message-handler.test-helpers.js";

function createTextMessageData(messageId: string, channelId = "ch-1") {
  return {
    channel_id: channelId,
    author: { id: "user-1" },
    message: {
      id: messageId,
      author: { id: "user-1", bot: false },
      content: "hello",
      channel_id: channelId,
      attachments: [],
    },
  };
}

function stageQueuedPreflight() {
  preflightDiscordMessageMock.mockImplementation(
    async (preflightParams: { data: ReturnType<typeof createTextMessageData> }) => ({
      ...createDiscordQueuePreflightContext(preflightParams.data.channel_id),
      message: preflightParams.data.message,
      messageText: preflightParams.data.message.content,
    }),
  );
}

it("keeps replies to a different message out of an ordinary debounced batch", async () => {
  const params = createDiscordHandlerParams();
  params.cfg.messages = { inbound: { debounceMs: 20 } };
  stageQueuedPreflight();
  const handler = createDiscordMessageHandler(params);
  const ordinary = createTextMessageData("m-ordinary");
  const reply = createTextMessageData("m-other-bot-reply");
  Object.assign(reply.message, {
    messageReference: {
      type: 0,
      message_id: "m-other-bot",
      channel_id: reply.channel_id,
    },
    referencedMessage: {
      id: "m-other-bot",
      author: { id: "other-bot", bot: true },
    },
  });

  await handler(ordinary as never, {} as never);
  await handler(reply as never, {} as never);

  await expect.poll(() => preflightDiscordMessageMock.mock.calls.length).toBe(2);
  expect(preflightDiscordMessageMock.mock.calls.map(([call]) => call)).toMatchObject([
    { data: { message: { content: "hello" } } },
    { data: { message: { content: "hello" } } },
  ]);
  expect(processDiscordMessageMock).toHaveBeenCalledTimes(2);
});

// Frond (karmaterminal, #1564): a debounced batch is the account's own post only when every message
// in it is, for example a row stored before ingress recorded provenance, batched with a live one.
it.each<[string, Array<true | undefined>, true | undefined]>([
  ["every message carries it", [true, true], true],
  ["an earlier message lacks it", [undefined, true], undefined],
  ["a later message lacks it", [true, undefined], undefined],
])("marks a debounced batch's account provenance when %s", async (_, facts, expected) => {
  const params = createDiscordHandlerParams();
  params.cfg.messages = { inbound: { debounceMs: 20 } };
  stageQueuedPreflight();
  const handler = createDiscordMessageHandler(params);
  for (const [index, senderAccountVerified] of facts.entries()) {
    await handler(createTextMessageData(`m-${index}`) as never, {} as never, {
      senderAccountVerified,
    });
  }
  await expect.poll(() => preflightDiscordMessageMock.mock.calls.length).toBe(1);
  const [preflight] = preflightDiscordMessageMock.mock.calls[0] ?? [];
  expect(preflight).toMatchObject({ precedingMessages: [{ id: "m-0" }] });
  expect(preflight.senderAccountVerified).toBe(expected);
});
