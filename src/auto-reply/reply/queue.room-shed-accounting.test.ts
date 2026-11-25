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
      const line = (prompt: string) =>
        createQueueTestRun({ prompt, currentInboundEventKind: "room_event" });
      q.add(createQueueTestRun({ prompt: "@bot status?" }));
      q.add(line("before the first try"));
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

  it("records a refusal durable ingress retries", async () => {
    // A listed account's line (#1564) fills the cap, so a request is refused rather than dropped.
    const listed = sender("figs", {
      senderAccountVerified: true,
      config: { messages: { groupChat: { ownerQueueProtectionAccounts: ["discord:figs"] } } },
    });
    const ref: { harness?: Harness } = {};
    await withRoomIngress(
      [{ id: "p1", from: listed }, ask("q2")],
      async (harness) => {
        ref.harness = harness;
        await harness.dispatchRows();
        expect(records).toEqual([
          expect.objectContaining({
            level: "info",
            roomEvent: false,
            disposition: "queue-cap",
            outcome: "refused",
          }),
        ]);
        await harness.runs.get("q2")?.controllerInput?.settlement.promise;
        expect(await harness.queue.listPending()).toMatchObject([{ id: "q2", attempts: 1 }]);
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

  it("records a principal line held over the cap once, with no shed disposition", async () => {
    const principal: Row = {
      id: "p2",
      from: sender("figs", { senderIsOwner: true, senderAccountVerified: true }),
    };
    await overflow([ask("q1"), principal], { cap: 1, dropPolicy: "new" }, (_, dispositions) => {
      expect(dispositions).toEqual([]);
      expect(records).toEqual([
        expect.objectContaining({ level: "info", roomEvent: true, outcome: "held" }),
      ]);
    });
  });
});
