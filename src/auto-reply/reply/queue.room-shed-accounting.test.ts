// Frond (karmaterminal, #1415): whatever the drop policy, each message the queue cap sheds leaves one
// record and one settled receipt, and the turn that outlives a shed room line states it. Real durable
// ingress feeds the real session mailbox; only the model turn and the Discord transport are replaced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diagnosticLogger } from "../../logging/diagnostic-runtime.js";
import { testing as controllerTesting } from "../../sessions/session-controller.test-support.js";
import { AgentDatabaseExecutionAdmissionClosedError } from "../../state/agent-database-admission-error.js";
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
      if (message === "followup queue shed message at capacity") {
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
            continuity: dropPolicy === "summarize" ? "previewed" : "counted",
          }),
        ),
      );
      await expectSettledOnce(
        harness,
        rows.map((row) => row.id),
      );
    });
  });

  it.each(POLICIES)(
    "keeps the count when the request carrying it is itself cut under drop:%s",
    async (dropPolicy) => {
      // r2 is shed into r1's turn; r4 to r6 then push requests out of a queue full of requests.
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
            continuity: "none",
            unstated: 1,
          }),
        ]);
        await expectSettledOnce(harness, ["r1", "r2"]);
      });
    },
  );

  it.each(POLICIES)(
    "states lines shed while their turn waits to retry beside those it already stated under drop:%s",
    async (dropPolicy) => {
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
      enqueueFollowupRun(
        q.key,
        line("before the retry"),
        q.settings,
        "message-id",
        undefined,
        false,
      );
      await q.drain();
      const each = { shed: 1, previewed: dropPolicy === "summarize" ? 1 : 0 };
      expect(shedCounts(q.calls[0])).toEqual([each, each]);
    },
  );
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
            continuity: "dropped",
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

  it("records a refusal durable ingress will retry", async () => {
    const protectedLine: Row = {
      id: "p1",
      from: sender("figs", {
        senderIsOwner: true,
        senderAccountVerified: true,
        config: { commands: { ownerAllowFrom: ["figs"] } },
      }),
    };
    await withRoomIngress(
      [protectedLine, ask("q2")],
      async (harness) => {
        await harness.dispatchRows(1);
        const ref = harness;
        expect(ref.runs.get("p1")?.protectFromQueueOverflow).toBe(true);
        const refused = createQueueTestRun(
          { prompt: "request", currentInboundEventKind: "user_request" },
          { sessionKey: harness.key },
        );
        expect(
          enqueueFollowupRun(
            harness.key,
            refused,
            harness.settings,
            "message-id",
            undefined,
            false,
          ),
        ).toBe(false);
        expect(records).toEqual([
          expect.objectContaining({
            level: "info",
            roomEvent: false,
            disposition: "queue-cap",
            continuity: "refused",
          }),
        ]);
      },
      { settings: { mode: "collect", cap: 1, dropPolicy: "new" } },
    );
  });
});
