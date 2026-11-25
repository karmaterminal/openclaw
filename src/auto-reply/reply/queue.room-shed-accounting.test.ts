// Frond (karmaterminal, #1415): whatever the drop policy, each message the queue cap sheds leaves one
// record and one settled receipt, and the turn that outlives a shed room line states it. Real durable
// ingress feeds the real session mailbox; only the model turn and the Discord transport are replaced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diagnosticLogger } from "../../logging/diagnostic-runtime.js";
import { submitSessionControllerInput } from "../../sessions/session-controller.mailbox.js";
import { testing as controllerTesting } from "../../sessions/session-controller.test-support.js";
import { AgentDatabaseExecutionAdmissionClosedError } from "../../state/agent-database-admission-error.js";
import { createQueueCase } from "./queue.case.test-support.js";
import {
  enqueueFollowupRun,
  reserveSteerCandidate,
  scheduleFollowupDrain,
  type FollowupRun,
  type QueueSettings,
} from "./queue.js";
import {
  createRoomRun,
  expectSettledOnce,
  sender,
  shedContext,
  shedCounts,
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
import { buildTranscriptFollowupRun } from "./transcript-followup-run.js";

installQueueRuntimeErrorSilencer();

const POLICIES = ["old", "summarize", "new"] as const satisfies readonly NonNullable<
  QueueSettings["dropPolicy"]
>[];

type ShedRecord = { level: "info" | "warn"; disposition?: unknown; [field: string]: unknown };
const records: ShedRecord[] = [];

beforeEach(() => {
  records.length = 0;
  for (const level of ["info", "warn"] as const) {
    vi.spyOn(diagnosticLogger, level).mockImplementation((message, meta) => {
      if (message === "followup queue capacity") {
        records.push({ level, ...meta });
      }
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  controllerTesting.resetSessionControllerForTest();
});

const ask = (id: string, from = sender("asker")): Row => ({
  id,
  kind: "user_request",
  from,
  // Each request keeps its own turn, so the turns name the rows that ran.
  source: () => ({ disableCollectBatching: true }),
});
const chatter = (id: string): Row => ({ id, from: sender("alice") });

/** Dispatches every row into a full queue, ends the turn, and returns what the cap decided. */
async function overflow(
  rows: readonly Row[],
  settings: Partial<QueueSettings>,
  check: (
    harness: Harness,
    dispositions: Array<[id: string, disposition: string]>,
  ) => Promise<void> | void,
) {
  const dispositions: Array<[id: string, disposition: string]> = [];
  const ref: { harness?: Harness } = {};
  await withRoomIngress(
    rows,
    async (harness) => {
      ref.harness = harness;
      await harness.dispatchRows();
      await harness.endActiveTurn();
      await check(harness, dispositions);
    },
    {
      settings: { mode: "collect", ...settings },
      enqueue: (row, lifecycle) => {
        const { key, settings: queueSettings } = ref.harness!;
        const run = createRoomRun(key, row, lifecycle);
        run.onQueueDisposition = (disposition) => dispositions.push([row.id, disposition]);
        enqueueFollowupRun(key, run, queueSettings, "message-id", undefined, false);
        return run;
      },
    },
  );
}

/** The room messages the turns together say the cap shed, and how many of them they preview. */
function stated(calls: readonly FollowupRun[]) {
  const counts = calls.flatMap((call) => shedCounts(call));
  return {
    shed: counts.reduce((total, count) => total + count.shed, 0),
    previewed: counts.reduce((total, count) => total + count.previewed, 0),
  };
}

const line = (prompt: string) =>
  createQueueTestRun({ prompt, currentInboundEventKind: "room_event" });

/** Refuses the queued head before execution; it waits, its context attached, for a fresh kick. */
async function refuseOnce(q: ReturnType<typeof createQueueCase>) {
  let refused = false;
  scheduleFollowupDrain(q.key, async (run) => {
    refused = true;
    rejectQueuePreparation(run, new AgentDatabaseExecutionAdmissionClosedError("closing"));
  });
  const queue = getExistingFollowupQueue(q.key)!;
  await vi.waitFor(() => {
    expect(refused).toBe(true);
    expect(queue.claim).toBeUndefined();
  });
}

describe("shed room chatter is counted under every drop policy (#1415)", () => {
  it.each(POLICIES)("states and records each shed line once under drop:%s", async (dropPolicy) => {
    const rows = [ask("r1"), ...["r2", "r3", "r4", "r5"].map(chatter)];
    await overflow(rows, { cap: 2, dropPolicy }, async (harness, dispositions) => {
      const shed = dropPolicy === "new" ? ["r3", "r4", "r5"] : ["r2", "r3", "r4"];
      const disposition = dropPolicy === "new" ? "queue-cap-new" : "queue-cap-old";
      expect(dispositions).toEqual(shed.map((id) => [id, disposition]));
      // Every row ran or is stated: none vanishes between the queue and the turns.
      const ran = rows.map((row) => row.id).filter((id) => !shed.includes(id));
      expect(harness.calls).toEqual(ran.map((id) => harness.runs.get(id)));
      // Each turn previews the newest min(cap, 20).
      const previewed = dropPolicy === "summarize" ? 2 : 0;
      expect(stated(harness.calls)).toEqual({ shed: shed.length, previewed });
      expect(shedContext(harness.calls[0])).toHaveLength(previewed);
      expect(records).toEqual(
        shed.map(() =>
          expect.objectContaining({
            level: "info",
            sessionKey: harness.key,
            roomEvent: true,
            dropPolicy,
            disposition,
            outcome: dropPolicy === "summarize" ? "previewed" : "counted",
          }),
        ),
      );
      await expectSettledOnce(
        harness,
        rows.map((row) => row.id),
      );
    });
  });

  it("carries other senders' shed lines as background of a turn that stays its sender's own", async () => {
    // No opt-in: nothing crosses senders but the bounded previews drop:summarize states (#191733).
    const senders = ["alice", "bob", "carol", "dave"];
    const rows = senders.map((id, index): Row => ({ id: `r${index + 1}`, from: sender(id) }));
    await overflow(rows, { cap: 2, dropPolicy: "summarize" }, (harness) => {
      expect(harness.calls).toEqual(["r3", "r4"].map((id) => harness.runs.get(id)));
      expect(shedContext(harness.calls[0])).toMatchObject([{ sender: "alice" }, { sender: "bob" }]);
      expect(harness.calls[0]?.run.senderId).toBe("carol");
      expect(shedContext(harness.calls[1])).toEqual([]);
    });
  });

  it.each(["old", "summarize"] as const)(
    "keeps the count when the request carrying it is itself cut under drop:%s",
    async (dropPolicy) => {
      // r2 is shed into r1's turn; r3 to r6 then push requests out of a queue full of requests.
      const rows = [ask("r1"), chatter("r2"), ...["r3", "r4", "r5", "r6"].map((id) => ask(id))];
      await overflow(rows, { cap: 1, dropPolicy }, async (harness) => {
        expect(stated(harness.calls)).toEqual({
          shed: 1,
          previewed: dropPolicy === "summarize" ? 1 : 0,
        });
      });
    },
  );

  it.each(POLICIES)(
    "records a line with no surviving turn in its room as unstated under drop:%s",
    async (dropPolicy) => {
      const elsewhere = { originatingThreadId: "elsewhere" };
      const rows: Row[] = [
        { ...ask("r1"), source: () => ({ disableCollectBatching: true, ...elsewhere }) },
        chatter("r2"),
      ];
      await overflow(rows, { cap: 1, dropPolicy }, async (harness, dispositions) => {
        expect(dispositions).toEqual([["r2", "queue-cap-new"]]);
        // Another room's turn never carries this room's gap.
        expect(stated(harness.calls)).toEqual({ shed: 0, previewed: 0 });
        expect(records).toEqual([
          expect.objectContaining({
            level: "warn",
            roomEvent: true,
            dropPolicy,
            disposition: "queue-cap-new",
            outcome: "unstated",
            unstated: 1,
          }),
        ]);
        await expectSettledOnce(harness, ["r1", "r2"]);
      });
    },
  );

  it.each([
    ["old", false],
    ["summarize", false],
    ["new", false],
    ["old", true],
  ] as const)(
    "states lines shed while their turn waits to retry beside those it already stated under drop:%s, cut %s",
    async (dropPolicy, cut) => {
      const q = createQueueCase({ mode: "followup", cap: 1, dropPolicy });
      q.add(createQueueTestRun({ prompt: "@bot status?" }));
      q.add(line("before the first try"));
      await refuseOnce(q);
      const park = (run: FollowupRun) =>
        enqueueFollowupRun(q.key, run, q.settings, "message-id", undefined, false);
      park(line("before the retry"));
      if (cut) {
        park(createQueueTestRun({ prompt: "@bot and now?" }));
      }
      await q.drain();
      const previewed = dropPolicy === "summarize" ? 1 : 0;
      expect(shedCounts(q.calls[0])).toEqual(
        cut
          ? // The request that replaces it never ran beside either notice, so it states both.
            [{ shed: 2, previewed: 0 }]
          : [
              { shed: 1, previewed },
              { shed: 1, previewed },
            ],
      );
    },
  );
});

describe("a count stays with one turn (#1415)", () => {
  it("is not handed on again while the summary turn that states it runs", async () => {
    const q = createQueueCase({ mode: "followup", cap: 1, dropPolicy: "summarize" });
    const request = (prompt: string) => createQueueTestRun({ prompt });
    q.add(request("q1"));
    q.add(createQueueTestRun({ prompt: "lunch?", currentInboundEventKind: "room_event" }));
    q.add(request("q2"));
    const calls: FollowupRun[] = [];
    scheduleFollowupDrain(q.key, async (run) => {
      calls.push(run);
      if (calls.length === 1) {
        // q1's summary turn is running: cutting q2 elides q1's summary from the queue.
        q.add(request("q3"));
      }
    });
    await vi.waitFor(() => expect(getExistingFollowupQueue(q.key)).toBeUndefined());
    expect(calls.map((call) => shedCounts(call))).toEqual([[{ shed: 1, previewed: 1 }], [], []]);
  });

  it("stays with an elided summary that already states it, beside what that summary hands on", async () => {
    const q = createQueueCase({ mode: "followup", cap: 1, dropPolicy: "summarize" }, 3);
    const park = (run: FollowupRun) =>
      enqueueFollowupRun(q.key, run, q.settings, "message-id", undefined, false);
    // Exclusive admissions never share a summary turn, so each states its own context.
    const request = (prompt: string) =>
      createQueueTestRun({
        prompt,
        turnAdoptionLifecycle: { admission: "exclusive", onAdopted: async () => {} },
      });
    park(request("q1"));
    park(line("before the first try"));
    await refuseOnce(q);
    park(line("before the retry"));
    // q2 cuts q1 to a summary; q3 cuts q2, which elides q1's.
    park(request("q2"));
    park(request("q3"));
    await q.drain();
    expect(q.calls).toHaveLength(3);
    expect(stated(q.calls)).toEqual({ shed: 2, previewed: 2 });
  });

  it("is not stated again for a recovery turn the cap refuses", async () => {
    const q = createQueueCase({ mode: "followup", cap: 1, dropPolicy: "new" });
    const park = (run: FollowupRun, position?: "front") =>
      enqueueFollowupRun(q.key, run, q.settings, "none", undefined, false, { position });
    park(createQueueTestRun({ prompt: "q1" }));
    park(line("lunch?"));
    const calls: FollowupRun[] = [];
    scheduleFollowupDrain(q.key, async (run) => {
      calls.push(run);
      if (calls.length === 1) {
        // q1's turn has read its notice; its recovery finds the queue full again.
        park(createQueueTestRun({ prompt: "q2" }));
        const recovery = buildTranscriptFollowupRun(run, {
          prompt: "recover",
          sourceTool: "test",
          expiredSkillAuthoringMessage: "expired",
        });
        expect(park(recovery, "front")).toBe(false);
      }
    });
    await vi.waitFor(() => expect(getExistingFollowupQueue(q.key)).toBeUndefined());
    expect(calls.map((call) => [call.prompt, shedCounts(call).length])).toEqual([
      ["q1", 1],
      ["q2", 0],
    ]);
    expect(records.at(-1)).toMatchObject({ level: "info", outcome: "dropped" });
  });

  it("passes from a refused request to the turn that keeps its place", async () => {
    const q = createQueueCase({ mode: "followup", cap: 1, dropPolicy: "new" });
    // Reserved first, parked last: the steer's fallback puts it ahead of the request at the cap.
    const steer = createQueueTestRun({ prompt: "steer" });
    submitSessionControllerInput(q.key, steer, q.settings);
    const park = (run: FollowupRun) =>
      enqueueFollowupRun(q.key, run, q.settings, "message-id", undefined, false);
    park(createQueueTestRun({ prompt: "carrier" }));
    park(createQueueTestRun({ prompt: "lunch?", currentInboundEventKind: "room_event" }));
    reserveSteerCandidate(q.key, steer, q.settings, q.runFollowup)!.fallback();
    expect(records).toMatchObject([
      { outcome: "counted", roomEvent: true },
      { outcome: "dropped", disposition: "queue-cap-new", roomEvent: false },
    ]);
    await q.drain();
    expect(q.calls.map((call) => call.prompt)).toEqual(["steer"]);
    expect(shedCounts(q.calls[0])).toEqual([{ shed: 1, previewed: 0 }]);
  });

  it("is recorded as unstated when its turn is cut and no other turn of its room waits", async () => {
    const elsewhere = { disableCollectBatching: true, originatingThreadId: "elsewhere" };
    const rows: Row[] = [ask("r1"), chatter("r2"), { ...ask("r3"), source: () => elsewhere }];
    await overflow(rows, { cap: 1, dropPolicy: "old" }, (harness) => {
      expect(stated(harness.calls)).toEqual({ shed: 0, previewed: 0 });
      expect(records).toMatchObject([
        { level: "info", roomEvent: true, outcome: "counted" },
        { level: "warn", roomEvent: false, outcome: "dropped", unstated: 1 },
      ]);
    });
  });
});

describe("requests the cap cuts are recorded under every drop policy (#1415)", () => {
  const requests = ["q1", "q2", "q3", "q4"].map((id) => ask(id));

  it.each([
    ["old", ["q1", "q2", "q3"], "queue-cap-old", ["q4"]],
    ["new", ["q2", "q3", "q4"], "queue-cap-new", ["q1"]],
    // The newest cut request keeps its summary; the one the summary budget cannot hold is dropped.
    ["summarize", ["q1"], "queue-cap-old", ["q2", "q3", "q4"]],
  ] as const)("under drop:%s", async (dropPolicy, dropped, disposition, completed) => {
    await overflow(requests, { cap: 1, dropPolicy }, async (harness, dispositions) => {
      expect(dispositions).toEqual(dropped.map((id) => [id, disposition]));
      expect(records).toEqual(
        dropped.map(() =>
          expect.objectContaining({
            level: "info",
            sessionKey: harness.key,
            roomEvent: false,
            dropPolicy,
            disposition,
            outcome: "dropped",
          }),
        ),
      );
      // Durable ingress holds the same outcome: a terminal row naming the policy.
      expect(
        ((await harness.queue.listFailed?.()) ?? []).map(({ id, reason }) => [id, reason]),
      ).toEqual(dropped.map((id) => [id, disposition]));
      await expectSettledOnce(harness, [...completed], [...dropped]);
    });
  });

  // A listed account's line (#1564) fills the cap, so the next message is refused, not dropped.
  const listed = sender("figs", {
    senderAccountVerified: true,
    config: { messages: { groupChat: { ownerQueueProtectionAccounts: ["discord:figs"] } } },
  });
  it.each<[string, Row, { roomEvent: boolean; attempts: number }]>([
    ["a request", ask("q2"), { roomEvent: false, attempts: 1 }],
    ["a listed account's line", { id: "q2", from: listed }, { roomEvent: true, attempts: 0 }],
  ])("records a refusal of %s that durable ingress retries", async (_, refused, outcome) => {
    const { roomEvent, attempts } = outcome;
    const ref: { harness?: Harness } = {};
    await withRoomIngress(
      [{ id: "p1", from: listed }, refused],
      async (harness) => {
        ref.harness = harness;
        await harness.dispatchRows();
        expect(records).toEqual([
          expect.objectContaining({
            level: "info",
            roomEvent,
            disposition: "queue-cap",
            outcome: "refused",
          }),
        ]);
        await harness.runs.get("q2")?.controllerInput?.settlement.promise;
        expect(await harness.queue.listPending()).toMatchObject([{ id: "q2", attempts }]);
      },
      {
        settings: { mode: "collect", cap: 1, dropPolicy: "new" },
        enqueue: (row, lifecycle) => {
          const { key, settings } = ref.harness!;
          const run = createRoomRun(key, row, lifecycle);
          enqueueFollowupRun(key, run, settings, "message-id", undefined, false);
          return run;
        },
      },
    );
  });

  it.each(POLICIES)(
    "counts and records an unlisted command owner's shed line like any chatter under drop:%s",
    async (dropPolicy) => {
      const unlisted = sender("figs", { senderIsOwner: true, senderAccountVerified: true });
      const rows: Row[] = [ask("q1"), { id: "r2", from: unlisted }];
      await overflow(rows, { cap: 1, dropPolicy }, async (harness, dispositions) => {
        expect(dispositions).toEqual([["r2", "queue-cap-new"]]);
        expect(stated(harness.calls).shed).toBe(1);
        expect(records).toMatchObject([
          { roomEvent: true, outcome: dropPolicy === "summarize" ? "previewed" : "counted" },
        ]);
        await expectSettledOnce(harness, ["q1", "r2"]);
      });
    },
  );
});
