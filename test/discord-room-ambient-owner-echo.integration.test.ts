// Frond (karmaterminal, #1415): the all-owner echo. A question gets its answer; while that turn runs,
// five unmentioned prose replies arrive from four owner peers. Replayed through real durable ingress,
// the session mailbox, adoption and Discord's per-agent room-history watermark. The sources carry the
// owner facts and the prose fact as the reply run records them
// (get-reply-run-execute.ambient-room-prose.test.ts); the model and its runner's terminal report are
// scripted. The watermark shows every reply the question as already seen; with
// messages.groupChat.ambientOwnerAggregate on and the peers listed, the five owner turns collapse into
// one collected turn that does not answer it again. The principal's own line keeps its turn.
import { afterEach, describe, expect, it } from "vitest";
import { createDiscordRoomHistoryWatermarks } from "../extensions/discord/test-api.js";
import type { HistoryEntry } from "../src/auto-reply/reply/history.types.js";
import { buildInboundUserContextPrefix } from "../src/auto-reply/reply/inbound-meta.js";
import type { FollowupRun } from "../src/auto-reply/reply/queue.js";
import {
  aggregated,
  AMBIENT,
  expectSettledOnce,
  ownerPeer,
  principal,
  prose,
  withRoomIngress,
  type Row,
} from "../src/auto-reply/reply/queue.room-event-collect.test-support.js";
import { installQueueRuntimeErrorSilencer } from "../src/auto-reply/reply/queue.test-helpers.js";
import type { TemplateContext } from "../src/auto-reply/templating.js";
import type { OpenClawConfig } from "../src/config/types.openclaw.js";
import { testing as controllerTesting } from "../src/sessions/session-controller.test-support.js";

installQueueRuntimeErrorSilencer();
afterEach(() => controllerTesting.resetSessionControllerForTest());

const DEFAULT: OpenClawConfig = { messages: { groupChat: { unmentionedInbound: "room_event" } } };
const NO_PEERS: OpenClawConfig = {
  messages: { groupChat: { ...AMBIENT.messages?.groupChat, ambientOwnerAggregatePeers: [] } },
};

const ROOM = { sessionKey: "agent:main:discord:channel:room", channelId: "room" };
const QUESTION = { messageId: "1000", sender: "figs", body: "does the nightly build pass?" };
const ANSWER = "yes: the nightly build passes";
const ACK = "noted";
// Five unmentioned prose replies from four owner peers land while the question's turn runs.
const REPLIES = [
  ["1001", "peer-a", "it passes here"],
  ["1002", "peer-b", "green for me too"],
  ["1003", "peer-c", "same on arm"],
  ["1004", "peer-d", "confirmed"],
  ["1005", "peer-a", "the docs job too"],
] as const;
// The principal's own unaddressed line, still inside the question's turn.
const ASIDE = ["1006", "figs", "also check the arm runner"] as const;

/** Lines naming the question in a turn's rendered room history, one per member's history. */
function questionLines(context: string | undefined): string[] {
  return (context ?? "").split("\n").filter((line) => line.startsWith(`#${QUESTION.messageId} `));
}

/**
 * The scripted model answers the question only when the turn's room history shows it not already
 * seen ("[new]", or unmarked: no watermark reads as new). Otherwise it acknowledges the turn's own
 * new lines, which every queued turn has.
 */
function scriptedReply(run: FollowupRun): string {
  const lines = questionLines(run.currentInboundContext?.text);
  return lines.some((line) => !line.includes("[already seen]")) ? ANSWER : ACK;
}

type Post = { replyTo: string; text: string };

/** Replays the echo and counts inputs per turn, posts, and posts answering the question. */
async function replayEcho(config: OpenClawConfig, aside = false) {
  const watermarks = createDiscordRoomHistoryWatermarks();
  const lines: ReadonlyArray<readonly [string, string, string]> = aside
    ? [...REPLIES, ASIDE]
    : REPLIES;
  const timeline: HistoryEntry[] = [
    QUESTION,
    ...lines.map(([messageId, name, body]) => ({ messageId, sender: name, body })),
  ];
  const posts: Post[] = [];
  /** Discord renders a turn's room history at dispatch, then begins its watermark turn. */
  const dispatch = (messageId: string) => {
    const before = timeline.filter((entry) => BigInt(entry.messageId!) < BigInt(messageId));
    const history = watermarks.markHistory(ROOM, before);
    const context = buildInboundUserContextPrefix({
      Provider: "discord",
      ChatType: "channel",
      InboundHistory: history,
      SessionTranscriptContext: { historyKind: "recent", historyLimit: 20 },
    } as TemplateContext);
    return { context, turn: watermarks.beginTurn(ROOM, messageId) };
  };
  const rows: Row[] = lines.map(([id, name]) => ({
    id,
    from: name === "figs" ? principal(config) : ownerPeer(name, config),
    source: () => {
      const { context, turn } = dispatch(id);
      // Core queued the turn behind the active run; it settles when its agent run ends.
      turn.finishDispatch({ deferredToActiveRun: "followup" });
      return {
        ...prose(),
        currentInboundContext: { text: context },
        runObservers: { onAgentRunTerminalOutcome: turn.replyOptions.onAgentRunTerminalOutcome },
        onQueueDisposition: turn.replyOptions.onFollowupQueueDisposition,
        queuedFollowupReplyDisposition: {
          kind: "deliver",
          deliver: async ({ payloads }) => {
            posts.push(...payloads.map((payload) => ({ replyTo: id, text: payload.text ?? "" })));
          },
        },
      };
    },
  }));
  let calls: FollowupRun[] = [];
  let runs = new Map<string, FollowupRun>();
  await withRoomIngress(rows, async (harness) => {
    // The question's turn begins first; the replies are dispatched while it runs.
    const first = dispatch(QUESTION.messageId);
    await harness.dispatchRows();
    // The question is that turn's current message: it answers, as a reply to it, and completes.
    posts.push({ replyTo: QUESTION.messageId, text: ANSWER });
    first.turn.replyOptions.onAgentRunTerminalOutcome?.("completed");
    first.turn.finishDispatch(null);
    await harness.endActiveTurn(async (run) => {
      await harness.adoptAndRecord(run);
      const disposition = run.queuedFollowupReplyDisposition;
      if (disposition?.kind === "deliver") {
        await disposition.deliver({
          kind: "queued-followup",
          runId: `turn-${harness.calls.length}`,
          originatingChannel: "discord",
          payloads: [{ text: scriptedReply(run) }],
          completion: { kind: "completed" },
        });
      }
      run.runObservers?.onAgentRunTerminalOutcome?.("completed");
    });
    await expectSettledOnce(
      harness,
      lines.map(([id]) => id),
    );
    ({ calls, runs } = harness);
  });
  const count = {
    // The question's inline turn adopts one input; a collected turn adopts one per queued member.
    inputsPerTurn: [1, ...calls.map((call) => call.prompt.match(/^Queued #/gmu)?.length ?? 1)],
    posts: posts.length,
    answers: posts.filter((post) => post.text === ANSWER).length,
  };
  return { rows, calls, runs, posts, count, later: dispatch("1007").context };
}

describe("the all-owner echo under the ambient owner room aggregate (#1415)", () => {
  it("answers the question once: its own turn answers, one collected turn adopts the replies", async () => {
    const echo = await replayEcho(AMBIENT);
    expect(echo.count).toEqual({ inputsPerTurn: [1, 5], posts: 2, answers: 1 });
    const [collectedTurn] = echo.calls;
    // Each member keeps its sender label; the turn runs as the senderless room, no owner's authority.
    aggregated(collectedTurn, echo.rows);
    // Every member's history shows the question already seen, so the turn acknowledges instead.
    const seen = questionLines(collectedTurn?.currentInboundContext?.text);
    expect(seen).toHaveLength(REPLIES.length);
    expect(seen.every((line) => line.includes("[already seen] figs:"))).toBe(true);
    // Its one post replies to the newest member, never to the question.
    expect(echo.posts).toEqual([
      { replyTo: QUESTION.messageId, text: ANSWER },
      { replyTo: "1005", text: ACK },
    ]);
    expect(collectedTurn?.originatingReplyToId).toBeUndefined();
    // The collected turn settled every member's watermark turn: a later turn reads it all as seen.
    expect(echo.later.split("\n").filter((line) => line.startsWith("#100"))).toEqual([
      `#1000 [already seen] figs: ${QUESTION.body}`,
      ...REPLIES.map(([id, name, body]) => `#${id} [already seen] ${name}: ${body}`),
    ]);
  });

  it("keeps the principal's aside as its own owner turn beside the peers' collected turn", async () => {
    const echo = await replayEcho(AMBIENT, true);
    expect(echo.count).toEqual({ inputsPerTurn: [1, 5, 1], posts: 3, answers: 1 });
    const [collectedTurn, aside] = echo.calls;
    aggregated(collectedTurn, echo.rows.slice(0, REPLIES.length));
    expect(collectedTurn?.controllerClaim?.sources).not.toContain(echo.runs.get(ASIDE[0]));
    // Discord reports a human as no bot: the principal runs as itself with its owner authority.
    expect(aside).toBe(echo.runs.get(ASIDE[0]));
    expect(aside?.run).toMatchObject({
      senderId: "figs",
      senderName: "figs",
      senderIsOwner: true,
      traceAuthorized: true,
    });
    expect(echo.posts.at(-1)).toEqual({ replyTo: ASIDE[0], text: ACK });
  });

  it.each([
    ["the mode off", DEFAULT],
    ["the mode on with no peers listed", NO_PEERS],
  ])("keeps the default with %s: each owner reply is its own owner turn", async (_, config) => {
    const echo = await replayEcho(config);
    expect(echo.count).toEqual({ inputsPerTurn: [1, 1, 1, 1, 1, 1], posts: 6, answers: 1 });
    expect(echo.calls).toEqual(echo.rows.map((row) => echo.runs.get(row.id)));
    for (const call of echo.calls) {
      expect(call.run).toMatchObject({ senderIsOwner: true, traceAuthorized: true });
      // Each owner turn still saw the question as seen; it acknowledged, one post per reply.
      expect(questionLines(call.currentInboundContext?.text)).toEqual([
        `#1000 [already seen] figs: ${QUESTION.body}`,
      ]);
    }
  });
});
