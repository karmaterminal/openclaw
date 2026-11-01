// Frond (karmaterminal, #1415): with messages.groupChat.ambientOwnerAggregate on, unaddressed owner
// room prose joins the room aggregate and runs with no owner authority. The echo fixture replays an
// answered question followed by an all-owner burst through real durable ingress, the session mailbox,
// adoption and Discord's per-agent room-history watermark; only the model is scripted.
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { createDiscordRoomHistoryWatermarks } from "../../../extensions/discord/test-api.js";
import { resolveRequesterPrincipalKey } from "../../agents/requester-origin.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { defaultRuntime } from "../../runtime.js";
import { testing as controllerTesting } from "../../sessions/session-controller.test-support.js";
import type { TemplateContext } from "../templating.js";
import type { HistoryEntry } from "./history.types.js";
import { buildInboundUserContextPrefix } from "./inbound-meta.js";
import type { FollowupRun } from "./queue.js";
import {
  aggregated,
  expectRoomBaseline,
  expectSettledOnce,
  sender,
  widenNextClaim,
  withRoomIngress,
  type Harness,
  type Row,
} from "./queue.room-event-collect.test-support.js";
import { installQueueRuntimeErrorSilencer } from "./queue.test-helpers.js";
import { captureReplyToolAuthorityInput } from "./reply-tool-authority-snapshot.js";

installQueueRuntimeErrorSilencer();
afterEach(() => controllerTesting.resetSessionControllerForTest());

// Every prince is in every seat's commands.ownerAllowFrom; the room is ambient.
const AMBIENT: OpenClawConfig = {
  messages: { groupChat: { unmentionedInbound: "room_event", ambientOwnerAggregate: true } },
};
const DEFAULT: OpenClawConfig = { messages: { groupChat: { unmentionedInbound: "room_event" } } };

const ownerPeer = (id: string, config: OpenClawConfig, extra: Partial<FollowupRun["run"]> = {}) =>
  sender(id, { senderIsOwner: true, traceAuthorized: true, config, ...extra });
/** What the reply run records for unaddressed prose (get-reply-run-execute.ambient-room-prose). */
const prose = () => ({ ambientRoomProse: true });

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
async function replayEcho(config: OpenClawConfig) {
  const watermarks = createDiscordRoomHistoryWatermarks();
  const timeline: HistoryEntry[] = [
    QUESTION,
    ...REPLIES.map(([messageId, name, body]) => ({ messageId, sender: name, body })),
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
  const rows: Row[] = REPLIES.map(([id, name]) => ({
    id,
    from: ownerPeer(name, config),
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
      REPLIES.map(([id]) => id),
    );
    ({ calls, runs } = harness);
  });
  const count = {
    // The question's inline turn adopts one input; a collected turn adopts one per queued member.
    inputsPerTurn: [1, ...calls.map((call) => call.prompt.match(/^Queued #/gmu)?.length ?? 1)],
    posts: posts.length,
    answers: posts.filter((post) => post.text === ANSWER).length,
  };
  return { rows, calls, runs, posts, count, later: dispatch("1006").context };
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

  it("keeps the default: with the mode off each owner reply is its own owner turn", async () => {
    const echo = await replayEcho(DEFAULT);
    expect(echo.count).toEqual({ inputsPerTurn: [1, 1, 1, 1, 1, 1], posts: 6, answers: 1 });
    expect(echo.calls).toEqual(echo.rows.map((row) => echo.runs.get(row.id)));
    for (const call of echo.calls) {
      expect(call.run).toMatchObject({ senderIsOwner: true, traceAuthorized: true });
    }
  });

  it("runs the owners' collected turn with exactly a non-owner aggregate's authority", async () => {
    const collect = async (owners: boolean) => {
      const rows: Row[] = ["peer-a", "peer-b", "peer-c"].map((id, index) => ({
        id: `x${index + 1}`,
        from: owners ? ownerPeer(id, AMBIENT) : sender(`person-${index + 1}`, { config: AMBIENT }),
        // The one owner fact a source can carry besides the owner bit: an owner memory audience.
        source: () => ({
          ...prose(),
          ...(owners && index === 0 ? { memoryAudienceSenderIsOwner: true } : {}),
        }),
      }));
      let turn: FollowupRun | undefined;
      await withRoomIngress(rows, async (harness) => {
        await harness.dispatchRows();
        await harness.endActiveTurn();
        expect(harness.calls).toHaveLength(1);
        turn = harness.calls[0];
      });
      return turn!;
    };
    const authority = (run: FollowupRun) => ({
      tools: captureReplyToolAuthorityInput(run),
      principal: resolveRequesterPrincipalKey({
        ...run.run,
        messageChannel: run.originatingChannel,
      }),
      memoryAudienceSenderIsOwner: run.memoryAudienceSenderIsOwner,
      createChannelCronAuthority: run.createChannelCronAuthority,
      explicitSkillSelections: run.explicitSkillSelections,
    });
    const owners = await collect(true);
    expectRoomBaseline(owners);
    expect(authority(owners)).toEqual(authority(await collect(false)));
  });

  it("keeps owner commands, mentions, directives and elevated grants as their own turns", async () => {
    const people = (id: string) => sender(id, { config: AMBIENT });
    // Same-millisecond ingress claims order by id, so ids sort in arrival order.
    const rows: Row[] = [
      { id: "a01", from: ownerPeer("peer-a", AMBIENT), source: prose },
      { id: "a02", from: people("alice") },
      // A command-prefixed line the channel did not classify as a control command.
      {
        id: "a03",
        from: ownerPeer("peer-b", AMBIENT),
        source: () => ({ ambientRoomProse: false }),
      },
      { id: "a04", from: ownerPeer("peer-c", AMBIENT), source: prose },
      { id: "a05", from: ownerPeer("peer-d", AMBIENT), source: prose },
      // A mention, or a registered control command, is addressed input.
      { id: "a06", kind: "user_request", from: ownerPeer("peer-a", AMBIENT) },
      { id: "a07", from: ownerPeer("peer-b", AMBIENT), source: prose },
      { id: "a08", from: people("bob") },
      // An inline directive: the run carries what the directive set.
      {
        id: "a09",
        from: ownerPeer("peer-c", AMBIENT, { thinkLevelOverride: "high" }),
        source: () => ({ ambientRoomProse: false }),
      },
      { id: "a10", from: ownerPeer("peer-d", AMBIENT), source: prose },
      { id: "a11", from: people("carol") },
      {
        id: "a12",
        from: ownerPeer("peer-a", AMBIENT, {
          bashElevated: { enabled: true, allowed: true, defaultLevel: "on" },
        }),
        source: prose,
      },
      { id: "a13", from: ownerPeer("peer-b", AMBIENT), source: prose },
      { id: "a14", from: people("dave") },
    ];
    await withRoomIngress(rows, async (harness) => {
      await harness.dispatchRows();
      await harness.endActiveTurn();
      const own = ["a03", "a06", "a09", "a12"];
      expect(harness.calls).toHaveLength(own.length * 2 + 1);
      let start = 0;
      for (const [index, id] of own.entries()) {
        const end = rows.findIndex((row) => row.id === id);
        // Owners and people aggregate together only when every member passes.
        aggregated(harness.calls[index * 2], rows.slice(start, end));
        // Each excluded owner runs as itself, its authority intact.
        expect(harness.calls[index * 2 + 1]).toBe(harness.runs.get(id));
        expect(harness.calls[index * 2 + 1]?.run).toMatchObject({ senderIsOwner: true });
        start = end + 1;
      }
      aggregated(harness.calls.at(-1), rows.slice(start));
      await expectSettledOnce(
        harness,
        rows.map((row) => row.id),
      );
    });
  });

  it("refuses a widened claim holding a non-prose owner line, and runs each member alone", async () => {
    const error = vi.spyOn(defaultRuntime, "error");
    onTestFinished(() => error.mockRestore());
    const rows: Row[] = [
      { id: "w1", from: ownerPeer("peer-a", AMBIENT), source: prose },
      { id: "w2", from: ownerPeer("peer-b", AMBIENT), source: () => ({ ambientRoomProse: false }) },
      { id: "w3", from: ownerPeer("peer-c", AMBIENT), source: prose },
      { id: "w4", from: sender("alice", { config: AMBIENT }) },
    ];
    await withRoomIngress(rows, async (harness: Harness) => {
      await harness.dispatchRows();
      await harness.endActiveTurn(undefined, () => widenNextClaim(harness.key));
      // The drain re-checks the claim with the same predicate: neither runs as the room baseline.
      expect(error).toHaveBeenCalledWith(expect.stringContaining("refused a mixed claim"));
      expect(harness.calls.slice(0, 2).map((call) => call.run)).toEqual(
        rows.slice(0, 2).map((row) => harness.runs.get(row.id)?.run),
      );
      expect(harness.calls).toHaveLength(3);
      aggregated(harness.calls[2], rows.slice(2));
      await expectSettledOnce(
        harness,
        rows.map((row) => row.id),
      );
    });
  });
});
