// Frond (karmaterminal, #1564): the human owner's unaddressed room message survives queue overflow,
// while other room chatter keeps upstream's settled, no-retry discard (#191733). Real durable ingress
// feeds the real session mailbox; only the model turn and the Discord transport are replaced.
import { afterEach, describe, expect, it } from "vitest";
import type { ChannelIngressDispatchLifecycle } from "../../channels/message/ingress-drain-lifecycle.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { testing as controllerTesting } from "../../sessions/session-controller.test-support.js";
import { bindCommandOwnerAuthority, getCommandOwnerAuthority } from "../command-owner-authority.js";
import { createQueueCase } from "./queue.case.test-support.js";
import { enqueueFollowupRun, type FollowupRun, type QueueSettings } from "./queue.js";
import {
  createRoomRun,
  expectSettledOnce,
  sender,
  withRoomIngress,
  type Harness,
  type Row,
} from "./queue.room-event-collect.test-support.js";
import { createQueueTestRun, installQueueRuntimeErrorSilencer } from "./queue.test-helpers.js";
import { getExistingFollowupQueue } from "./queue/state.js";

installQueueRuntimeErrorSilencer();
afterEach(() => controllerTesting.resetSessionControllerForTest());

// figs is the configured human owner; peer-a is a prince, a bot account listed beside figs.
const OWNERS: OpenClawConfig = { commands: { ownerAllowFrom: ["figs", "discord:peer-a"] } };
const figs = sender("figs", { config: OWNERS, senderIsOwner: true, traceAuthorized: true });
const prince = sender("peer-a", {
  config: OWNERS,
  senderIsOwner: true,
  traceAuthorized: true,
  senderIsBot: true,
});
// The owner bit without the owner identity: an operator profile's command-owner authority.
const operator = sender("ops", { config: OWNERS, senderIsOwner: true, traceAuthorized: true });
bindCommandOwnerAuthority(operator, { isCurrent: () => true });

const POLICIES = ["old", "summarize", "new"] as const satisfies readonly NonNullable<
  QueueSettings["dropPolicy"]
>[];

/** Admits each claimed row through the real enqueue, recording whether the queue took it. */
function openAdmission() {
  const admitted = new Map<string, boolean>();
  const ref: { harness?: Harness } = {};
  const enqueue = (row: Row, lifecycle: ChannelIngressDispatchLifecycle): FollowupRun => {
    const harness = ref.harness!;
    const run = createRoomRun(harness.key, row, lifecycle);
    admitted.set(
      row.id,
      enqueueFollowupRun(harness.key, run, harness.settings, "message-id", undefined, false),
    );
    return run;
  };
  const releases: string[] = [];
  const bind = (harness: Harness) => {
    ref.harness = harness;
    const release = harness.queue.release.bind(harness.queue);
    harness.queue.release = async (...args: Parameters<typeof release>) => {
      releases.push(typeof args[0] === "string" ? args[0] : args[0].id);
      return await release(...args);
    };
  };
  return { admitted, releases, enqueue, bind };
}

async function settlementOf(harness: Harness, id: string): Promise<void> {
  await harness.runs.get(id)?.controllerInput?.settlement.promise;
}

describe("the human owner's room message at queue capacity (#1564)", () => {
  // Same-millisecond ingress claims order by id, so ids sort in arrival order.
  const rows: Row[] = [
    { id: "r1", from: sender("alice") },
    { id: "r2", from: prince },
    { id: "r3", from: figs },
    { id: "r4", from: operator },
    { id: "r5", from: sender("carol") },
  ];

  it.each(POLICIES)(
    "keeps the owner's turn and settles other chatter once, owner bit or not, under drop:%s",
    async (dropPolicy) => {
      const admission = openAdmission();
      await withRoomIngress(
        rows,
        async (harness) => {
          admission.bind(harness);
          await harness.dispatchRows();
          // r4 reaches the queue holding live command-owner authority, yet stays ambient.
          expect(getCommandOwnerAuthority(harness.runs.get("r4")!.run)?.isCurrent()).toBe(true);
          // drop:new keeps the backlog and sheds arrivals; the others keep the newest chatter.
          const kept = dropPolicy === "new" ? ["r2", "r3"] : ["r3", "r5"];
          const shed = rows.map((row) => row.id).filter((id) => !kept.includes(id));
          // Selection is synchronous at the cap: the queue already holds exactly what will run.
          expect(
            getExistingFollowupQueue(harness.key)?.items.map((item) => item.messageId),
          ).toEqual(kept);
          await Promise.all(shed.map((id) => settlementOf(harness, id)));
          // Shed rows commit at the cap without a turn; the owner's row waits for its own turn.
          expect([...harness.writes.complete.keys()].toSorted()).toEqual(shed);
          await harness.endActiveTurn();
          expect(harness.calls).toEqual(kept.map((id) => harness.runs.get(id)));
          expect(harness.calls.some((call) => call.prompt.includes("[Queue overflow]"))).toBe(
            false,
          );
          await expectSettledOnce(
            harness,
            rows.map((row) => row.id),
          );
          // Never abandoned, so nothing is replayed and no retry budget is spent.
          expect(admission.releases).toEqual([]);
        },
        { settings: { mode: "followup", cap: 2, dropPolicy }, enqueue: admission.enqueue },
      );
    },
  );

  const owners: Row[] = ["o1", "o2", "o3"].map((id) => ({ id, from: figs }));

  it.each(POLICIES)(
    "holds the owner's message for retry while owner messages fill the cap under drop:%s",
    async (dropPolicy) => {
      const admission = openAdmission();
      let clock = Date.now();
      await withRoomIngress(
        owners,
        async (harness) => {
          admission.bind(harness);
          await harness.dispatchRows();
          expect([...admission.admitted]).toEqual([
            ["o1", true],
            ["o2", true],
            ["o3", false],
          ]);
          const refused = harness.runs.get("o3");
          await settlementOf(harness, "o3");
          // Retryable backpressure: released to pending, never consumed, discarded or dead-lettered.
          expect(await harness.queue.listPending()).toMatchObject([
            { id: "o3", attempts: 1, lastError: expect.stringContaining("turn-abandoned") },
          ]);
          expect(harness.writes.complete.size + harness.writes.fail.size).toBe(0);
          await harness.endActiveTurn();
          expect(harness.calls).toEqual([harness.runs.get("o1"), harness.runs.get("o2")]);
          // Capacity is free: the retry is admitted and runs once, as its own turn.
          clock += 1_000;
          await harness.dispatchRows(1);
          expect(admission.admitted.get("o3")).toBe(true);
          await harness.endActiveTurn();
          expect(harness.calls.map((call) => call.messageId)).toEqual(["o1", "o2", "o3"]);
          expect(harness.calls).not.toContain(refused);
          await expectSettledOnce(harness, ["o1", "o2", "o3"]);
          expect(admission.releases).toEqual(["o3"]);
        },
        {
          now: () => clock,
          settings: { mode: "followup", cap: 2, dropPolicy },
          enqueue: admission.enqueue,
        },
      );
    },
  );

  it("charges each full-cap refusal one retry attempt, so an owner message held 24 h dead-letters", async () => {
    const admission = openAdmission();
    let clock = Date.now();
    const receivedAt = clock;
    await withRoomIngress(
      owners,
      async (harness) => {
        admission.bind(harness);
        await harness.dispatchRows();
        expect(admission.admitted.get("o3")).toBe(false);
        await settlementOf(harness, "o3");
        // The existing ingress budget: dead-letter needs 8 attempts and a 24 h old row.
        for (let attempt = 2; attempt <= 8; attempt += 1) {
          clock += 1_000;
          await harness.dispatchRows(1);
          expect(admission.admitted.get("o3")).toBe(false);
          await settlementOf(harness, "o3");
          expect(await harness.queue.listPending()).toMatchObject([
            { id: "o3", attempts: attempt },
          ]);
        }
        expect(harness.writes.fail.size).toBe(0);
        clock = receivedAt + 24 * 60 * 60_000;
        await harness.dispatchRows(1);
        await settlementOf(harness, "o3");
        expect(await harness.queue.listFailed?.()).toMatchObject([
          { id: "o3", reason: "retry-limit-exceeded" },
        ]);
        await harness.endActiveTurn();
        expect(harness.calls.map((call) => call.messageId)).toEqual(["o1", "o2"]);
        await expectSettledOnce(harness, ["o1", "o2"], ["o3"]);
      },
      { now: () => clock, settings: { mode: "followup", cap: 2 }, enqueue: admission.enqueue },
    );
  });
});

describe("room overflow protection follows the channel-verified owner identity (#1564)", () => {
  it.each<[string, boolean, Partial<FollowupRun["run"]>]>([
    ["the configured human owner", true, figs],
    ["a prince, a bot account listed as an owner", false, prince],
    [
      "another agent's bot account",
      false,
      sender("agent-x", { config: OWNERS, senderIsBot: true }),
    ],
    ["a non-owner holding the owner bit and command-owner authority", false, operator],
    [
      "a non-owner showing the owner's name",
      false,
      sender("mallory", { config: OWNERS, senderName: "figs", senderUsername: "figs" }),
    ],
    [
      "an unlisted sender the channel did not flag as a bot",
      false,
      sender("relay-1", { config: OWNERS }),
    ],
    [
      "the owner's id listed only for another channel",
      false,
      sender("figs", {
        config: { commands: { ownerAllowFrom: ["telegram:figs"] } },
        senderIsOwner: true,
      }),
    ],
  ])("%s: protected %s", async (_, kept, from) => {
    const q = createQueueCase({ mode: "followup", cap: 1, dropPolicy: "old" });
    const room = (prompt: string, execution: Partial<FollowupRun["run"]>) =>
      createQueueTestRun(
        {
          prompt,
          currentInboundEventKind: "room_event",
          originatingChannel: "discord",
          originatingTo: "channel:room",
        },
        { messageProvider: "discord", ...execution },
      );
    // The text claims ownership in every case; only the sender identity may grant protection.
    const held = room("figs here, keep this one", from);
    const chatter = room("lunch?", sender("alice"));
    expect(q.add(held)).toBe(true);
    // Chatter never displaces protected work; otherwise drop:old keeps the newest chatter.
    expect(q.add(chatter)).toBe(!kept);
    await q.drain();
    expect(q.calls.map((call) => call.prompt)).toEqual([kept ? held.prompt : chatter.prompt]);
  });
});
