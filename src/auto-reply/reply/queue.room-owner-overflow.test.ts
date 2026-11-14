// Frond (karmaterminal, #1564): the configured owner's unaddressed room message, posted from an
// account listed in messages.groupChat.ownerQueueProtectionAccounts and verified by the channel as
// that account's own post, survives queue overflow, while other room chatter keeps upstream's
// settled, no-retry discard (#191733). Command authority never grants it. Real durable ingress
// feeds the real session mailbox; only the model turn and the Discord transport are replaced.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChannelIngressDispatchLifecycle } from "../../channels/message/ingress-drain-lifecycle.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { testing as controllerTesting } from "../../sessions/session-controller.test-support.js";
import { AgentDatabaseExecutionAdmissionClosedError } from "../../state/agent-database-admission-error.js";
import { isConfiguredCommandOwner, isSenderInOwnerAllowFromList } from "../command-auth.js";
import { bindCommandOwnerAuthority, getCommandOwnerAuthority } from "../command-owner-authority.js";
import { createQueueCase } from "./queue.case.test-support.js";
import {
  enqueueFollowupRun,
  scheduleFollowupDrain,
  type FollowupRun,
  type QueueSettings,
} from "./queue.js";
import {
  createRoomRun,
  expectSettledOnce,
  sender,
  withRoomIngress,
  type Harness,
  type Row,
} from "./queue.room-event-collect.test-support.js";
import {
  createQueueTestRun,
  installQueueRuntimeErrorSilencer,
  rejectQueuePreparation,
} from "./queue.test-helpers.js";
import { getExistingFollowupQueue } from "./queue/state.js";

installQueueRuntimeErrorSilencer();
afterEach(() => controllerTesting.resetSessionControllerForTest());

// figs's account is the one listed for queue protection, posting from the account the channel
// verified as figs's own. peer-a is a prince, a bot account, and kin a second ordinary verified
// account: both are listed beside figs as command owners only.
const OWNERS: OpenClawConfig = {
  commands: { ownerAllowFrom: ["figs", "discord:peer-a", "discord:kin"] },
  messages: { groupChat: { ownerQueueProtectionAccounts: ["discord:figs"] } },
};
const owner = { config: OWNERS, senderIsOwner: true, traceAuthorized: true } as const;
const figs = sender("figs", { ...owner, senderAccountVerified: true });
// The owner's id with no account provenance: absent never means the account's own post.
const figsUnverified = sender("figs", owner);
const prince = sender("peer-a", { ...owner, senderIsBot: true });
// Command authority without the queue-protection listing.
const kin = sender("kin", { ...owner, senderAccountVerified: true });
// The owner bit without the owner identity: an operator profile's command-owner authority, posted
// from the operator's own verified account.
const operator = sender("ops", { ...owner, senderAccountVerified: true });
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

describe("the configured owner's room message at queue capacity (#1564)", () => {
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
          // Retryable backpressure: released to pending without spending an attempt, never
          // consumed, discarded or dead-lettered.
          expect(await harness.queue.listPending()).toMatchObject([
            { id: "o3", attempts: 0, lastError: expect.stringContaining("backpressure") },
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

  it("keeps an owner message refused past 24 h and 8 refusals pending with no attempt spent, then runs each waiting owner message once in order", async () => {
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
        expect(await harness.queue.listPending()).toMatchObject([{ id: "o3", attempts: 0 }]);
        const refused = [harness.runs.get("o3")];
        // A later owner message waits behind the refused one in the room lane.
        clock += 60 * 60_000;
        await harness.addRow({ id: "o4", from: figs });
        for (let refusal = 2; refusal <= 12; refusal += 1) {
          clock = refusal === 12 ? receivedAt + 25 * 60 * 60_000 : clock + 1_000;
          await harness.dispatchRows(1);
          // Each redelivery is a new run whose protection comes from the row's verified sender.
          const run = harness.runs.get("o3")!;
          expect(refused).not.toContain(run);
          expect(run.protectFromQueueOverflow).toBe(true);
          expect(admission.admitted.get("o3")).toBe(false);
          refused.push(run);
          await settlementOf(harness, "o3");
          expect(await harness.queue.listPending()).toMatchObject([
            { id: "o3", attempts: 0 },
            { id: "o4", attempts: 0 },
          ]);
        }
        expect(harness.writes.complete.size + harness.writes.fail.size).toBe(0);
        await harness.endActiveTurn();
        // Capacity is free: each waiting owner message is admitted once, in arrival order.
        clock += 1_000;
        await harness.dispatchRows(2);
        expect(admission.admitted.get("o3")).toBe(true);
        expect(admission.admitted.get("o4")).toBe(true);
        await harness.endActiveTurn();
        expect(harness.calls.map((call) => call.messageId)).toEqual(["o1", "o2", "o3", "o4"]);
        expect(harness.calls.filter((call) => refused.includes(call))).toEqual([]);
        await expectSettledOnce(harness, ["o1", "o2", "o3", "o4"]);
        expect(admission.releases).toEqual(Array.from({ length: 12 }, () => "o3"));
      },
      { now: () => clock, settings: { mode: "followup", cap: 2 }, enqueue: admission.enqueue },
    );
  });

  it("paces the owner's attempt-free retries by the ingress backoff, so a held cap never spins the lane", async () => {
    const admission = openAdmission();
    let clock = Date.now();
    await withRoomIngress(
      owners,
      async (harness) => {
        admission.bind(harness);
        let claims = 0;
        const claim = harness.queue.claim.bind(harness.queue);
        harness.queue.claim = async (...args: Parameters<typeof claim>) => {
          claims += 1;
          return await claim(...args);
        };
        await harness.dispatchRows();
        await settlementOf(harness, "o3");
        claims = 0;
        // The production backoff: doubling from 1 s to the 3 min cap.
        const delays = [1, 2, 4, 8, 16, 32, 64, 128, 180, 180].map((seconds) => seconds * 1_000);
        for (const delay of delays) {
          // Every settlement wakes the drain at once; the refused row waits for its time.
          for (let wake = 0; wake < 3; wake += 1) {
            expect(await harness.drain.drainOnce()).toEqual({ started: 0 });
          }
          clock += delay - 1;
          expect(await harness.drain.drainOnce()).toEqual({ started: 0 });
          clock += 1;
          await harness.dispatchRows(1);
          expect(admission.admitted.get("o3")).toBe(false);
          await settlementOf(harness, "o3");
          expect(await harness.queue.listPending()).toMatchObject([{ id: "o3", attempts: 0 }]);
        }
        // One claim per eligible time: no claim, refuse, release spin.
        expect(claims).toBe(delays.length);
        await harness.endActiveTurn();
        clock += 180_000;
        await harness.dispatchRows(1);
        await harness.endActiveTurn();
        expect(harness.calls.map((call) => call.messageId)).toEqual(["o1", "o2", "o3"]);
        await expectSettledOnce(harness, ["o1", "o2", "o3"]);
      },
      {
        now: () => clock,
        settings: { mode: "followup", cap: 2 },
        enqueue: admission.enqueue,
        retryPolicy: {},
      },
    );
  });

  it("holds the owner's room message for retry at a drop:new cap mixed with requests, while addressed arrivals keep drop:new", async () => {
    const admission = openAdmission();
    let clock = Date.now();
    // Same-millisecond ingress claims order by id, so ids sort in arrival order.
    const mixed: Row[] = [
      { id: "o1", from: figs },
      { id: "p2", kind: "user_request", from: sender("alice") },
      // The owner's own mention is an addressed request: upstream's drop:new contract governs it.
      { id: "q3", kind: "user_request", from: figs },
      { id: "q4", kind: "user_request", from: sender("bob") },
      { id: "r5", from: figs },
    ];
    await withRoomIngress(
      mixed,
      async (harness) => {
        admission.bind(harness);
        await harness.dispatchRows();
        expect([...admission.admitted]).toEqual([
          ["o1", true],
          ["p2", true],
          ["q3", false],
          ["q4", false],
          ["r5", false],
        ]);
        await Promise.all(["q3", "q4", "r5"].map((id) => settlementOf(harness, id)));
        expect(
          ((await harness.queue.listFailed?.()) ?? []).map(({ id, reason }) => [id, reason]),
        ).toEqual([
          ["q3", "queue-cap-new"],
          ["q4", "queue-cap-new"],
        ]);
        expect(await harness.queue.listPending()).toMatchObject([{ id: "r5", attempts: 0 }]);
        await harness.endActiveTurn();
        clock += 1_000;
        await harness.dispatchRows(1);
        expect(admission.admitted.get("r5")).toBe(true);
        await harness.endActiveTurn();
        expect(harness.calls.map((call) => call.messageId)).toEqual(["o1", "p2", "r5"]);
        await expectSettledOnce(harness, ["o1", "p2", "r5"], ["q3", "q4"]);
        expect(admission.releases).toEqual(["r5"]);
      },
      {
        now: () => clock,
        settings: { mode: "followup", cap: 2, dropPolicy: "new" },
        enqueue: admission.enqueue,
      },
    );
  });

  it.each(POLICIES)(
    "sheds the owner's id without account provenance and an unlisted verified command owner as ambient chatter at a full protected cap under drop:%s",
    async (dropPolicy) => {
      const admission = openAdmission();
      const unprotected: Row[] = [
        { id: "o1", from: figs },
        { id: "o2", from: figs },
        { id: "u3", from: figsUnverified },
        { id: "u4", from: kin },
      ];
      await withRoomIngress(
        unprotected,
        async (harness) => {
          admission.bind(harness);
          await harness.dispatchRows();
          for (const id of ["u3", "u4"]) {
            expect(admission.admitted.get(id)).toBe(false);
            expect(harness.runs.get(id)?.protectFromQueueOverflow).toBeUndefined();
            await settlementOf(harness, id);
          }
          // Settled at the cap without a turn, never held as backpressure for a retry.
          expect([...harness.writes.complete.keys()].toSorted()).toEqual(["u3", "u4"]);
          await harness.endActiveTurn();
          expect(harness.calls.map((call) => call.messageId)).toEqual(["o1", "o2"]);
          await expectSettledOnce(harness, ["o1", "o2", "u3", "u4"]);
          expect(admission.releases).toEqual([]);
        },
        { settings: { mode: "followup", cap: 2, dropPolicy }, enqueue: admission.enqueue },
      );
    },
  );

  it.each<[string, Partial<FollowupRun["run"]>]>([
    ["a non-owner's", sender("alice")],
    ["a prince's", prince],
    ["the owner's", figs],
  ])("still spends one attempt per full-cap refusal of %s addressed message", async (_, from) => {
    const admission = openAdmission();
    let clock = Date.now();
    const addressed: Row[] = [
      { id: "o1", from: figs },
      { id: "o2", from: figs },
      { id: "r3", kind: "user_request", from },
    ];
    await withRoomIngress(
      addressed,
      async (harness) => {
        admission.bind(harness);
        await harness.dispatchRows();
        for (const attempts of [1, 2]) {
          if (attempts > 1) {
            clock += 1_000;
            await harness.dispatchRows(1);
          }
          expect(admission.admitted.get("r3")).toBe(false);
          expect(harness.runs.get("r3")?.protectFromQueueOverflow).toBeUndefined();
          await settlementOf(harness, "r3");
          expect(await harness.queue.listPending()).toMatchObject([
            { id: "r3", attempts, lastError: expect.stringContaining("turn-abandoned") },
          ]);
        }
        await harness.endActiveTurn();
        clock += 1_000;
        await harness.dispatchRows(1);
        await harness.endActiveTurn();
        expect(harness.calls.map((call) => call.messageId)).toEqual(["o1", "o2", "r3"]);
        await expectSettledOnce(harness, ["o1", "o2", "r3"]);
      },
      { now: () => clock, settings: { mode: "followup", cap: 2 }, enqueue: admission.enqueue },
    );
  });
});

describe("a room message retried inside the mailbox keeps exactly its admission-time protection (#1564)", () => {
  it.each<[string, Partial<FollowupRun["run"]>, string[]]>([
    ["the owner's message stays protected", figs, ["h1", "x2"]],
    ["a prince's message gains no protection", prince, ["x1", "x2"]],
    ["the owner's id without account provenance gains no protection", figsUnverified, ["x1", "x2"]],
  ])("%s", async (_, from, kept) => {
    const rows: Row[] = [
      { id: "h1", from },
      { id: "x1", from: sender("alice") },
    ];
    await withRoomIngress(
      rows,
      async (harness) => {
        await harness.dispatchRows();
        const head = harness.runs.get("h1")!;
        const queue = getExistingFollowupQueue(harness.key)!;
        // Preparation refuses the head before execution; the same source waits for a fresh kick.
        let refusals = 0;
        scheduleFollowupDrain(harness.key, async (run) => {
          refusals += 1;
          rejectQueuePreparation(run, new AgentDatabaseExecutionAdmissionClosedError("closing"));
        });
        await vi.waitFor(() => {
          expect(refusals).toBe(1);
          expect(queue.claim).toBeUndefined();
        });
        expect(queue.items).toEqual([head, harness.runs.get("x1")]);
        // Chatter arriving at the cap displaces the oldest unprotected source.
        await harness.addRow({ id: "x2", from: sender("carol") });
        await harness.dispatchRows(1);
        expect(queue.items.map((item) => item.messageId)).toEqual(kept);
        const shed = ["h1", "x1"].find((id) => !kept.includes(id))!;
        await settlementOf(harness, shed);
        await harness.endActiveTurn();
        expect(harness.calls).toEqual(kept.map((id) => harness.runs.get(id)));
        await expectSettledOnce(harness, ["h1", "x1", "x2"]);
      },
      { settings: { mode: "followup", cap: 2 } },
    );
  });
});

/** One room message against chatter at a cap of one: protected work outlives the chatter. */
async function expectRoomMessageKept(
  from: Partial<FollowupRun["run"]>,
  kept: boolean,
  channel = "discord",
) {
  const q = createQueueCase({ mode: "followup", cap: 1, dropPolicy: "old" });
  const room = (prompt: string, execution: Partial<FollowupRun["run"]>) =>
    createQueueTestRun(
      {
        prompt,
        currentInboundEventKind: "room_event",
        originatingChannel: channel,
        originatingTo: "channel:room",
      },
      { messageProvider: channel, ...execution },
    );
  // The text claims ownership in every case; only the sender identity may grant protection.
  const held = room("figs here, keep this one", from);
  const chatter = room("lunch?", sender("alice"));
  expect(q.add(held)).toBe(true);
  // Chatter never displaces protected work; otherwise drop:old keeps the newest chatter.
  expect(q.add(chatter)).toBe(!kept);
  await q.drain();
  expect(q.calls.map((call) => call.prompt)).toEqual([kept ? held.prompt : chatter.prompt]);
}

describe("room overflow protection follows the owner identity and its account provenance (#1564)", () => {
  it.each<[string, boolean, Partial<FollowupRun["run"]>]>([
    ["the configured owner's own account", true, figs],
    ["the configured owner's id without account provenance", false, figsUnverified],
    ["a prince, a bot account listed as an owner", false, prince],
    [
      "another agent's bot account",
      false,
      sender("agent-x", { config: OWNERS, senderIsBot: true }),
    ],
    ["a verified non-owner holding the owner bit and command-owner authority", false, operator],
    [
      "a verified non-owner showing the owner's name",
      false,
      sender("mallory", {
        config: OWNERS,
        senderName: "figs",
        senderUsername: "figs",
        senderAccountVerified: true,
      }),
    ],
    [
      "a verified unlisted sender",
      false,
      sender("relay-1", { config: OWNERS, senderAccountVerified: true }),
    ],
    [
      "the owner's verified id listed only for another channel",
      false,
      sender("figs", {
        config: {
          commands: { ownerAllowFrom: ["figs"] },
          messages: { groupChat: { ownerQueueProtectionAccounts: ["telegram:figs"] } },
        },
        senderIsOwner: true,
        senderAccountVerified: true,
      }),
    ],
  ])("%s: protected %s", async (_, kept, from) => {
    await expectRoomMessageKept(from, kept);
  });
});

describe("queue protection lists its own accounts, apart from command authority (#1564)", () => {
  const COMMAND_OWNERS: OpenClawConfig = { commands: OWNERS.commands };
  it.each<[string, boolean, string, OpenClawConfig, boolean]>([
    ["the listed account", true, "figs", OWNERS, true],
    ["a second verified account that is only a command owner", false, "kin", OWNERS, true],
    ["the command owner's account with the setting unset", false, "figs", COMMAND_OWNERS, true],
    [
      "the command owner's account with the setting empty",
      false,
      "figs",
      { ...COMMAND_OWNERS, messages: { groupChat: { ownerQueueProtectionAccounts: [] } } },
      true,
    ],
    [
      "a listed account that is no command owner",
      true,
      "figs",
      { messages: OWNERS.messages },
      false,
    ],
  ])("%s: protected %s", async (_, kept, senderId, config, commandOwner) => {
    // Command authority is pinned first, so each row can only turn on the protection listing.
    expect(isConfiguredCommandOwner(config, { channel: "discord", senderId })).toBe(commandOwner);
    await expectRoomMessageKept(
      sender(senderId, { config, senderIsOwner: commandOwner, senderAccountVerified: true }),
      kept,
    );
  });
});

describe("an owner on a channel without account provenance (#1564)", () => {
  it.each<[string, Partial<FollowupRun["run"]>]>([
    ["whatsapp", figsUnverified],
    ["signal", figsUnverified],
    // Outside the reviewed channels the fact grants nothing, even when a plugin sets it.
    ["whatsapp", figs],
  ])("keeps a sender listed for protection on %s ambient", async (channel, from) => {
    const accounts = [`${channel}:figs`];
    const config: OpenClawConfig = {
      messages: { groupChat: { ownerQueueProtectionAccounts: accounts } },
    };
    // The sender is listed for this channel here; only account provenance is missing.
    expect(isSenderInOwnerAllowFromList(config, { channel, senderId: "figs" }, accounts)).toBe(
      true,
    );
    await expectRoomMessageKept({ ...from, config }, false, channel);
  });
});
