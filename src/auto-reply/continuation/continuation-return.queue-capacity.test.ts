// System-event queue capacity must never lose a continuation return.
//
// Upstream refuses a new system event when the in-memory queue already holds
// MAX_EVENTS (20) entries. These tests drive every continuation-return producer
// into that refusal against the REAL system-event queue, the REAL session
// delivery queue, the REAL restart-sentinel delivery executor, and the REAL
// prompt preparation/adoption settlement. Only process-external side effects
// are observed through spies: the heartbeat wake scheduler, the in-process
// delivery timer, and the continuation announce log.
//
// Contract under test: a refused return is never reported as delivered, never
// wakes the recipient as if it were queued, and is never acked. Its durable
// row stays pending, replay keeps it pending while the queue is still full,
// and once the queue drains the replay admits it, wakes the recipient, and the
// row settles only when a prepared turn adopts it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeSubagentContinuationReturn } from "../../agents/subagent-announce.continuation-return.js";
import { resolveSessionStorePathCore } from "../../config/sessions.js";
import {
  captureSessionRecipientAuthority,
  replaceSessionEntry,
} from "../../config/sessions/session-accessor.js";
import { deliverQueuedSessionDelivery } from "../../gateway/server-restart-sentinel.js";
import { requestHeartbeat, requestHeartbeatNow } from "../../infra/heartbeat-wake.js";
import {
  schedulePendingSessionDeliveries,
  scheduleSessionDelivery,
  startSessionDeliveryRuntime,
} from "../../infra/session-delivery-queue-runtime.js";
import {
  enqueueSessionDelivery,
  loadPendingSessionDeliveries,
} from "../../infra/session-delivery-queue-storage.js";
import {
  consumeSelectedSystemEventEntries,
  drainSystemEventEntries,
  enqueueSystemEvent,
  peekSystemEventEntries,
  peekSystemEvents,
  resetSystemEventsForTest,
  restoreConsumedSystemEventEntries,
} from "../../infra/system-events.js";
import { captureOpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.js";
import {
  createGatewaySchedulerClock,
  createTestGatewayScheduler,
} from "../../test-utils/gateway-scheduler-clock.js";
import { settleManagedSystemEventsAfterTurnAdoption } from "../reply/session-system-event-adoption.js";
import { prepareFormattedSystemEvents } from "../reply/session-system-events.js";
import { useContinuationCustodyTestState } from "./custody/custody.test-support.js";
import { captureContinuationQueueContext } from "./queue-context.js";
import { enqueueContinuationReturnDeliveries } from "./targeting.js";

// The wake scheduler is process-external: record requests, run nothing.
vi.mock("../../infra/heartbeat-wake.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../infra/heartbeat-wake.js")>();
  return {
    ...actual,
    requestHeartbeat: vi.fn(),
    requestHeartbeatNow: vi.fn(),
  };
});

// The in-process delivery timer: record what was armed, then run the real
// scheduler (which has no gateway runtime here and arms nothing). The tests
// drive the armed replay explicitly through the production recovery path.
vi.mock("../../infra/session-delivery-queue-runtime.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../infra/session-delivery-queue-runtime.js")>();
  return {
    ...actual,
    scheduleSessionDelivery: vi.fn(actual.scheduleSessionDelivery),
  };
});

const announceLog = vi.hoisted(() => [] as string[]);
vi.mock("../../logging/subsystem.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../logging/subsystem.js")>();
  return {
    ...actual,
    createSubsystemLogger: (subsystem: string) => {
      const logger = actual.createSubsystemLogger(subsystem);
      if (subsystem !== "continuation/announce") {
        return logger;
      }
      return {
        ...logger,
        info: (message: string, meta?: Record<string, unknown>) => {
          announceLog.push(message);
          logger.info(message, meta);
        },
      };
    },
  };
});

const MAX_EVENTS = 20;
const SESSION_KEY = "agent:main:capacity-recipient";
const SESSION_ID = "session-capacity-recipient";
const CHILD_SESSION_KEY = "agent:main:subagent:capacity-child";

const custody = useContinuationCustodyTestState();

async function seedRecipientSession(stateDir: string): Promise<void> {
  await replaceSessionEntry(
    {
      storePath: resolveSessionStorePathCore(stateDir, { agentId: "main" }),
      sessionKey: SESSION_KEY,
    },
    {
      sessionKey: SESSION_KEY,
      sessionId: SESSION_ID,
      updatedAt: Date.now(),
      status: "done",
    } as never,
  );
}

function fillQueueWithNotes(count: number, prefix = "note"): void {
  for (let index = 0; index < count; index += 1) {
    expect(enqueueSystemEvent(`${prefix}-${index}`, { sessionKey: SESSION_KEY })).toBe(true);
  }
}

async function pendingRows(stateDir: string) {
  return await loadPendingSessionDeliveries(captureContinuationQueueContext(stateDir));
}

async function pendingTexts(stateDir: string): Promise<string[]> {
  return (await pendingRows(stateDir)).map((entry) =>
    entry.kind === "systemEvent" ? entry.text : entry.kind,
  );
}

// The production delivery scheduler (session-delivery-queue-runtime), running
// the production gateway executor exactly as server-runtime-services wires it,
// on a manual gateway clock. Tests never call the replay function themselves:
// a row is retried only if production code armed it.
type DeliveryAttempt = { id: string; outcome: string };
let clock: ReturnType<typeof createGatewaySchedulerClock>;
let stopRuntime: (() => Promise<void>) | undefined;
const attempts: DeliveryAttempt[] = [];

beforeEach(() => {
  resetSystemEventsForTest();
  attempts.length = 0;
  clock = createGatewaySchedulerClock(Date.now());
  const stateDir = custody.stateDir();
  stopRuntime = startSessionDeliveryRuntime({
    scheduler: createTestGatewayScheduler(clock.clock),
    queueContext: captureOpenClawStateWorkerContext({
      env: { ...process.env, OPENCLAW_STATE_DIR: stateDir },
    }),
    deliver: async (entry, { queueContext }) => {
      try {
        await deliverQueuedSessionDelivery({ deps: {} as never, entry, queueContext });
        attempts.push({ id: entry.id, outcome: "returned" });
      } catch (error) {
        attempts.push({ id: entry.id, outcome: (error as Error).name });
        throw error;
      }
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
});

afterEach(async () => {
  await stopRuntime?.();
  stopRuntime = undefined;
  resetSystemEventsForTest();
});

/** Let the gateway clock run for `ms`, firing whatever production armed. */
async function runClock(ms: number): Promise<void> {
  await clock.advanceBy(ms);
  // Armed drains run asynchronously through the state worker; let them settle.
  for (let index = 0; index < 20; index += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
    if (clock.armedAtMs !== null && clock.armedAtMs <= clock.clock.now()) {
      await clock.wake();
    }
  }
}

function attemptsFor(id: string): string[] {
  return attempts.filter((attempt) => attempt.id === id).map((attempt) => attempt.outcome);
}

async function preparePrompt() {
  return await prepareFormattedSystemEvents({
    cfg: {} as never,
    agentId: "main",
    sessionKey: SESSION_KEY,
    isMainSession: true,
    isNewSession: false,
  });
}

/** A turn that consumes the queue and is durably adopted. */
async function runAdoptedTurn() {
  const prepared = await preparePrompt();
  await settleManagedSystemEventsAfterTurnAdoption({
    deliveries: prepared.managedDeliveries,
    persistedMessage: {
      __openclaw: {
        sessionDeliveryAckIds: prepared.managedDeliveries.map((delivery) => delivery.id),
      },
    },
  });
  return prepared;
}

function wakesFor(sessionKey: string): unknown[] {
  return [
    ...vi.mocked(requestHeartbeat).mock.calls.map(([options]) => options),
    ...vi.mocked(requestHeartbeatNow).mock.calls.map(([options]) => options),
  ].filter(
    (options) => (options as { sessionKey?: string } | undefined)?.sessionKey === sessionKey,
  );
}

function resetObservers(): void {
  vi.mocked(requestHeartbeat).mockClear();
  vi.mocked(requestHeartbeatNow).mockClear();
  vi.mocked(scheduleSessionDelivery).mockClear();
  announceLog.length = 0;
}

function promptHas(prepared: Awaited<ReturnType<typeof preparePrompt>>, text: string): boolean {
  return prepared.blocks.some((block) => block.text.includes(text));
}

/**
 * Refusal -> automatic retry while still full -> drain -> automatic retry
 * admits + wakes -> exactly one adoption ack. No restart, no unrelated
 * traffic, no manual replay: only the gateway clock advances.
 */
async function expectRefusedReturnRetriedToAdoption(params: {
  stateDir: string;
  text: string;
  deliveryId: string;
}): Promise<void> {
  const { stateDir, text, deliveryId } = params;
  const oldEvents = peekSystemEvents(SESSION_KEY);
  expect(oldEvents).toHaveLength(MAX_EVENTS);

  // The armed retry fires while the queue is still full: kept, not admitted,
  // no wake, and the older queued events are untouched.
  resetObservers();
  await runClock(0);
  expect(attemptsFor(deliveryId).length).toBeGreaterThan(0);
  expect(peekSystemEvents(SESSION_KEY)).toEqual(oldEvents);
  expect((await pendingRows(stateDir)).map((entry) => entry.id)).toContain(deliveryId);
  expect(wakesFor(SESSION_KEY)).toEqual([]);

  // A turn drains the queue; every older event reaches the prompt.
  const drained = await runAdoptedTurn();
  for (const old of oldEvents) {
    expect(promptHas(drained, old)).toBe(true);
  }
  expect(promptHas(drained, text)).toBe(false);
  expect(peekSystemEvents(SESSION_KEY)).toEqual([]);

  // Capacity is free; the armed retry alone re-enqueues and wakes.
  resetObservers();
  await runClock(1_000);
  expect(peekSystemEvents(SESSION_KEY)).toEqual([text]);
  expect(
    peekSystemEventEntries(SESSION_KEY).map((event) => ({
      ackId: event.sessionDeliveryAckId,
      awaitsAdoption: event.sessionDeliveryAwaitsTurnAdoption,
    })),
  ).toEqual([{ ackId: deliveryId, awaitsAdoption: true }]);
  expect(wakesFor(SESSION_KEY)).toHaveLength(1);
  expect((await pendingRows(stateDir)).map((entry) => entry.id)).toContain(deliveryId);

  // Further retries before adoption neither duplicate the event nor re-wake.
  resetObservers();
  await runClock(1_000);
  expect(peekSystemEvents(SESSION_KEY)).toEqual([text]);
  expect(wakesFor(SESSION_KEY)).toEqual([]);

  // Preparation surfaces it once; adoption acks it exactly once.
  const prepared = await preparePrompt();
  expect(prepared.blocks.filter((block) => block.text.includes(text))).toHaveLength(1);
  expect(prepared.managedDeliveries.map((delivery) => delivery.id)).toEqual([deliveryId]);
  expect((await pendingRows(stateDir)).map((entry) => entry.id)).toContain(deliveryId);
  await settleManagedSystemEventsAfterTurnAdoption({
    deliveries: prepared.managedDeliveries,
    persistedMessage: { __openclaw: { sessionDeliveryAckIds: [deliveryId] } },
  });
  expect((await pendingRows(stateDir)).map((entry) => entry.id)).not.toContain(deliveryId);

  // The scheduler stops retrying a settled row.
  const settledAttempts = attemptsFor(deliveryId).length;
  await runClock(5_000);
  expect(attemptsFor(deliveryId)).toHaveLength(settledAttempts);
  expect(peekSystemEvents(SESSION_KEY)).toEqual([]);
}

describe("continuation returns at system-event queue capacity (cap=20)", () => {
  it("Q-T1: a durable targeted return with recipient authority is held, replayed, adopted, then acked", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const authority = await captureSessionRecipientAuthority({
      agentId: "main",
      sessionKey: SESSION_KEY,
    });
    fillQueueWithNotes(MAX_EVENTS);
    resetObservers();

    const result = await enqueueContinuationReturnDeliveries({
      targetSessionKeys: [SESSION_KEY],
      text: "RETURN-T1",
      idempotencyKeyBase: "continuation-return:q-t1",
      recipientAuthorities: new Map([[SESSION_KEY, authority]]),
      wakeRecipients: true,
      childRunId: "run-q-t1",
      stateDir,
      ownerAgentId: "main",
    });

    // Refused fast path: not delivered, not woken as delivered, row armed.
    expect(peekSystemEvents(SESSION_KEY)).not.toContain("RETURN-T1");
    expect(result.delivered).toBe(0);
    const [deliveryId] = result.deliveryIds;
    expect(deliveryId).toBeDefined();
    expect(await pendingTexts(stateDir)).toEqual(["RETURN-T1"]);
    expect(wakesFor(SESSION_KEY)).toEqual([]);
    expect(vi.mocked(scheduleSessionDelivery).mock.calls.map(([id]) => id)).toEqual([deliveryId]);

    await expectRefusedReturnRetriedToAdoption({
      stateDir,
      text: "RETURN-T1",
      deliveryId: deliveryId as string,
    });
  });

  it("Q-T2: a plain targeted return without recipient authority is held, replayed, adopted, then acked", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    fillQueueWithNotes(MAX_EVENTS);
    resetObservers();

    const result = await enqueueContinuationReturnDeliveries({
      targetSessionKeys: [SESSION_KEY],
      text: "RETURN-T2",
      idempotencyKeyBase: "continuation-return:q-t2",
      wakeRecipients: true,
      childRunId: "run-q-t2",
      stateDir,
      ownerAgentId: "main",
    });

    expect(peekSystemEvents(SESSION_KEY)).not.toContain("RETURN-T2");
    expect(result.delivered).toBe(0);
    const [deliveryId] = result.deliveryIds;
    expect(deliveryId).toBeDefined();
    const [row] = await pendingRows(stateDir);
    expect(row?.kind === "systemEvent" ? row.text : undefined).toBe("RETURN-T2");
    // A plain return keeps the same adoption custody as an authority-bound one.
    expect(row?.kind === "systemEvent" ? row.awaitPromptAdoption : undefined).toBe(true);
    expect(wakesFor(SESSION_KEY)).toEqual([]);
    expect(vi.mocked(scheduleSessionDelivery).mock.calls.map(([id]) => id)).toEqual([deliveryId]);

    await expectRefusedReturnRetriedToAdoption({
      stateDir,
      text: "RETURN-T2",
      deliveryId: deliveryId as string,
    });
  });

  it("Q-T5: a de-duplicated re-enqueue at the cap is told apart from a capacity refusal", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const params = {
      targetSessionKeys: [SESSION_KEY],
      text: "RETURN-T5",
      idempotencyKeyBase: "continuation-return:q-t5",
      wakeRecipients: true,
      childRunId: "run-q-t5",
      stateDir,
      ownerAgentId: "main",
    };
    const first = await enqueueContinuationReturnDeliveries(params);
    expect(first.delivered).toBe(1);
    // The return occupies one of the 20 slots; the queue is now full.
    fillQueueWithNotes(MAX_EVENTS - 1);
    resetObservers();

    // The idempotent retry hits the same durable row; `enqueueSystemEvent`
    // returns false because the row already rides a queued event, not because
    // the queue refused it.
    const retry = await enqueueContinuationReturnDeliveries(params);
    expect(retry).toMatchObject({ enqueued: 1, delivered: 1, deliveryIds: first.deliveryIds });
    expect(peekSystemEvents(SESSION_KEY).filter((text) => text === "RETURN-T5")).toHaveLength(1);
    expect(vi.mocked(scheduleSessionDelivery)).not.toHaveBeenCalled();
    expect(await pendingTexts(stateDir)).toEqual(["RETURN-T5"]);

    // A different return at the same full queue is a refusal: held and armed.
    const refused = await enqueueContinuationReturnDeliveries({
      ...params,
      text: "RETURN-T5-OTHER",
      idempotencyKeyBase: "continuation-return:q-t5-other",
    });
    expect(refused).toMatchObject({ enqueued: 1, delivered: 0 });
    expect(vi.mocked(scheduleSessionDelivery).mock.calls.map(([id]) => id)).toEqual(
      refused.deliveryIds,
    );
    expect(peekSystemEvents(SESSION_KEY)).not.toContain("RETURN-T5-OTHER");
  });

  it("Q-T3: a non-targeted silent-enrichment return at the cap is held durably, not logged Delivered, and not woken", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    fillQueueWithNotes(MAX_EVENTS);
    resetObservers();

    const routed = await routeSubagentContinuationReturn({
      cfg: {},
      continuationEnabled: true,
      isContinuationChainDelegate: false,
      maxChainLength: 10,
      task: "capacity silent return",
      taskLabel: "capacity silent return",
      triggerMessage: "RETURN-SILENT-T3",
      announceId: "q-t3",
      childSessionKey: CHILD_SESSION_KEY,
      childAgentId: "main",
      childRunId: "run-q-t3",
      targetRequesterSessionKey: SESSION_KEY,
      targetRequesterAgentId: "main",
      silentAnnounce: true,
      wakeOnReturn: true,
    });

    // The return is owned by a durable row, so the router may hand it off.
    expect(routed.handled).toBe(true);
    expect(peekSystemEvents(SESSION_KEY)).not.toContain("RETURN-SILENT-T3");
    expect(announceLog.some((line) => line.includes("Delivered"))).toBe(false);
    expect(wakesFor(SESSION_KEY)).toEqual([]);
    const rows = await pendingRows(stateDir);
    expect(rows.map((entry) => (entry.kind === "systemEvent" ? entry.text : entry.kind))).toEqual([
      "RETURN-SILENT-T3",
    ]);
    const deliveryId = rows[0]?.id as string;
    expect(vi.mocked(scheduleSessionDelivery).mock.calls.map(([id]) => id)).toEqual([deliveryId]);

    await expectRefusedReturnRetriedToAdoption({ stateDir, text: "RETURN-SILENT-T3", deliveryId });
  });

  it("Q-T3b: an admitted silent-enrichment return is logged Delivered, woken, and still durably owned until adoption", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    resetObservers();

    await routeSubagentContinuationReturn({
      cfg: {},
      continuationEnabled: true,
      isContinuationChainDelegate: false,
      maxChainLength: 10,
      task: "admitted silent return",
      taskLabel: "admitted silent return",
      triggerMessage: "RETURN-SILENT-T3B",
      announceId: "q-t3b",
      childSessionKey: CHILD_SESSION_KEY,
      childAgentId: "main",
      childRunId: "run-q-t3b",
      targetRequesterSessionKey: SESSION_KEY,
      targetRequesterAgentId: "main",
      silentAnnounce: true,
      wakeOnReturn: true,
    });

    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-SILENT-T3B"]);
    expect(announceLog.some((line) => line.includes("Delivered"))).toBe(true);
    expect(wakesFor(SESSION_KEY).map((options) => (options as { reason?: string }).reason)).toEqual(
      ["silent-wake-enrichment"],
    );
    expect(await pendingTexts(stateDir)).toEqual(["RETURN-SILENT-T3B"]);
    await runAdoptedTurn();
    expect(await pendingTexts(stateDir)).toEqual([]);
  });

  it("Q-T4: restart-sentinel replay at the cap reports no success and keeps the row for the next replay", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const deliveryId = await enqueueSessionDelivery(
      {
        kind: "systemEvent",
        sessionKey: SESSION_KEY,
        agentId: "main",
        text: "SENTINEL-NOTICE-T4",
        idempotencyKey: "restart-sentinel-notice:q-t4",
      },
      captureContinuationQueueContext(stateDir),
    );
    fillQueueWithNotes(MAX_EVENTS);
    resetObservers();

    // Startup arms every pending row; the replay fires at the cap.
    await schedulePendingSessionDeliveries();
    await runClock(0);

    expect(attemptsFor(deliveryId)).toContain("SessionDeliveryDeferredError");
    expect(peekSystemEvents(SESSION_KEY)).not.toContain("SENTINEL-NOTICE-T4");
    expect((await pendingRows(stateDir)).map((entry) => entry.id)).toEqual([deliveryId]);
    expect(wakesFor(SESSION_KEY)).toEqual([]);

    // Once the queue drains, the scheduler's own retry admits it and wakes.
    drainSystemEventEntries(SESSION_KEY);
    await runClock(1_000);
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["SENTINEL-NOTICE-T4"]);
    expect(peekSystemEventEntries(SESSION_KEY)[0]?.sessionDeliveryAckId).toBe(deliveryId);
    expect(wakesFor(SESSION_KEY)).toHaveLength(1);

    // An ordinary (non-return) sentinel row keeps upstream settlement: the
    // admitting replay settles it, the queued copy reaches one prompt, and
    // the scheduler does not re-deliver it.
    const prepared = await runAdoptedTurn();
    expect(
      prepared.blocks.filter((block) => block.text.includes("SENTINEL-NOTICE-T4")),
    ).toHaveLength(1);
    expect(await pendingRows(stateDir)).toEqual([]);
    await runClock(5_000);
    expect(peekSystemEvents(SESSION_KEY)).toEqual([]);
  });
});

// Re-run of the cut 08fead65d2 capacity characterization (frond-scribe
// proof-receipts/cut-08fead65d2/capacity-characterization, cases A/B/C) on the
// absorb, through the real silent-enrichment producer instead of a bare enqueue.
describe("cut 08fead65d2 capacity characterization on the absorb (A/B/C)", () => {
  function routeSilentReturn(announceId: string, text: string) {
    return routeSubagentContinuationReturn({
      cfg: {},
      continuationEnabled: true,
      isContinuationChainDelegate: false,
      maxChainLength: 10,
      task: "characterization",
      taskLabel: "characterization",
      triggerMessage: text,
      announceId,
      childSessionKey: CHILD_SESSION_KEY,
      childAgentId: "main",
      childRunId: `run-${announceId}`,
      targetRequesterSessionKey: SESSION_KEY,
      targetRequesterAgentId: "main",
      silentAnnounce: true,
      wakeOnReturn: false,
    });
  }

  it("Q-A: 20 durable entries queued, then an enrichment return: the return is not lost", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    for (let index = 0; index < MAX_EVENTS; index += 1) {
      expect(
        enqueueSystemEvent(`durable-${index}`, {
          sessionKey: SESSION_KEY,
          sessionDeliveryAckId: `d${index}`,
        }),
      ).toBe(true);
    }
    resetObservers();

    await routeSilentReturn("q-a", "ENRICHMENT-RETURN-A");
    const drained = drainSystemEventEntries(SESSION_KEY);
    expect(drained).toHaveLength(MAX_EVENTS);
    expect(drained.some((event) => event.text === "ENRICHMENT-RETURN-A")).toBe(false);
    expect(announceLog.some((line) => line.includes("Delivered"))).toBe(false);
    // Not in memory, so it must be durably held for replay.
    expect(await pendingTexts(stateDir)).toEqual(["ENRICHMENT-RETURN-A"]);

    // The producer armed the row; the scheduler re-enqueues it on its own.
    await runClock(1_000);
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["ENRICHMENT-RETURN-A"]);
  });

  it("Q-B: an enrichment return, then 20 later events and an overflowing restore: the return is not lost", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    await routeSilentReturn("q-b", "ENRICHMENT-RETURN-B");
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["ENRICHMENT-RETURN-B"]);

    // Later overflow at enqueue: the absorb refuses the 20th note instead of
    // dropping the oldest entry.
    for (let index = 0; index < MAX_EVENTS; index += 1) {
      enqueueSystemEvent(`note-${index}`, { sessionKey: SESSION_KEY });
    }
    expect(peekSystemEvents(SESSION_KEY)).toHaveLength(MAX_EVENTS);
    expect(peekSystemEvents(SESSION_KEY)).toContain("ENRICHMENT-RETURN-B");

    // Oldest-drop is still base-present on restore: a turn captures the whole
    // queue, another event arrives, and the turn returns its capture unadopted.
    const captured = peekSystemEventEntries(SESSION_KEY);
    expect(consumeSelectedSystemEventEntries(SESSION_KEY, captured)).toHaveLength(MAX_EVENTS);
    expect(enqueueSystemEvent("late-note", { sessionKey: SESSION_KEY })).toBe(true);
    restoreConsumedSystemEventEntries(SESSION_KEY, captured);

    expect(peekSystemEvents(SESSION_KEY)).toHaveLength(MAX_EVENTS);
    expect(peekSystemEvents(SESSION_KEY)).toContain("ENRICHMENT-RETURN-B");
    expect(await pendingTexts(stateDir)).toEqual(["ENRICHMENT-RETURN-B"]);
  });

  it("Q-C (control): a targeted return with an ack id survives 20 later non-durable events", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    await routeSubagentContinuationReturn({
      cfg: {},
      continuationEnabled: true,
      isContinuationChainDelegate: false,
      maxChainLength: 10,
      task: "characterization",
      taskLabel: "characterization",
      triggerMessage: "TARGETED-RETURN-C",
      announceId: "q-c",
      childSessionKey: CHILD_SESSION_KEY,
      childAgentId: "main",
      childRunId: "run-q-c",
      targetRequesterSessionKey: SESSION_KEY,
      targetRequesterAgentId: "main",
      continuationTargetSessionKey: SESSION_KEY,
    });
    for (let index = 0; index < MAX_EVENTS; index += 1) {
      enqueueSystemEvent(`note-${index}`, { sessionKey: SESSION_KEY });
    }
    const drained = drainSystemEventEntries(SESSION_KEY);
    expect(drained).toHaveLength(MAX_EVENTS);
    expect(drained.some((event) => event.text === "TARGETED-RETURN-C")).toBe(true);
    expect(drained.find((event) => event.text === "TARGETED-RETURN-C")?.sessionDeliveryAckId).toBe(
      (await pendingRows(stateDir))[0]?.id,
    );
  });
});
