// Frond (karmaterminal, #1415): room chatter batches whatever it quotes, and addressed requests and
// the principal's room lines run ahead of it, in order, from the queue and from an idle debounce.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  releaseSessionControllerClaim,
  tryClaimSessionControllerTask,
} from "../../sessions/session-controller.mailbox.js";
import { testing as controllerTesting } from "../../sessions/session-controller.test-support.js";
import type { MsgContext } from "../templating.js";
import { enqueueFollowupRun, scheduleFollowupDrain, type FollowupRun } from "./queue.js";
import {
  aggregated,
  AMBIENT,
  collected,
  expectRoomTurns,
  expectSettledOnce,
  ownerPeer,
  principal,
  prose,
  sender,
  withRoomIngress,
  type Row,
} from "./queue.room-event-collect.test-support.js";
import { createQueueTestRun, installQueueRuntimeErrorSilencer } from "./queue.test-helpers.js";
import { clearFollowupQueue, getExistingFollowupQueue } from "./queue/state.js";
import { prepareReplySourceInput } from "./reply-source-binding.js";

installQueueRuntimeErrorSilencer();
afterEach(() => controllerTesting.resetSessionControllerForTest());

/** A room line quoting another message, as Discord records it under replyToMode batched. */
const quoting =
  (replyTo: string | undefined, extra: Partial<FollowupRun> = {}) =>
  () => ({
    originatingReplyToId: replyTo,
    originatingReplyToMode: "batched" as const,
    ...extra,
  });

describe("room chatter batches whatever message it quotes (#1415)", () => {
  it("collects many senders quoting different messages into one turn that quotes none", async () => {
    const rows: Row[] = ["alice", "bob", "carol", "dave"].map((id, index) => ({
      id: `q${index + 1}`,
      from: sender(id),
      source: quoting(index ? `m${index}` : undefined),
    }));
    await withRoomIngress(rows, async (harness) => {
      await harness.dispatchRows();
      await harness.endActiveTurn();
      expectRoomTurns(harness, rows, {});
      expect(harness.calls[0]).toMatchObject({ messageId: "q4", originatingTo: "channel:room" });
      expect(harness.calls[0]?.originatingReplyToId).toBeUndefined();
      await expectSettledOnce(
        harness,
        rows.map((row) => row.id),
      );
    });
  });

  it("collects one owner's lines quoting different messages as that owner, opt-in off", async () => {
    const config: OpenClawConfig = {
      messages: { groupChat: { unmentionedInbound: "room_event" } },
    };
    const rows: Row[] = ["m1", "m2", "m3"].map((replyTo, index) => ({
      id: `o${index + 1}`,
      from: ownerPeer("peer-a", config),
      source: quoting(replyTo, prose()),
    }));
    await withRoomIngress(rows, async (harness) => {
      await harness.dispatchRows();
      await harness.endActiveTurn();
      expect(harness.calls).toHaveLength(1);
      collected(harness.calls[0], rows);
      expect(harness.calls[0]?.run).toMatchObject({ senderId: "peer-a", senderIsOwner: true });
      await expectSettledOnce(
        harness,
        rows.map((row) => row.id),
      );
    });
  });

  it("keeps a batch's shared quote, and keeps addressed requests apart by theirs", async () => {
    const rows: Row[] = [
      { id: "s1", from: sender("alice"), source: quoting("m1") },
      { id: "s2", from: sender("bob"), source: quoting("m1") },
      { id: "s3", kind: "user_request", from: sender("asker"), source: quoting("m1") },
      { id: "s4", kind: "user_request", from: sender("asker"), source: quoting("m2") },
    ];
    await withRoomIngress(rows, async (harness) => {
      await harness.dispatchRows();
      await harness.endActiveTurn();
      expectRoomTurns(harness, rows, { direct: ["s3", "s4"] });
      expect(harness.calls.map((call) => call.originatingReplyToId)).toEqual(["m1", "m2", "m1"]);
    });
  });

  it("keeps other threads of the channel on their own turn", async () => {
    const rows: Row[] = [
      { id: "t1", from: sender("alice"), source: quoting("m1", { originatingThreadId: "a" }) },
      { id: "t2", from: sender("bob"), source: quoting("m1", { originatingThreadId: "a" }) },
      { id: "t3", from: sender("carol"), source: quoting("m1", { originatingThreadId: "b" }) },
    ];
    await withRoomIngress(rows, async (harness) => {
      await harness.dispatchRows();
      await harness.endActiveTurn();
      expect(harness.calls).toHaveLength(2);
      aggregated(harness.calls[0], rows.slice(0, 2));
      expect(harness.calls[1]).toBe(harness.runs.get("t3"));
    });
  });
});

describe("addressed requests and the principal run ahead of room chatter (#1415)", () => {
  it("runs them in arrival order, then the chatter around them as one turn", async () => {
    const rows: Row[] = [
      { id: "d1", from: ownerPeer("peer-a", AMBIENT), source: prose },
      { id: "d2", from: principal(AMBIENT), source: prose },
      { id: "d3", from: sender("alice", { config: AMBIENT }) },
      { id: "d4", kind: "user_request", from: ownerPeer("peer-b", AMBIENT) },
      { id: "d5", from: principal(AMBIENT), source: prose },
      { id: "d6", from: ownerPeer("peer-c", AMBIENT), source: prose },
    ];
    await withRoomIngress(rows, async (harness) => {
      await harness.dispatchRows();
      await harness.endActiveTurn();
      expectRoomTurns(harness, rows, { direct: ["d2", "d4", "d5"] });
      await expectSettledOnce(
        harness,
        rows.map((row) => row.id),
      );
    });
  });

  it("lets a request arriving during the chatter's turn run before later chatter", async () => {
    const rows: Row[] = ["alice", "bob"].map((id, index) => ({
      id: `e${index + 1}`,
      from: sender(id),
    }));
    const late: Row[] = [
      { id: "e3", from: sender("carol") },
      { id: "e4", kind: "user_request", from: sender("asker") },
      { id: "e5", from: sender("dave") },
    ];
    await withRoomIngress(rows, async (harness) => {
      await harness.dispatchRows();
      await harness.endActiveTurn(async (run) => {
        await harness.adoptAndRecord(run);
        if (harness.calls.length === 1) {
          for (const row of late) {
            await harness.addRow(row);
          }
          await harness.dispatchRows(late.length);
        }
      });
      expect(harness.calls).toHaveLength(3);
      aggregated(harness.calls[0], rows);
      expect(harness.calls[1]).toBe(harness.runs.get("e4"));
      aggregated(harness.calls[2], [late[0]!, late[2]!]);
    });
  });

  it("keeps an internal turn's place: it neither overtakes chatter nor is overtaken", async () => {
    const rows: Row[] = [
      { id: "i1", from: sender("alice") },
      { id: "i2", source: () => ({ currentInboundEventKind: undefined }) },
      { id: "i3", from: sender("bob") },
      { id: "i4", kind: "user_request", from: sender("asker") },
    ];
    await withRoomIngress(rows, async (harness) => {
      await harness.dispatchRows();
      await harness.endActiveTurn();
      expect(harness.calls.map((call) => call.messageId)).toEqual(["i1", "i2", "i4", "i3"]);
    });
  });

  it.each(["followup", "steer"] as const)(
    "keeps arrival order under configured %s",
    async (mode) => {
      const rows: Row[] = [
        { id: "f1", from: sender("alice") },
        { id: "f2", kind: "user_request", from: sender("asker") },
        { id: "f3", from: principal(AMBIENT), source: prose },
      ];
      await withRoomIngress(
        rows,
        async (harness) => {
          await harness.dispatchRows();
          await harness.endActiveTurn();
          expect(harness.calls.map((call) => call.messageId)).toEqual(["f1", "f2", "f3"]);
        },
        { settings: { mode } },
      );
    },
  );
});

// The turn has ended and its chatter waits out a debounce: nothing is active, so an arrival reaches
// the mailbox through its reserved source, before preparation binds it.
describe("an arrival while chatter waits out its debounce (#1415)", () => {
  const cfg = (debounceMs: number): OpenClawConfig => ({
    ...AMBIENT,
    commands: { ownerAllowFrom: ["discord:figs", "discord:peer-a"] },
    messages: {
      ...AMBIENT.messages,
      queue: { mode: "collect", debounceMsByChannel: { discord: debounceMs } },
    },
  });

  async function arrive(ctx: Partial<MsgContext>, earlier: Array<Partial<MsgContext>> = []) {
    let claimed: boolean | undefined;
    await withRoomIngress(
      ["alice", "bob"].map((id, index) => ({
        id: `w${index + 1}`,
        from: sender(id, { agentId: "main" }),
      })),
      async (harness) => {
        await harness.dispatchRows();
        // The room's turn ended; the chatter waits for a quiet room.
        scheduleFollowupDrain(harness.key, harness.adoptAndRecord);
        const reserve = async (facts: Partial<MsgContext>) =>
          (
            await prepareReplySourceInput(
              {
                Provider: "discord",
                SessionKey: harness.key,
                AgentId: "agent",
                ...facts,
              } as MsgContext,
              cfg(60_000),
              {},
            )
          ).input!;
        for (const facts of earlier) {
          await reserve(facts);
        }
        const input = await reserve(ctx);
        expect(input.mailbox).toBe(getExistingFollowupQueue(harness.key));
        const claim = tryClaimSessionControllerTask(input, "visible");
        claimed = claim !== undefined;
        expect(harness.calls).toEqual([]);
        if (claim) {
          releaseSessionControllerClaim(claim);
        }
      },
      { settings: { debounceMs: 60_000 } },
    );
    return claimed;
  }

  const mention = { InboundEventKind: "user_request", SenderId: "asker" } as const;
  const chatter = {
    InboundEventKind: "room_event",
    SenderId: "peer-a",
    SenderIsBot: true,
  } as const;

  it.each<[string, boolean, Partial<MsgContext>, Array<Partial<MsgContext>>?]>([
    ["a mention", true, mention],
    ["the principal's line", true, { InboundEventKind: "room_event", SenderId: "figs" }],
    ["a mention behind chatter still preparing", true, mention, [chatter]],
    ["an owner bot's chatter", false, chatter],
    ["a non-owner's chatter", false, { InboundEventKind: "room_event", SenderId: "carol" }],
    [
      "an internal turn",
      false,
      {
        InboundEventKind: "user_request",
        InputProvenance: { kind: "internal_system", sourceTool: "heartbeat" },
      },
    ],
    ["a mention behind a request still preparing", false, mention, [mention]],
  ])("%s runs at once: %s", async (_, atOnce, ctx, earlier) => {
    expect(await arrive(ctx, earlier)).toBe(atOnce);
  });
});

describe("room chatter's wait is bounded (#1415)", () => {
  const rows: Row[] = ["alice", "bob"].map((id, index) => ({
    id: `a${index + 1}`,
    from: sender(id),
  }));

  /** The same lines, already in the queue for `ageMs`. */
  const aged = (ageMs: number) =>
    rows.map((row): Row => ({ ...row, source: () => ({ enqueuedAt: Date.now() - ageMs }) }));

  it("flushes chatter older than a minute without waiting for the room to go quiet", async () => {
    await withRoomIngress(
      aged(60_001),
      async (harness) => {
        await harness.dispatchRows();
        await harness.endActiveTurn();
        expectRoomTurns(harness, rows, {});
      },
      { settings: { debounceMs: 45_000 } },
    );
  });

  it.each([
    ["fresh chatter for the configured debounce", 1_000, 45_000],
    ["chatter for a debounce longer than a minute", 60_001, 120_000],
  ])("holds %s", async (_, ageMs, debounceMs) => {
    await withRoomIngress(
      aged(ageMs),
      async (harness) => {
        await harness.dispatchRows();
        scheduleFollowupDrain(harness.key, harness.adoptAndRecord);
        const mailbox = getExistingFollowupQueue(harness.key)!;
        expect(mailbox.timer).toBeDefined();
        expect(mailbox.claim).toBeUndefined();
        expect(mailbox.preparing).toBeFalsy();
      },
      { settings: { debounceMs } },
    );
  });

  it("never restarts a waiting request's debounce", async () => {
    const mixed: Row[] = [
      { id: "b1", kind: "user_request", from: sender("asker") },
      { id: "b2", from: sender("alice") },
      { id: "b3", kind: "user_request", from: sender("asker") },
    ];
    await withRoomIngress(
      mixed,
      async (harness) => {
        const stamps: number[] = [];
        for (const _ of mixed) {
          await harness.dispatchRows(1);
          stamps.push(getExistingFollowupQueue(harness.key)!.lastEnqueuedAt);
        }
        expect(stamps[1]).toBe(stamps[0]);
        // Another request does.
        expect(stamps[2]).toBeGreaterThan(stamps[1]!);
      },
      { settings: { debounceMs: 45_000 } },
    );
  });

  it("finishes forming a batch when a request arrives while it prepares", async () => {
    await withRoomIngress(
      aged(60_001),
      async (harness) => {
        await harness.dispatchRows();
        const asked = createQueueTestRun(
          {
            prompt: "a late request",
            messageId: "late",
            originatingChannel: "discord",
            originatingTo: "channel:room",
            originatingChatType: "channel",
            currentInboundEventKind: "user_request",
          },
          { sessionKey: harness.key, messageProvider: "discord", ...sender("asker") },
        );
        scheduleFollowupDrain(harness.key, harness.adoptAndRecord);
        expect(getExistingFollowupQueue(harness.key)?.preparing).toBe(true);
        enqueueFollowupRun(harness.key, asked, harness.settings, "message-id", undefined, false);
        // A restarted batch would wait out another debounce.
        await vi.waitFor(() => expect(harness.calls).toHaveLength(1));
        aggregated(harness.calls[0], rows);
        clearFollowupQueue(harness.key);
      },
      { settings: { debounceMs: 45_000 } },
    );
  });
});
