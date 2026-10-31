// Frond (karmaterminal, #1415): room events queued mid-turn over durable ingress collect into one turn.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeferred } from "../../../test/helpers/promise.js";
import type { InboundEventKind } from "../../channels/inbound-event/kind.js";
import {
  bindIngressLifecycleToReplyOptions,
  type ChannelIngressDispatchLifecycle,
} from "../../channels/message/ingress-drain-lifecycle.js";
import { isIngressAdoptionLostError } from "../../channels/message/ingress-drain-state.js";
import { createChannelIngressDrain } from "../../channels/message/ingress-drain.js";
import {
  createTestIngressQueue,
  withTempState,
} from "../../channels/message/ingress-drain.test-helpers.js";
import type { SessionEntry } from "../../config/sessions.js";
import { createReplyOperation } from "../../sessions/session-controller.js";
import { testing as controllerTesting } from "../../sessions/session-controller.test-support.js";
import { parseInlineSessionDirectives } from "./directive-handling.parse.js";
import { prepareReplyRunAdmission } from "./get-reply-run-admission.js";
import { prepareReplyRunContext } from "./get-reply-run-context.js";
import { finalizeInboundContext } from "./inbound-context.js";
import { createModelSelectionStateFixture } from "./model-selection.test-support.js";
import { prepareReplyConversation } from "./prompt-session-context.js";
import {
  admitFollowupRunLifecycle,
  enqueueFollowupRun,
  scheduleFollowupDrain,
  type FollowupRun,
  type QueueSettings,
} from "./queue.js";
import {
  createQueueTestRun,
  installQueueRuntimeErrorSilencer,
  rejectQueuePreparation,
} from "./queue.test-helpers.js";
import { clearFollowupQueue, getExistingFollowupQueue } from "./queue/state.js";
import { bindReplySourceToFollowup, prepareReplySourceInput } from "./reply-source-binding.js";
import { createTypingController } from "./typing.js";

vi.mock("../../agents/auth-profiles/session-override.js", () => ({
  resolveSessionAuthSelection: vi.fn(async () => undefined),
}));
vi.mock("./get-reply-run-helpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./get-reply-run-helpers.js")>()),
  loadAgentRunnerRuntime: async () => ({ runReplyAgent: vi.fn() }),
  loadEmbeddedAgentRuntime: async () => ({
    resolveActiveEmbeddedRunSessionIdBySessionFile: (
      await import("../../agents/embedded-agent-runner/runs.js")
    ).resolveActiveEmbeddedRunSessionIdBySessionFile,
    resolveActiveEmbeddedRunBySessionFile: (
      await import("../../agents/embedded-agent-runner/runs.js")
    ).resolveActiveEmbeddedRunBySessionFile,
  }),
  loadSessionUpdatesRuntime: async () => ({
    ensureSkillSnapshot: async ({ sessionEntry }: { sessionEntry: SessionEntry }) => ({
      sessionEntry,
    }),
  }),
}));

installQueueRuntimeErrorSilencer();
afterEach(() => controllerTesting.resetSessionControllerForTest());

const COLLECT_TITLE = "[Queued messages while agent was busy]";
const ROOM_LANE = "discord:channel:room";

type Row = { id: string; kind?: InboundEventKind };
type Harness = Awaited<ReturnType<typeof openRoomIngress>>;

function textOf(row: Row): string {
  return `${row.kind === "user_request" ? "mention" : "room"} message ${row.id}`;
}

/**
 * Real durable ingress (SQLite rows, drain, exclusive lifecycles) feeding the real
 * session mailbox. Only the model turn and the Discord transport are replaced.
 */
async function openRoomIngress(
  stateDir: string,
  rows: readonly Row[],
  options: {
    settings?: Partial<QueueSettings>;
    supersedes?: (candidateId: string, pendingId: string) => boolean;
    now?: () => number;
    claimLeaseMs?: number;
    enqueue?: (
      row: Row,
      lifecycle: ChannelIngressDispatchLifecycle,
    ) => FollowupRun | Promise<FollowupRun>;
  } = {},
) {
  const key = `agent:main:discord:channel:room:${expect.getState().currentTestName}`;
  const settings: QueueSettings = {
    mode: "collect",
    debounceMs: 0,
    cap: 50,
    dropPolicy: "old",
    ...options.settings,
  };
  const queue = createTestIngressQueue(stateDir, options.now ? { now: options.now } : {});
  const byId = new Map(rows.map((row) => [row.id, row]));
  // Durable commit and dead-letter writes, counted at the queue owner.
  const writes = { complete: new Map<string, number>(), fail: new Map<string, number>() };
  const record = (counts: Map<string, number>, ref: string | { id: string }) => {
    const id = typeof ref === "string" ? ref : ref.id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  const complete = queue.complete.bind(queue);
  queue.complete = async (...args: Parameters<typeof complete>) => {
    record(writes.complete, args[0]);
    return await complete(...args);
  };
  const fail = queue.fail.bind(queue);
  queue.fail = async (...args: Parameters<typeof fail>) => {
    record(writes.fail, args[0]);
    return await fail(...args);
  };
  const addRow = async (row: Row) => {
    byId.set(row.id, row);
    await queue.enqueue(row.id, { text: textOf(row) }, { laneKey: ROOM_LANE });
  };
  for (const row of rows) {
    await addRow(row);
  }
  const runs = new Map<string, FollowupRun>();
  let dispatched = createDeferred();
  const enqueueRoomRun = (row: Row, lifecycle: ChannelIngressDispatchLifecycle) => {
    const { turnAdoptionLifecycle } = bindIngressLifecycleToReplyOptions(lifecycle);
    const run = createQueueTestRun(
      {
        prompt: textOf(row),
        messageId: row.id,
        originatingChannel: "discord",
        originatingTo: "channel:room",
        originatingChatType: "channel",
        currentInboundEventKind: row.kind ?? "room_event",
        turnAdoptionLifecycle,
        // Room events inherit the ingress admission fence as their queued cancel signal.
        abortSignal: turnAdoptionLifecycle.abortSignal,
      },
      { sessionKey: key, senderId: "peer", messageProvider: "discord" },
    );
    // A mid-turn source waits behind the active turn; the turn's end starts the drain.
    expect(enqueueFollowupRun(key, run, settings, "message-id", undefined, false)).toBe(true);
    return run;
  };
  const drain = createChannelIngressDrain({
    queue,
    deferredLaneOccupancy: "release",
    retryPolicy: { baseMs: 1, maxMs: 1 },
    ...(options.now ? { now: options.now } : {}),
    ...(options.claimLeaseMs ? { claimLeaseMs: options.claimLeaseMs } : {}),
    ...(options.supersedes
      ? {
          shouldSupersedePending: (candidate: { id: string }, pending: { id: string }): boolean =>
            options.supersedes!(candidate.id, pending.id),
        }
      : {}),
    dispatchClaimedEvent: async (event, lifecycle) => {
      const row = byId.get(event.id) ?? { id: event.id };
      runs.set(row.id, await (options.enqueue ?? enqueueRoomRun)(row, lifecycle));
      dispatched.resolve();
      dispatched = createDeferred();
      return { kind: "deferred" as const };
    },
  });
  /** Discord releases the lane at deferral, so each pass claims the next row. */
  const dispatchRows = async (count = rows.length) => {
    for (let index = 0; index < count; index += 1) {
      const next = dispatched.promise;
      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await next;
    }
  };
  const calls: FollowupRun[] = [];
  /** Production adoption point: the turn adopts its sources before model work. */
  const adoptAndRecord = async (run: FollowupRun) => {
    calls.push(run);
    await admitFollowupRunLifecycle(run);
  };
  /** The active room turn ends; its successor drains the mailbox. */
  const endActiveTurn = async (execute: (run: FollowupRun) => Promise<void> = adoptAndRecord) => {
    const settlements = (getExistingFollowupQueue(key)?.entries ?? []).map(
      (input) => input.settlement.promise,
    );
    scheduleFollowupDrain(key, execute);
    await Promise.allSettled(settlements);
    await vi.waitFor(() => expect(getExistingFollowupQueue(key)).toBeUndefined());
    await drain.waitForIdle();
  };
  return {
    key,
    queue,
    drain,
    addRow,
    writes,
    runs,
    calls,
    dispatchRows,
    adoptAndRecord,
    endActiveTurn,
    dispose: () => {
      drain.dispose();
      clearFollowupQueue(key);
    },
  };
}

async function withRoomIngress(
  rows: readonly Row[],
  run: (harness: Harness) => Promise<void>,
  options?: Parameters<typeof openRoomIngress>[2],
): Promise<void> {
  await withTempState(async (stateDir) => {
    const harness = await openRoomIngress(stateDir, rows, options);
    try {
      await run(harness);
    } finally {
      harness.dispose();
    }
  });
}

function collected(run: FollowupRun | undefined, rows: readonly Row[]) {
  expect(run?.prompt.startsWith(COLLECT_TITLE)).toBe(true);
  for (const [index, row] of rows.entries()) {
    expect(run?.prompt).toContain(`Queued #${index + 1} (from `);
    expect(run?.prompt).toContain(textOf(row));
  }
  expect(run?.prompt).not.toContain(`Queued #${rows.length + 1}`);
}

async function expectSettledOnce(harness: Harness, completed: string[], failed: string[] = []) {
  expect(Object.fromEntries(harness.writes.complete)).toEqual(
    Object.fromEntries(completed.map((id) => [id, 1])),
  );
  expect(Object.fromEntries(harness.writes.fail)).toEqual(
    Object.fromEntries(failed.map((id) => [id, 1])),
  );
  expect(await harness.queue.listPending()).toEqual([]);
  expect(await harness.queue.listClaims()).toEqual([]);
}

const burst: Row[] = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];

describe("mid-turn room events over durable ingress (#1415)", () => {
  describe("admission keeps the configured queue mode", () => {
    async function admitRoomEvent(params: {
      stateDir: string;
      mode: QueueSettings["mode"];
      sessionKey: string;
      lifecycle: ChannelIngressDispatchLifecycle;
      row: Row;
    }): Promise<FollowupRun> {
      const { mode, sessionKey, lifecycle, row } = params;
      const storePath = `${params.stateDir}/agents/main/sessions/sessions.json`;
      const entry: SessionEntry = { sessionId: "room-session", updatedAt: 1 };
      const body = textOf(row);
      const cfg = {
        session: { store: storePath },
        messages: {
          queue: {
            mode: "steer" as const,
            byChannel: { discord: mode },
            debounceMsByChannel: { discord: 0 },
          },
        },
      };
      const ctx = finalizeInboundContext({
        SessionKey: sessionKey,
        Provider: "discord",
        Surface: "discord",
        ChatType: "channel",
        InboundEventKind: row.kind ?? "room_event",
        MessageSid: row.id,
        SenderId: "peer",
        Body: body,
        RawBody: body,
        CommandBody: body,
        BodyStripped: body,
      });
      // Dispatch reserves the physical source before preparation (reply-source-binding).
      const source = await prepareReplySourceInput(
        ctx,
        cfg,
        bindIngressLifecycleToReplyOptions(lifecycle),
      );
      const context = await prepareReplyRunContext({
        ctx,
        sessionCtx: ctx,
        conversation: prepareReplyConversation({ ctx, sessionEntry: entry }),
        sessionEntry: entry,
        cfg,
        agentId: "main",
        agentDir: `${params.stateDir}/agents/main/agent`,
        agentCfg: {},
        sessionCfg: {},
        commandAuthorized: true,
        command: {
          surface: "discord",
          channel: "discord",
          ownerList: [],
          senderIsOwner: false,
          isAuthorizedSender: true,
          rawBodyNormalized: body,
          commandBodyNormalized: body,
        },
        allowTextCommands: true,
        directives: parseInlineSessionDirectives(body),
        defaultActivation: "always",
        modelState: createModelSelectionStateFixture({
          agentCfg: {},
          provider: "anthropic",
          model: "claude",
        }),
        provider: "anthropic",
        model: "claude",
        typing: createTypingController({}),
        defaultModel: "claude",
        timeoutMs: 30_000,
        isNewSession: false,
        resetTriggered: false,
        systemSent: true,
        sessionKey,
        sessionId: entry.sessionId,
        storePath,
        sessionStore: { [sessionKey]: entry },
        workspaceDir: params.stateDir,
        abortedLastRun: false,
        resolvedThinkLevel: "off",
        resolvedVerboseLevel: "off",
        resolvedReasoningLevel: "off",
        resolvedElevatedLevel: "off",
        elevatedEnabled: false,
        elevatedAllowed: false,
        blockStreamingEnabled: false,
        resolvedBlockStreamingBreak: "message_end",
        opts: source.options,
      });
      if (context.kind !== "ready") {
        throw new Error("Expected a prepared room-event context");
      }
      const admission = await prepareReplyRunAdmission(context);
      if (admission.kind !== "ready") {
        throw new Error("Expected room-event admission");
      }
      // Room events never steer or interrupt, whatever the configured mode.
      expect(admission).toMatchObject({ isRoomEvent: true, shouldSteer: false, isActive: true });
      const run = createQueueTestRun(
        {
          prompt: body,
          messageId: row.id,
          originatingChannel: "discord",
          originatingTo: "channel:room",
          originatingChatType: "channel",
          currentInboundEventKind: "room_event",
          turnAdoptionLifecycle: source.options.turnAdoptionLifecycle,
          abortSignal: source.options.turnAdoptionLifecycle?.abortSignal,
        },
        {
          agentId: "main",
          sessionKey,
          sessionId: entry.sessionId,
          senderId: "peer",
          messageProvider: "discord",
          config: cfg,
        },
      );
      // The same publication runReplyAgent performs for an active-run follow-up.
      bindReplySourceToFollowup(source.options, run);
      expect(
        enqueueFollowupRun(
          admission.queueKey,
          run,
          admission.resolvedQueue,
          "message-id",
          undefined,
          false,
        ),
      ).toBe(true);
      return run;
    }

    it.each([
      ["collect", 1],
      ["followup", 3],
      ["steer", 3],
    ] as const)(
      "drains a mid-turn burst under configured %s as %i turn(s)",
      async (mode, turns) => {
        await withTempState(async (stateDir) => {
          const sessionKey = `agent:main:discord:channel:room-admission-${mode}`;
          const active = createReplyOperation({
            sessionKey,
            sessionId: "room-session",
            resetTriggered: false,
          });
          active.setPhase("running");
          const harness = await openRoomIngress(stateDir, burst, {
            enqueue: (row, lifecycle) =>
              admitRoomEvent({ stateDir, mode, sessionKey, lifecycle, row }),
          });
          try {
            await harness.dispatchRows();
            active.complete();
            const settlements = (getExistingFollowupQueue(sessionKey)?.entries ?? []).map(
              (input) => input.settlement.promise,
            );
            expect(settlements).toHaveLength(3);
            scheduleFollowupDrain(sessionKey, harness.adoptAndRecord);
            await Promise.allSettled(settlements);
            await harness.drain.waitForIdle();
            expect(harness.calls).toHaveLength(turns);
            if (turns === 1) {
              collected(harness.calls[0], burst);
              // The collected turn keeps room-event semantics (optional reply, no steering).
              expect(harness.calls[0]?.currentInboundEventKind).toBe("room_event");
            } else {
              expect(harness.calls.map((call) => call.prompt)).toEqual(burst.map(textOf));
            }
            await expectSettledOnce(harness, ["r1", "r2", "r3"]);
          } finally {
            active.complete();
            clearFollowupQueue(sessionKey);
            harness.dispose();
          }
        });
      },
    );
  });

  it("never merges room events with an addressed request and keeps addressed isolation", async () => {
    const rows: Row[] = [
      { id: "r1" },
      { id: "r2" },
      { id: "m3", kind: "user_request" },
      { id: "m4", kind: "user_request" },
      { id: "r5" },
      { id: "r6" },
    ];
    await withRoomIngress(rows, async (harness) => {
      await harness.dispatchRows();
      await harness.endActiveTurn();
      expect(harness.calls).toHaveLength(4);
      collected(harness.calls[0], rows.slice(0, 2));
      // Distinct exclusive admissions for addressed input still run one per turn (#103695).
      expect(harness.calls[1]?.prompt).toBe(textOf(rows[2]!));
      expect(harness.calls[2]?.prompt).toBe(textOf(rows[3]!));
      expect(harness.calls[1]?.currentInboundEventKind).toBe("user_request");
      collected(harness.calls[3], rows.slice(4));
      await expectSettledOnce(
        harness,
        rows.map((row) => row.id),
      );
    });
  });

  it("applies cap and drop:old to the collected batch", async () => {
    const rows: Row[] = ["r1", "r2", "r3", "r4", "r5"].map((id) => ({ id }));
    await withRoomIngress(
      rows,
      async (harness) => {
        await harness.dispatchRows();
        await harness.endActiveTurn();
        expect(harness.calls).toHaveLength(1);
        collected(harness.calls[0], rows.slice(2));
        // Cap loss dead-letters the evicted rows; survivors commit once.
        await expectSettledOnce(harness, ["r3", "r4", "r5"], ["r1", "r2"]);
        expect((await harness.queue.listFailed?.())?.map((row) => row.id).toSorted()).toEqual([
          "r1",
          "r2",
        ]);
      },
      { settings: { cap: 3, dropPolicy: "old" } },
    );
  });

  it.each(["collect", "followup"] as const)(
    "applies cap and drop:summarize under %s without losing or replaying a row",
    async (mode) => {
      const rows: Row[] = ["r1", "r2", "r3", "r4", "r5"].map((id) => ({ id }));
      await withRoomIngress(
        rows,
        async (harness) => {
          await harness.dispatchRows();
          await harness.endActiveTurn();
          if (mode === "collect") {
            expect(harness.calls).toHaveLength(2);
            expect(harness.calls[0]?.prompt).toContain("Dropped 2 messages due to cap");
            collected(harness.calls[1], rows.slice(2));
          } else {
            // Outside collect, overflowed room events keep one summary turn each.
            expect(harness.calls).toHaveLength(5);
            expect(harness.calls[0]?.prompt).toContain("Dropped 1 message due to cap");
            expect(harness.calls[1]?.prompt).toContain("Dropped 1 message due to cap");
            expect(harness.calls.slice(2).map((call) => call.prompt)).toEqual(
              rows.slice(2).map(textOf),
            );
          }
          expect(harness.calls[0]?.currentInboundEventKind).toBe("room_event");
          await expectSettledOnce(harness, ["r1", "r2", "r3", "r4", "r5"]);
        },
        { settings: { mode, cap: 3, dropPolicy: "summarize" } },
      );
    },
  );

  it("retries every member of a collected claim refused before execution, adopting each once", async () => {
    await withRoomIngress(burst, async (harness) => {
      await harness.dispatchRows();
      let attempts = 0;
      await harness.endActiveTurn(async (run) => {
        attempts += 1;
        if (attempts === 1) {
          harness.calls.push(run);
          rejectQueuePreparation(run, new Error("reply lane not ready"));
        }
        await harness.adoptAndRecord(run);
      });
      expect(harness.calls).toHaveLength(2);
      collected(harness.calls[0], burst);
      collected(harness.calls[1], burst);
      await expectSettledOnce(harness, ["r1", "r2", "r3"]);
    });
  });

  it.each(["returns a terminal failure", "rethrows"] as const)(
    "settles every member once when one member's custody is lost during adoption and execution %s",
    async (outcome) => {
      // Named edge case: r2 loses custody while r1/r3 commit. The turn is refused without
      // replaying r1/r3; supersede tombstones r2 and its replacement runs as a later turn.
      await withRoomIngress(
        burst,
        async (harness) => {
          await harness.dispatchRows();
          const lostMember = harness.runs.get("r2")!.turnAdoptionLifecycle!;
          const adoptLostMember = lostMember.onAdopted;
          lostMember.onAdopted = async () => {
            await harness.addRow({ id: "r2-edit" });
            expect(await harness.drain.drainOnce()).toEqual({ started: 1 });
            await adoptLostMember();
          };
          const lost: unknown[] = [];
          await harness.endActiveTurn(async (run) => {
            harness.calls.push(run);
            try {
              await admitFollowupRunLifecycle(run);
            } catch (error) {
              if (!isIngressAdoptionLostError(error)) {
                throw error;
              }
              lost.push(error);
              // Accepted input surfaces a terminal failure; an aborted turn rethrows.
              if (outcome === "rethrows") {
                throw error;
              }
            }
          });
          expect(lost).toEqual([expect.objectContaining({ code: "superseded" })]);
          expect(harness.calls).toHaveLength(2);
          collected(harness.calls[0], burst);
          expect(harness.calls[1]?.prompt).toBe(textOf({ id: "r2-edit" }));
          await expectSettledOnce(harness, ["r1", "r2", "r3", "r2-edit"]);
        },
        { supersedes: (candidate, pending) => candidate === "r2-edit" && pending === "r2" },
      );
    },
  );

  it.each(["before", "after"] as const)(
    "recovers a burst interrupted by restart %s adoption without replay or loss",
    async (phase) => {
      await withTempState(async (stateDir) => {
        let clock = Date.now();
        const now = () => clock;
        const first = await openRoomIngress(stateDir, burst, { now, claimLeaseMs: 3_000 });
        try {
          await first.dispatchRows();
          if (phase === "after") {
            await first.endActiveTurn();
            expect(first.calls).toHaveLength(1);
            collected(first.calls[0], burst);
          }
        } finally {
          // Process exit: the drain stops and in-memory session state is gone.
          first.drain.dispose();
          controllerTesting.resetSessionControllerForTest();
        }
        clock += 10_000;
        const second = await openRoomIngress(stateDir, [], { now, claimLeaseMs: 3_000 });
        try {
          await second.drain.recoverStaleClaims();
          if (phase === "after") {
            expect(await second.drain.drainOnce()).toEqual({ started: 0 });
          } else {
            expect(first.calls).toEqual([]);
            await second.dispatchRows(burst.length);
            await second.endActiveTurn();
            expect(second.calls).toHaveLength(1);
            collected(second.calls[0], burst);
          }
          const committed = phase === "after" ? first.writes.complete : second.writes.complete;
          expect(Object.fromEntries(committed)).toEqual({ r1: 1, r2: 1, r3: 1 });
          expect(await second.queue.listPending()).toEqual([]);
          expect(await second.queue.listClaims()).toEqual([]);
        } finally {
          second.dispose();
        }
      });
    },
  );
});
