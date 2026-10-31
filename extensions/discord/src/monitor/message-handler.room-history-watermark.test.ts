import { MessageType, type APIMessage } from "discord-api-types/v10";
import { createDeferred } from "openclaw/plugin-sdk/extension-shared";
import type { GetReplyOptions } from "openclaw/plugin-sdk/reply-runtime";
import { describe, expect, it } from "vitest";
import * as h from "./message-handler.process.test-harness.js";
import {
  createDiscordRoomHistoryWatermarks,
  type DiscordRoomHistoryWatermarks,
} from "./room-history-watermark.js";

h.registerDiscordProcessTestLifecycle();
const dispatch = h.dispatchInboundMessageForTest;
const startedAt = Date.parse("2026-10-30T12:00:00.000Z");
const at = (id: number) => new Date(startedAt + id * 1_000).toISOString();

type Mark = "seen" | "new" | "unmarked";
type DispatchOutcome = Awaited<ReturnType<typeof dispatch>>;

/** One Discord channel or thread whose timeline the REST recent-history route serves. */
function createChannel(channelId: string) {
  const timeline: APIMessage[] = [];
  return {
    channelId,
    post(id: number, author: string, content: string) {
      timeline.push({
        id: String(id),
        channel_id: channelId,
        type: MessageType.Default,
        content,
        timestamp: at(id),
        edited_timestamp: null,
        author: {
          id: `u-${author}`,
          username: author,
          discriminator: "0",
          global_name: null,
          avatar: null,
        },
        tts: false,
        mention_everyone: false,
        mentions: [],
        mention_roles: [],
        attachments: [],
        embeds: [],
        pinned: false,
      } satisfies APIMessage);
    },
    get: async (_route: string, query: { before: string; limit: number }) =>
      timeline
        .filter((row) => BigInt(row.id) < BigInt(query.before))
        .toReversed()
        .slice(0, query.limit),
  };
}

type Channel = ReturnType<typeof createChannel>;

/** Builds the preflight context for a message that is already on the channel timeline. */
async function turnContext(params: {
  watermarks: DiscordRoomHistoryWatermarks;
  channel: Channel;
  id: number;
  author: string;
  content: string;
  agentId?: string;
  kind?: "room_event" | "user_request";
  thread?: { parentId: string };
  abortSignal?: AbortSignal;
}) {
  const agentId = params.agentId ?? "main";
  const sessionKey = `agent:${agentId}:discord:channel:${params.channel.channelId}`;
  const kind = params.kind ?? "room_event";
  return await h.createBaseContext({
    roomHistoryWatermarks: params.watermarks,
    historyLimit: 20,
    inboundEventKind: kind,
    shouldRequireMention: false,
    effectiveWasMentioned: kind === "user_request",
    client: { rest: { get: params.channel.get } },
    message: {
      id: String(params.id),
      channelId: params.channel.channelId,
      timestamp: at(params.id),
      attachments: [],
    },
    messageChannelId: params.channel.channelId,
    author: { id: `u-${params.author}`, username: params.author, discriminator: "0" },
    sender: {
      id: `u-${params.author}`,
      label: params.author,
      name: params.author,
      isPluralKit: false,
    },
    baseText: params.content,
    messageText: params.content,
    baseSessionKey: sessionKey,
    route: {
      agentId,
      channel: "discord",
      accountId: "default",
      sessionKey,
      mainSessionKey: `agent:${agentId}:main`,
    },
    ...(params.thread
      ? {
          threadChannel: { id: params.channel.channelId, name: "release thread" },
          threadParentId: params.thread.parentId,
          channelConfig: { includeThreadStarter: false },
        }
      : {}),
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
  });
}

function marks(history: Array<{ sender: string; body: string }> | undefined): [Mark, string][] {
  return (history ?? []).map(({ sender, body }) => [
    sender.startsWith("[already seen] ")
      ? "seen"
      : sender.startsWith("[new] ")
        ? "new"
        : "unmarked",
    body,
  ]);
}

const notQueued = () => h.createNoQueuedDispatchResult();
const queued = () =>
  Object.assign(h.createNoQueuedDispatchResult(), { deferredToActiveRun: "followup" as const });

/**
 * Posts a message, processes it as one turn, and returns the history that turn rendered.
 * `run` stands in for core reply dispatch: it reports the agent run's terminal outcome
 * through the same reply options core calls, and says whether the turn was queued.
 */
async function turn(
  params: Parameters<typeof turnContext>[0],
  run: (options: GetReplyOptions | undefined) => Promise<DispatchOutcome> | DispatchOutcome,
) {
  params.channel.post(params.id, params.author, params.content);
  let history: [Mark, string][] | undefined;
  let replyOptions: GetReplyOptions | undefined;
  dispatch.mockImplementationOnce(async (dispatchParams) => {
    history = marks(dispatchParams?.ctx?.InboundHistory);
    replyOptions = dispatchParams?.replyOptions;
    return await run(replyOptions);
  });
  await h.runProcessDiscordMessage(await turnContext(params));
  return {
    history,
    settleQueued: (outcome: "completed" | "failed") =>
      replyOptions?.onAgentRunTerminalOutcome?.(outcome),
    dropQueued: () => replyOptions?.onFollowupQueueDisposition?.("queue-cap-old"),
  };
}

const completes = (options: GetReplyOptions | undefined) => {
  options?.onAgentRunTerminalOutcome?.("completed");
  return notQueued();
};

describe("Discord room-history watermark", () => {
  it("marks earlier burst messages and the question being handled as already seen", async () => {
    const watermarks = createDiscordRoomHistoryWatermarks();
    const channel = createChannel("c1");
    channel.post(99, "rune", "morning, all");
    // An inline turn answers the question while a burst from three senders queues behind it.
    const activeTurnRelease = createDeferred<void>();
    channel.post(100, "figs", "does the release build pass?");
    let activeOptions: GetReplyOptions | undefined;
    const activeStarted = createDeferred<void>();
    dispatch.mockImplementationOnce(async (dispatchParams) => {
      activeOptions = dispatchParams?.replyOptions;
      activeStarted.resolve();
      await activeTurnRelease.promise;
      activeOptions?.onAgentRunTerminalOutcome?.("completed");
      return notQueued();
    });
    const activeTurn = h.runProcessDiscordMessage(
      await turnContext({
        watermarks,
        channel,
        id: 100,
        author: "figs",
        content: "does the release build pass?",
      }),
    );
    await activeStarted.promise;

    const burst = { watermarks, channel };
    const a = await turn({ ...burst, id: 101, author: "cael", content: "it passes" }, queued);
    const b = await turn({ ...burst, id: 102, author: "silas", content: "green here" }, queued);
    const c = await turn({ ...burst, id: 103, author: "elliott", content: "agreed" }, queued);
    activeTurnRelease.resolve();
    await activeTurn;

    expect(a.history).toEqual([
      ["seen", "morning, all"],
      ["seen", "does the release build pass?"],
    ]);
    expect(b.history).toEqual([
      ["seen", "morning, all"],
      ["seen", "does the release build pass?"],
      ["seen", "it passes"],
    ]);
    expect(c.history).toEqual([
      ["seen", "morning, all"],
      ["seen", "does the release build pass?"],
      ["seen", "it passes"],
      ["seen", "green here"],
    ]);
  });

  it("advances only to the dispatch snapshot, so a message that lands mid-turn stays new", async () => {
    const watermarks = createDiscordRoomHistoryWatermarks();
    const channel = createChannel("c1");
    await turn({ watermarks, channel, id: 200, author: "figs", content: "status?" }, (options) => {
      channel.post(201, "cael", "posted while the turn ran");
      return completes(options);
    });

    const next = await turn(
      { watermarks, channel, id: 202, author: "rune", content: "next" },
      completes,
    );

    expect(next.history).toEqual([
      ["seen", "status?"],
      ["new", "posted while the turn ran"],
    ]);
  });

  it("keeps thread and parent-channel watermarks independent", async () => {
    const watermarks = createDiscordRoomHistoryWatermarks();
    const main = createChannel("c1");
    const thread = createChannel("t1");
    const inThread = { thread: { parentId: "c1" } };
    await turn(
      { watermarks, channel: main, id: 300, author: "figs", content: "main q" },
      completes,
    );
    await turn(
      { watermarks, channel: thread, id: 301, author: "cael", content: "thread q", ...inThread },
      completes,
    );
    main.post(302, "rune", "main note");
    await turn(
      { watermarks, channel: thread, id: 303, author: "silas", content: "thread a", ...inThread },
      completes,
    );

    const mainNext = await turn(
      { watermarks, channel: main, id: 304, author: "figs", content: "main next" },
      completes,
    );
    const threadNext = await turn(
      { watermarks, channel: thread, id: 305, author: "figs", content: "thread next", ...inThread },
      completes,
    );

    expect(mainNext.history).toEqual([
      ["seen", "main q"],
      ["new", "main note"],
    ]);
    expect(threadNext.history).toEqual([
      ["seen", "thread q"],
      ["seen", "thread a"],
    ]);
  });

  it("keeps independent watermarks for two agents in one channel", async () => {
    const watermarks = createDiscordRoomHistoryWatermarks();
    const channel = createChannel("c1");
    await turn({ watermarks, channel, id: 400, author: "figs", content: "q" }, completes);
    channel.post(401, "cael", "note");

    const ops = await turn(
      { watermarks, channel, id: 402, author: "rune", content: "ops turn", agentId: "ops" },
      completes,
    );
    const main = await turn(
      { watermarks, channel, id: 403, author: "silas", content: "main turn" },
      completes,
    );

    expect(ops.history).toEqual([
      ["unmarked", "q"],
      ["unmarked", "note"],
    ]);
    expect(main.history).toEqual([
      ["seen", "q"],
      ["new", "note"],
      ["new", "ops turn"],
    ]);
  });

  it("fails open after a restart: no watermark, so every message reads new and none is hidden", async () => {
    const before = createDiscordRoomHistoryWatermarks();
    const channel = createChannel("c1");
    await turn({ watermarks: before, channel, id: 500, author: "figs", content: "q" }, completes);
    const beforeRestart = await turn(
      { watermarks: before, channel, id: 501, author: "cael", content: "a" },
      completes,
    );

    const afterRestart = await turn(
      {
        watermarks: createDiscordRoomHistoryWatermarks(),
        channel,
        id: 502,
        author: "rune",
        content: "after restart",
      },
      completes,
    );

    expect(beforeRestart.history).toEqual([["seen", "q"]]);
    expect(afterRestart.history).toEqual([
      ["unmarked", "q"],
      ["unmarked", "a"],
    ]);
  });

  it.each(["failed", "aborted", "queued then failed", "queued then dropped"] as const)(
    "does not advance the watermark for a turn that %s",
    async (ending) => {
      const watermarks = createDiscordRoomHistoryWatermarks();
      const channel = createChannel("c1");
      await turn({ watermarks, channel, id: 600, author: "figs", content: "q" }, completes);
      const abort = new AbortController();
      const ended = await turn(
        {
          watermarks,
          channel,
          id: 601,
          author: "cael",
          content: "unfinished",
          abortSignal: abort.signal,
        },
        (options) => {
          if (ending === "failed") {
            options?.onAgentRunTerminalOutcome?.("failed");
            return notQueued();
          }
          if (ending === "aborted") {
            abort.abort();
            return notQueued();
          }
          return queued();
        },
      );
      if (ending === "queued then failed") {
        ended.settleQueued("failed");
      } else if (ending === "queued then dropped") {
        ended.dropQueued();
      }

      const next = await turn(
        { watermarks, channel, id: 602, author: "rune", content: "next" },
        completes,
      );

      expect(next.history).toEqual([
        ["seen", "q"],
        ["new", "unfinished"],
      ]);
    },
  );

  it("keeps mention turns' history as today while their completion advances the watermark", async () => {
    const watermarks = createDiscordRoomHistoryWatermarks();
    const channel = createChannel("c1");
    await turn({ watermarks, channel, id: 700, author: "cael", content: "note" }, completes);

    const mention = await turn(
      { watermarks, channel, id: 701, author: "figs", content: "@main q", kind: "user_request" },
      completes,
    );
    const room = await turn(
      { watermarks, channel, id: 702, author: "rune", content: "after" },
      completes,
    );

    expect(mention.history).toEqual([["unmarked", "note"]]);
    expect(room.history).toEqual([
      ["seen", "note"],
      ["seen", "@main q"],
    ]);
  });
});
