// Frond (karmaterminal, #1415): whatever the drop policy, each message the queue cap sheds leaves one
// record and one settled receipt, and the turn that outlives a shed room line states it. Real durable
// ingress feeds the real session mailbox; only the model turn and the Discord transport are replaced.
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { onGatewayWorkMetricsChanged } from "../../infra/gateway-work-metrics-events.js";
import { diagnosticLogger } from "../../logging/diagnostic-runtime.js";
import { clearCurrentPluginMetadataSnapshot } from "../../plugins/current-plugin-metadata-state.js";
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
  aggregated,
  createRoomRun,
  expectSettledOnce,
  modelInput,
  optedIn,
  peer,
  sender,
  shedContext,
  shedCounts,
  textOf,
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
const chatter = (id: string, from = sender("alice")): Row => ({ id, from });

/** Dispatches every row into a full queue, ends the turn, and returns what the cap decided. */
async function overflow(
  rows: readonly Row[],
  settings: Partial<QueueSettings>,
  check: (
    harness: Harness,
    dispositions: Array<[id: string, disposition: string]>,
  ) => Promise<void> | void,
  execute?: (run: FollowupRun, harness: Harness) => Promise<void>,
) {
  const dispositions: Array<[id: string, disposition: string]> = [];
  const ref: { harness?: Harness } = {};
  await withRoomIngress(
    rows,
    async (harness) => {
      ref.harness = harness;
      await harness.dispatchRows();
      await harness.endActiveTurn(execute && ((run) => execute(run, harness)));
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

/** One person's messages, as a channel that names its sender admits them. */
const said = (params: Parameters<typeof createQueueTestRun>[0]) =>
  createQueueTestRun(params, { messageProvider: "discord", senderId: "asker" });
const line = (prompt: string) => said({ prompt, currentInboundEventKind: "room_event" });

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
    const rows = [ask("r1"), ...["r2", "r3", "r4", "r5"].map((id) => chatter(id))];
    await overflow(rows, { cap: 2, dropPolicy }, async (harness, dispositions) => {
      const shed = dropPolicy === "new" ? ["r3", "r4", "r5"] : ["r2", "r3", "r4"];
      const disposition = dropPolicy === "new" ? "queue-cap-new" : "queue-cap-old";
      expect(dispositions).toEqual(shed.map((id) => [id, disposition]));
      // Every row ran or is stated: none vanishes between the queue and the turns.
      const ran = rows.map((row) => row.id).filter((id) => !shed.includes(id));
      expect(harness.calls).toEqual(ran.map((id) => harness.runs.get(id)));
      // Only alice's own turn previews alice's lines, the newest min(cap, 20).
      const previewed = dropPolicy === "summarize" ? 2 : 0;
      expect(stated(harness.calls)).toEqual({ shed: shed.length, previewed });
      expect(shedContext(harness.calls[0])).toEqual([]);
      expect(shedContext(harness.calls[1])).toHaveLength(previewed);
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
      const rows = [
        ask("r1"),
        chatter("r2", sender("asker")),
        ...["r3", "r4", "r5", "r6"].map((id) => ask(id)),
      ];
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
      q.add(said({ prompt: "@bot status?" }));
      q.add(line("before the first try"));
      await refuseOnce(q);
      const park = (run: FollowupRun) =>
        enqueueFollowupRun(q.key, run, q.settings, "message-id", undefined, false);
      park(line("before the retry"));
      if (cut) {
        park(said({ prompt: "@bot and now?" }));
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

// 🌊's ruling, 2026-11-25 (karmaterminal/openclaw#1415): a shed preview carries text only to a turn of
// its own sender, or into the opted-in, verified aggregate. Any other turn states a count.
describe("a shed preview stays out of other senders' turns (#1415)", () => {
  const names = ["alice", "bob", "carol", "dave"];
  const listed = optedIn(names);
  const optedOut = (ambientOwnerAggregate: false | undefined) => ({
    messages: { groupChat: { ...listed.messages?.groupChat, ambientOwnerAggregate } },
  });
  const summarize = { dropPolicy: "summarize" } as const;

  type From = (id: string) => Row["from"];
  it.each<[string, From, Partial<QueueSettings>?, string?]>([
    ["nothing configured", (id) => sender(id)],
    ["nothing configured, in followup mode", (id) => sender(id), { mode: "followup" }],
    ["nothing configured, under a steer policy", (id) => sender(id), { mode: "steer" }],
    ["listed bots, opt-in unset", (id) => peer(id, optedOut(undefined))],
    ["listed bots, opted out", (id) => peer(id, optedOut(false))],
    ["opted in, no bot listed", (id) => peer(id, optedIn([]))],
    ["opted in, people listed", (id) => sender(id, { config: listed, senderIsBot: false })],
    ["opted in, bots not verified as bots", (id) => sender(id, { config: listed })],
    [
      "opted in, a person's turn after listed bots' lines",
      (id) => (id < "carol" ? peer(id, listed) : sender(id, { config: listed })),
      {},
      // bob's line may read alice's preview; carol's, which outlives both, may not.
      "previewed",
    ],
    ["opted in, outside collect mode", (id) => peer(id, listed), { mode: "followup" }],
  ])("states only their count: %s", async (_, from, settings, first = "counted") => {
    const rows = names.map((id, index): Row => ({ id: `r${index + 1}`, from: from(id) }));
    await overflow(rows, { cap: 2, ...summarize, ...settings }, async (harness) => {
      expect(harness.calls).toEqual(["r3", "r4"].map((id) => harness.runs.get(id)));
      const [carol, dave] = harness.calls;
      // No other sender's name, id or words.
      expect(modelInput(carol)).not.toMatch(/alice|bob|message r[12]/u);
      expect(modelInput(dave)).not.toMatch(/alice|bob|message r[12]/u);
      // The turn is its sender's own, whole, and states how many room messages were shed.
      expect(carol).toMatchObject({ prompt: textOf(rows[2]!), run: { senderId: "carol" } });
      expect(shedCounts(carol)).toEqual([{ shed: 2, previewed: 0 }]);
      expect(shedCounts(dave)).toEqual([]);
      expect(records.map((record) => record.outcome)).toEqual([first, "counted"]);
      await expectSettledOnce(
        harness,
        rows.map((row) => row.id),
      );
    });
  });

  it("previews each sender's own shed lines in that sender's own turn", async () => {
    const rows = ["alice", "bob", "alice", "bob"].map((id, index) =>
      chatter(`r${index + 1}`, sender(id)),
    );
    await overflow(rows, { cap: 2, ...summarize }, (harness) => {
      expect(harness.calls).toEqual(["r3", "r4"].map((id) => harness.runs.get(id)));
      expect(harness.calls.map((call) => shedContext(call))).toEqual(
        rows
          .slice(0, 2)
          .map((row) => [{ sender: row.from?.senderName, messageId: row.id, text: textOf(row) }]),
      );
      expect(harness.calls.map((call) => shedCounts(call))).toEqual([
        [{ shed: 1, previewed: 1 }],
        [{ shed: 1, previewed: 1 }],
      ]);
      expect(records.map((record) => record.outcome)).toEqual(["previewed", "previewed"]);
    });
  });

  it("counts another sender's line beside the previews a turn holds", async () => {
    const rows = ["alice", "bob", "alice", "carol"].map((id, index) =>
      chatter(`r${index + 1}`, sender(id)),
    );
    await overflow(rows, { cap: 2, ...summarize }, (harness) => {
      const [alice] = harness.calls;
      expect(alice).toBe(harness.runs.get("r3"));
      expect(shedCounts(alice)).toEqual([{ shed: 2, previewed: 1 }]);
      expect(modelInput(alice)).not.toMatch(/bob|message r2/u);
      expect(records.map((record) => record.outcome)).toEqual(["previewed", "counted"]);
    });
  });

  it("previews a sender's shed line in that sender's request, not in one that waits before it", async () => {
    const rows = [ask("q1", sender("bob")), ask("q2", sender("alice")), chatter("r3")];
    await overflow(rows, { cap: 2, ...summarize }, (harness) => {
      expect(harness.calls).toEqual(["q1", "q2"].map((id) => harness.runs.get(id)));
      expect(harness.calls[0]?.currentInboundContext).toBeUndefined();
      expect(shedContext(harness.calls[1])).toEqual([
        { sender: "alice", messageId: "r3", text: textOf(rows[2]!) },
      ]);
    });
  });

  it("drops the text, not the count, of a preview its sender's turn hands on", async () => {
    // r2 sheds into r1's turn of the same sender; bob's requests then push alice's out of the queue.
    const rows = [
      ask("r1", sender("alice")),
      chatter("r2"),
      ...["r3", "r4", "r5"].map((id) => ask(id, sender("bob"))),
    ];
    await overflow(rows, { cap: 1, ...summarize }, (harness) => {
      expect(records[0]).toMatchObject({ outcome: "previewed" });
      expect(stated(harness.calls)).toEqual({ shed: 1, previewed: 0 });
      for (const call of harness.calls) {
        expect(call.run.senderId).toBe("bob");
        expect(modelInput(call)).not.toMatch(/alice|message r2/u);
      }
    });
  });

  const origin = {
    sessionKey: "agent:main:discord:channel:room",
    messageProvider: "discord",
    senderId: "1",
  };
  it.each<[string, Partial<FollowupRun["run"]>, Partial<FollowupRun["run"]>]>([
    [
      "a turn started on the sender's behalf",
      { messageProvider: "discord", senderId: "1", requesterOrigin: origin },
      { messageProvider: "discord", requesterOrigin: origin },
    ],
    ["no sender on either", { messageProvider: "discord" }, { messageProvider: "discord" }],
    [
      "one display name, two accounts",
      { messageProvider: "discord", senderName: "alice", senderId: "1" },
      { messageProvider: "discord", senderName: "alice", senderId: "2" },
    ],
    [
      "one account, another linked person",
      { messageProvider: "discord", senderId: "1", operatorProfileId: "a" },
      { messageProvider: "discord", senderId: "1", operatorProfileId: "b" },
    ],
  ])("treats an unproven sender as another one: %s", async (_, shed, survivor) => {
    const q = createQueueCase({ mode: "followup", cap: 1 });
    q.add(createQueueTestRun({ prompt: "@bot status?" }, survivor));
    q.add(createQueueTestRun({ prompt: "lunch?", currentInboundEventKind: "room_event" }, shed));
    await q.drain();
    expect(modelInput(q.calls[0])).not.toMatch(/lunch|alice/u);
    expect(shedCounts(q.calls[0])).toEqual([{ shed: 1, previewed: 0 }]);
  });

  describe("in a room opted in to the aggregate", () => {
    const bot = (id: string, from: string, source?: Row["source"]): Row => ({
      id,
      from: peer(from, listed),
      source,
    });
    const preview = (row: Row) => ({
      sender: row.from?.senderName,
      messageId: row.id,
      text: textOf(row),
    });

    it("previews listed bots' lines in their aggregate, and in no turn that waits before it", async () => {
      const rows = [
        ask("q1", sender("erin", { config: listed })),
        ...names.map((id, index) => bot(`r${index + 2}`, id)),
      ];
      await overflow(rows, { cap: 3, ...summarize }, (harness) => {
        expect(harness.calls).toHaveLength(2);
        expect(harness.calls[0]).toBe(harness.runs.get("q1"));
        expect(harness.calls[0]?.currentInboundContext).toBeUndefined();
        aggregated(harness.calls[1], rows.slice(3));
        expect(shedContext(harness.calls[1])).toEqual(rows.slice(1, 3).map(preview));
        expect(shedCounts(harness.calls[1])).toEqual([{ shed: 2, previewed: 2 }]);
      });
    });

    it("leaves a listed bot's turn that runs as itself only its own", async () => {
      const rows = [bot("r1", "alice"), bot("r2", "bob"), bot("r3", "bob")];
      await overflow(rows, { cap: 1, ...summarize }, (harness) => {
        expect(harness.calls).toEqual([harness.runs.get("r3")]);
        expect(harness.calls[0]?.run.senderId).toBe("bob");
        expect(modelInput(harness.calls[0])).not.toMatch(/alice|message r1/u);
        expect(shedContext(harness.calls[0])).toEqual([preview(rows[1]!)]);
        expect(shedCounts(harness.calls[0])).toEqual([{ shed: 2, previewed: 1 }]);
      });
    });

    it("states the count in an aggregate that summarizes cut lines", async () => {
      const owed = (id: string, from: string): Row => ({
        id,
        from: peer(from, listed, { terminalReplyExpectation: "required" }),
      });
      const rows = [
        owed("r1", "alice"),
        owed("r2", "bob"),
        bot("r3", "dave"),
        owed("r4", "alice"),
        owed("r5", "bob"),
      ];
      await overflow(rows, { cap: 2, ...summarize }, (harness) => {
        expect(harness.calls).toHaveLength(2);
        expect(harness.calls[0]?.prompt).toMatch(/^\[Queue overflow\]/u);
        for (const row of rows.slice(0, 2)) {
          expect(harness.calls[0]?.prompt).toContain(
            `(from ${row.from?.senderName}) ${textOf(row)}`,
          );
        }
        expect(modelInput(harness.calls[0])).not.toMatch(/dave|message r3/u);
        expect(harness.calls.map((call) => shedCounts(call))).toEqual([
          [{ shed: 1, previewed: 0 }],
          [],
        ]);
      });
    });

    it("keeps a listed bot's line that would not fold out of the aggregate", async () => {
      const directive = bot("r1", "alice", () => ({ ambientRoomProse: false }));
      const rows = [directive, bot("r2", "alice"), bot("r3", "bob")];
      await overflow(rows, { cap: 2, ...summarize }, (harness) => {
        expect(harness.calls).toHaveLength(1);
        aggregated(harness.calls[0], rows.slice(1));
        expect(modelInput(harness.calls[0])).not.toContain(textOf(directive));
        expect(shedCounts(harness.calls[0])).toEqual([{ shed: 1, previewed: 0 }]);
      });
    });

    it("keeps it out of an aggregate its sender's refused turn joins", async () => {
      const directive = bot("r1", "alice", () => ({ ambientRoomProse: false }));
      const rows = [directive, bot("r2", "alice")];
      const check = (harness: Harness) => {
        const [refused, retry] = harness.calls;
        expect(harness.calls).toHaveLength(2);
        expect(refused).toBe(harness.runs.get("r2"));
        aggregated(retry, [rows[1]!, bot("r3", "bob")]);
        expect(modelInput(retry)).not.toContain(textOf(directive));
        expect(shedCounts(retry)).toEqual([{ shed: 1, previewed: 0 }]);
      };
      await overflow(rows, { cap: 1, ...summarize }, check, async (run, harness) => {
        if (harness.calls.length > 0) {
          await harness.adoptAndRecord(run);
          return;
        }
        harness.calls.push(run);
        // bob speaks while the room waits out the refusal.
        const { key, settings } = harness;
        enqueueFollowupRun(key, createRoomRun(key, bot("r3", "bob")), settings, "message-id");
        rejectQueuePreparation(run, new Error("reply lane not ready"));
      });
    });

    it("previews a listed bot's line in its own request before an aggregate that may split", async () => {
      const rows = [
        bot("r1", "alice"),
        bot("r2", "bob"),
        ask("q3", peer("alice", listed)),
        ask("q4", sender("erin", { config: listed })),
      ];
      await overflow(rows, { cap: 3, ...summarize }, (harness) => {
        expect(harness.calls).toEqual(["q3", "q4", "r2"].map((id) => harness.runs.get(id)));
        expect(harness.calls.map((call) => shedContext(call))).toEqual([
          [preview(rows[0]!)],
          [],
          [],
        ]);
        expect(records).toMatchObject([{ outcome: "previewed" }]);
      });
    });

    it("gives no member its aggregate's previews when the plugin gate closes on the claim", async () => {
      const rows = ["alice", "bob", "carol"].map((id, index) => bot(`r${index + 1}`, id));
      const key = `agent:main:discord:channel:room:${expect.getState().currentTestName}`;
      const stop = onGatewayWorkMetricsChanged(() => {
        if ((getExistingFollowupQueue(key)?.claim?.sources.length ?? 0) > 1) {
          clearCurrentPluginMetadataSnapshot();
        }
      });
      onTestFinished(stop);
      await overflow(rows, { cap: 2, ...summarize }, (harness) => {
        expect(harness.calls).toEqual(["r2", "r3"].map((id) => harness.runs.get(id)));
        expect(modelInput(harness.calls[0])).not.toMatch(/alice|message r1/u);
        expect(harness.calls.map((call) => shedCounts(call))).toEqual([
          [{ shed: 1, previewed: 0 }],
          [],
        ]);
      });
    });

    it.each(["together", "alone"])(
      "re-reads them only in an aggregate, its members retried %s",
      async (retried) => {
        const left = new AbortController();
        const rows = [
          bot("r1", "alice"),
          bot("r2", "bob"),
          bot("r3", "carol", () => ({ abortSignal: left.signal })),
        ];
        const check = (harness: Harness) => {
          const [refused, retry] = harness.calls;
          expect(harness.calls).toHaveLength(2);
          aggregated(refused, rows.slice(1));
          expect(shedContext(refused)).toEqual([preview(rows[0]!)]);
          if (retried === "together") {
            aggregated(retry, rows.slice(1));
            expect(retry?.currentInboundContext).toEqual(refused?.currentInboundContext);
          } else {
            expect(retry).toBe(harness.runs.get("r2"));
            expect(modelInput(retry)).not.toMatch(/alice|message r1/u);
            expect(shedCounts(retry)).toEqual([{ shed: 1, previewed: 0 }]);
          }
        };
        await overflow(rows, { cap: 2, ...summarize }, check, async (run, harness) => {
          if (harness.calls.length > 0) {
            await harness.adoptAndRecord(run);
            return;
          }
          harness.calls.push(run);
          if (retried === "alone") {
            left.abort();
          }
          rejectQueuePreparation(run, new Error("reply lane not ready"));
        });
      },
    );
  });
});

describe("a count stays with one turn (#1415)", () => {
  it("is not handed on again while the summary turn that states it runs", async () => {
    const q = createQueueCase({ mode: "followup", cap: 1, dropPolicy: "summarize" });
    const request = (prompt: string) => said({ prompt });
    q.add(request("q1"));
    q.add(said({ prompt: "lunch?", currentInboundEventKind: "room_event" }));
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
      said({
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
    park(said({ prompt: "q1" }));
    park(line("lunch?"));
    const calls: FollowupRun[] = [];
    scheduleFollowupDrain(q.key, async (run) => {
      calls.push(run);
      if (calls.length === 1) {
        // q1's turn has read its notice; its recovery finds the queue full again.
        park(said({ prompt: "q2" }));
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
    const steer = said({ prompt: "steer" });
    submitSessionControllerInput(q.key, steer, q.settings);
    const park = (run: FollowupRun) =>
      enqueueFollowupRun(q.key, run, q.settings, "message-id", undefined, false);
    park(said({ prompt: "carrier" }));
    park(said({ prompt: "lunch?", currentInboundEventKind: "room_event" }));
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
        expect(stated(harness.calls)).toEqual({ shed: 1, previewed: 0 });
        expect(records).toMatchObject([{ roomEvent: true, outcome: "counted" }]);
        await expectSettledOnce(harness, ["q1", "r2"]);
      });
    },
  );
});
