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
import {
  deliverQueuedSessionDelivery,
  recoverPendingRestartContinuationDeliveries,
} from "../../gateway/server-restart-sentinel.js";
import {
  hasTrustedContinuationHeartbeatWake,
  requestHeartbeat,
  requestHeartbeatNow,
} from "../../infra/heartbeat-wake.js";
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
/** The delivery runtime's own logger (production wires the gateway log child). */
const runtimeLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** Install a delivery runtime as gateway startup does (a restart installs a new one). */
function startRuntime(): void {
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
    log: runtimeLog,
  });
}

beforeEach(() => {
  resetSystemEventsForTest();
  attempts.length = 0;
  runtimeLog.info.mockClear();
  runtimeLog.warn.mockClear();
  runtimeLog.error.mockClear();
  startRuntime();
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

/**
 * Step the gateway clock in `stepMs` increments, running every armed drain to
 * completion at each step (the scheduler awaits its due jobs).
 */
async function stepClock(totalMs: number, stepMs = 1_000): Promise<void> {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    await clock.advanceBy(stepMs);
    for (let index = 0; index < 50; index += 1) {
      if (clock.armedAtMs === null || clock.armedAtMs > clock.clock.now()) {
        break;
      }
      await clock.wake();
    }
  }
}

type ExpectedReplayWake =
  | { kind: "producer"; reason: "delegate-return" | "silent-wake-enrichment"; parentRunId: string }
  | { kind: "none" };

/** The wake the admitting replay requested must be the producer's own fast-path wake. */
function expectReplayWake(expected: ExpectedReplayWake): void {
  const wakes = wakesFor(SESSION_KEY) as Array<{
    reason?: string;
    parentRunId?: string;
    source?: string;
  }>;
  if (expected.kind === "none") {
    expect(wakes).toEqual([]);
    return;
  }
  expect(wakes).toHaveLength(1);
  expect(wakes[0]).toMatchObject({
    reason: expected.reason,
    parentRunId: expected.parentRunId,
    agentId: "main",
    sessionKey: SESSION_KEY,
  });
  expect(wakes[0]?.source).not.toBe("restart-sentinel");
  expect(hasTrustedContinuationHeartbeatWake(wakes[0])).toBe(true);
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
  expectedWake: ExpectedReplayWake;
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
  // The admitting replay wakes exactly as the producer's fast path would have.
  expectReplayWake(params.expectedWake);
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
      expectedWake: { kind: "producer", reason: "delegate-return", parentRunId: "run-q-t1" },
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
      expectedWake: { kind: "producer", reason: "delegate-return", parentRunId: "run-q-t2" },
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

    await expectRefusedReturnRetriedToAdoption({
      stateDir,
      text: "RETURN-SILENT-T3",
      deliveryId,
      expectedWake: {
        kind: "producer",
        reason: "silent-wake-enrichment",
        parentRunId: "run-q-t3",
      },
    });
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

// Lane Q2 (🕯 review 1556912687827656726, 🌊 review 1556913420945854596).
describe("capacity-deferred returns: observability, backoff, restart, producer wake", () => {
  function routeSilent(params: { announceId: string; text: string; wakeOnReturn: boolean }) {
    return routeSubagentContinuationReturn({
      cfg: {},
      continuationEnabled: true,
      isContinuationChainDelegate: false,
      maxChainLength: 10,
      task: params.text,
      taskLabel: params.text,
      triggerMessage: params.text,
      announceId: params.announceId,
      childSessionKey: CHILD_SESSION_KEY,
      childAgentId: "main",
      childRunId: `run-${params.announceId}`,
      targetRequesterSessionKey: SESSION_KEY,
      targetRequesterAgentId: "main",
      silentAnnounce: true,
      wakeOnReturn: params.wakeOnReturn,
    });
  }

  async function refuseTargetedReturn(stateDir: string, id: string): Promise<string> {
    const result = await enqueueContinuationReturnDeliveries({
      targetSessionKeys: [SESSION_KEY],
      text: `RETURN-${id}`,
      idempotencyKeyBase: `continuation-return:${id}`,
      wakeRecipients: true,
      childRunId: `run-${id}`,
      stateDir,
      ownerAgentId: "main",
    });
    expect(result.delivered).toBe(0);
    return result.deliveryIds[0] as string;
  }

  function saturationWarnings(): string[] {
    return runtimeLog.warn.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.includes("system event queue full"));
  }

  it("Q2-T1: sustained capacity deferral is reported once past 60s, then every 5 minutes, with session and row id", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    fillQueueWithNotes(MAX_EVENTS);
    const deliveryId = await refuseTargetedReturn(stateDir, "q2-t1");

    // Deferred retries keep running, but nothing is reported before 60s.
    await stepClock(55_000);
    expect(attemptsFor(deliveryId).length).toBeGreaterThan(1);
    expect(saturationWarnings()).toEqual([]);

    // Past the threshold: exactly one warning naming the session and the row.
    await stepClock(40_000);
    expect(saturationWarnings()).toHaveLength(1);
    expect(saturationWarnings()[0]).toContain(SESSION_KEY);
    expect(saturationWarnings()[0]).toContain(deliveryId);
    expect(saturationWarnings()[0]).toContain("continuation return");

    // Rate-limited: no repeat inside the next five minutes, one after it.
    await stepClock(240_000);
    expect(saturationWarnings()).toHaveLength(1);
    await stepClock(90_000);
    expect(saturationWarnings()).toHaveLength(2);
    expect(saturationWarnings()[1]).toContain(deliveryId);

    // Once the queue admits the row, the recovery is reported and warnings stop.
    drainSystemEventEntries(SESSION_KEY);
    await stepClock(31_000);
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q2-t1"]);
    expect(
      runtimeLog.info.mock.calls.some(
        ([message]) =>
          String(message).includes(deliveryId) && String(message).includes("admitted after"),
      ),
    ).toBe(true);
    await stepClock(600_000);
    expect(saturationWarnings()).toHaveLength(2);
  });

  it("Q2-T2: many capacity-deferred rows back off to a 30s ceiling (bounded aggregate retry rate), never stop, and are admitted after the queue drains", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    fillQueueWithNotes(MAX_EVENTS);
    const ROWS = 8;
    const ids: string[] = [];
    for (let index = 0; index < ROWS; index += 1) {
      ids.push(await refuseTargetedReturn(stateDir, `q2-t2-${index}`));
    }

    await stepClock(180_000);
    const warmed = attempts.length;
    // Steady state: each row retries at most once per 30s ceiling. Without a
    // backoff this window would see ROWS * 120 attempts.
    await stepClock(120_000);
    const steady = attempts.length - warmed;
    expect(steady).toBeLessThanOrEqual(ROWS * (120 / 30 + 1));
    // ...and no row stops retrying (no attempt cap).
    for (const id of ids) {
      expect(attemptsFor(id).length).toBeGreaterThanOrEqual(10);
    }
    expect(peekSystemEvents(SESSION_KEY)).toHaveLength(MAX_EVENTS);
    expect(peekSystemEvents(SESSION_KEY).some((text) => text.startsWith("RETURN-"))).toBe(false);

    // Capacity frees: every row is admitted within one ceiling interval, once.
    drainSystemEventEntries(SESSION_KEY);
    await stepClock(31_000);
    expect(peekSystemEvents(SESSION_KEY).toSorted()).toEqual(
      ids.map((_, index) => `RETURN-q2-t2-${index}`).toSorted(),
    );
    await runAdoptedTurn();
    expect(await pendingRows(stateDir)).toEqual([]);

    // Backoff state belongs to the deferral: a new refusal starts at 1s again.
    fillQueueWithNotes(MAX_EVENTS);
    const fresh = await refuseTargetedReturn(stateDir, "q2-t2-fresh");
    await stepClock(1_000);
    await stepClock(1_000);
    expect(attemptsFor(fresh).length).toBeGreaterThanOrEqual(2);
  });

  it("Q2-T3: a capacity-deferred row survives gateway stop and restart, is picked up by the startup scan, and is delivered once", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    fillQueueWithNotes(MAX_EVENTS);
    const deliveryId = await refuseTargetedReturn(stateDir, "q2-t3");
    await stepClock(3_000);
    expect(attemptsFor(deliveryId)).toContain("SessionDeliveryDeferredError");

    // Stop: the runtime is fenced; nothing retries, nothing settles the row.
    await stopRuntime?.();
    stopRuntime = undefined;
    const beforeStop = attemptsFor(deliveryId).length;
    await clock.advanceBy(60_000);
    expect(attemptsFor(deliveryId)).toHaveLength(beforeStop);
    expect((await pendingRows(stateDir)).map((entry) => entry.id)).toEqual([deliveryId]);

    // Restart into a still-saturated session: in-memory events are gone, but
    // twenty other notices land before startup recovery runs.
    resetSystemEventsForTest();
    fillQueueWithNotes(MAX_EVENTS, "post-restart");
    resetObservers();
    startRuntime();
    const queueContext = captureContinuationQueueContext(stateDir);
    await recoverPendingRestartContinuationDeliveries({
      deps: {} as never,
      queueContext,
      log: runtimeLog,
    });
    expect((await pendingRows(stateDir)).map((entry) => entry.id)).toEqual([deliveryId]);
    expect(peekSystemEvents(SESSION_KEY)).not.toContain("RETURN-q2-t3");
    expect(wakesFor(SESSION_KEY)).toEqual([]);

    // The startup scan (server-runtime-services) arms it on the new runtime.
    await schedulePendingSessionDeliveries();
    await stepClock(1_000);
    expect(attemptsFor(deliveryId).length).toBeGreaterThan(beforeStop);
    expect(peekSystemEvents(SESSION_KEY)).not.toContain("RETURN-q2-t3");

    // Capacity frees: delivered once, with the producer's wake, acked on adoption.
    await runAdoptedTurn();
    resetObservers();
    await stepClock(31_000);
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q2-t3"]);
    expectReplayWake({ kind: "producer", reason: "delegate-return", parentRunId: "run-q2-t3" });
    const prepared = await runAdoptedTurn();
    expect(prepared.blocks.filter((block) => block.text.includes("RETURN-q2-t3"))).toHaveLength(1);
    expect(await pendingRows(stateDir)).toEqual([]);
    await stepClock(60_000);
    expect(peekSystemEvents(SESSION_KEY)).toEqual([]);
  });

  it("Q2-T3b: after a restart with free capacity, startup recovery delivers the deferred row once", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    fillQueueWithNotes(MAX_EVENTS);
    const deliveryId = await refuseTargetedReturn(stateDir, "q2-t3b");
    await stepClock(2_000);
    await stopRuntime?.();
    stopRuntime = undefined;

    resetSystemEventsForTest();
    resetObservers();
    startRuntime();
    await recoverPendingRestartContinuationDeliveries({
      deps: {} as never,
      queueContext: captureContinuationQueueContext(stateDir),
      log: runtimeLog,
    });
    await schedulePendingSessionDeliveries();
    await stepClock(5_000);
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q2-t3b"]);
    expectReplayWake({ kind: "producer", reason: "delegate-return", parentRunId: "run-q2-t3b" });
    const prepared = await runAdoptedTurn();
    expect(prepared.managedDeliveries.map((delivery) => delivery.id)).toEqual([deliveryId]);
    expect(await pendingRows(stateDir)).toEqual([]);
  });

  it("Q2-T4: a silent return with wakeOnReturn=false is replayed after a cap refusal without any wake", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    fillQueueWithNotes(MAX_EVENTS);
    resetObservers();

    const routed = await routeSilent({
      announceId: "q2-t4",
      text: "RETURN-SILENT-NOWAKE",
      wakeOnReturn: false,
    });
    expect(routed.handled).toBe(true);
    const rows = await pendingRows(stateDir);
    expect(rows).toHaveLength(1);
    const deliveryId = rows[0]?.id as string;
    // The row carries the producer's intent: no wake.
    expect(rows[0]?.kind === "systemEvent" ? rows[0].returnWake : undefined).toBe(false);

    await expectRefusedReturnRetriedToAdoption({
      stateDir,
      text: "RETURN-SILENT-NOWAKE",
      deliveryId,
      expectedWake: { kind: "none" },
    });
  });

  it("Q2-T4b: a targeted silent return (wakeOnReturn=false) is replayed after a cap refusal without any wake", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    fillQueueWithNotes(MAX_EVENTS);
    resetObservers();

    await routeSubagentContinuationReturn({
      cfg: {},
      continuationEnabled: true,
      isContinuationChainDelegate: false,
      maxChainLength: 10,
      task: "targeted silent",
      taskLabel: "targeted silent",
      triggerMessage: "RETURN-TARGETED-NOWAKE",
      announceId: "q2-t4b",
      childSessionKey: CHILD_SESSION_KEY,
      childAgentId: "main",
      childRunId: "run-q2-t4b",
      targetRequesterSessionKey: SESSION_KEY,
      targetRequesterAgentId: "main",
      continuationTargetSessionKey: SESSION_KEY,
      silentAnnounce: true,
      wakeOnReturn: false,
    });
    const rows = await pendingRows(stateDir);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind === "systemEvent" ? rows[0].returnWake : undefined).toBe(false);
    expect(wakesFor(SESSION_KEY)).toEqual([]);

    await expectRefusedReturnRetriedToAdoption({
      stateDir,
      text: "RETURN-TARGETED-NOWAKE",
      deliveryId: rows[0]?.id as string,
      expectedWake: { kind: "none" },
    });
  });

  it("Q2-T5: the durable row records the producer's wake reason, and a legacy row keeps the generic restart-sentinel wake", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    fillQueueWithNotes(MAX_EVENTS);
    await routeSilent({ announceId: "q2-t5", text: "RETURN-SILENT-WAKE", wakeOnReturn: true });
    const targetedId = await refuseTargetedReturn(stateDir, "q2-t5-targeted");
    const rows = await pendingRows(stateDir);
    const byText = new Map(
      rows.map((entry) => [entry.kind === "systemEvent" ? entry.text : entry.id, entry]),
    );
    const silentRow = byText.get("RETURN-SILENT-WAKE");
    const targetedRow = byText.get("RETURN-q2-t5-targeted");
    expect(silentRow?.kind === "systemEvent" ? silentRow.returnWake : undefined).toEqual({
      reason: "silent-wake-enrichment",
      parentRunId: "run-q2-t5",
    });
    expect(targetedRow?.id).toBe(targetedId);
    expect(targetedRow?.kind === "systemEvent" ? targetedRow.returnWake : undefined).toEqual({
      reason: "delegate-return",
      parentRunId: "run-q2-t5-targeted",
    });

    // A continuation-return row written before the field existed replays as before.
    drainSystemEventEntries(SESSION_KEY);
    await runAdoptedTurn();
    await stepClock(31_000);
    await runAdoptedTurn();
    expect(await pendingRows(stateDir)).toEqual([]);
    const legacyId = await enqueueSessionDelivery(
      {
        kind: "systemEvent",
        sessionKey: SESSION_KEY,
        agentId: "main",
        text: "RETURN-LEGACY",
        idempotencyKey: `continuation-return:q2-t5-legacy:${SESSION_KEY}`,
        awaitPromptAdoption: true,
      },
      captureContinuationQueueContext(stateDir),
    );
    resetObservers();
    await schedulePendingSessionDeliveries();
    await stepClock(1_000);
    expect(peekSystemEventEntries(SESSION_KEY).map((event) => event.sessionDeliveryAckId)).toEqual([
      legacyId,
    ]);
    expect(wakesFor(SESSION_KEY)).toEqual([
      expect.objectContaining({ source: "restart-sentinel", reason: "wake" }),
    ]);
  });
});
