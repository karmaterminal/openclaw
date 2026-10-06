// A durable session-delivery row that no runtime armed must still be delivered
// inside a healthy process, and recovering it must never duplicate adoption.
//
// Lane Q3 (🕯 1556927701342752799 item 2, 🌊 1556927875477929985). Real: the
// system-event queue, durable session-delivery rows, the production delivery
// scheduler (session-delivery-queue-runtime) on a manual gateway clock, the
// restart-sentinel executor, prompt preparation and adoption settlement.
// Observed only: heartbeat wake requests (process-external), the scheduler arm
// call, the targeting warning log, and a pass-through count of durable acks
// (the real ack runs).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSessionStorePathCore } from "../../config/sessions.js";
import { replaceSessionEntry } from "../../config/sessions/session-accessor.js";
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
  scheduleSessionDelivery,
  startSessionDeliveryRuntime,
} from "../../infra/session-delivery-queue-runtime.js";
import {
  ackSessionDelivery,
  enqueueSessionDelivery,
  loadPendingSessionDeliveries,
} from "../../infra/session-delivery-queue-storage.js";
import {
  drainSystemEventEntries,
  enqueueSystemEvent,
  peekSystemEventEntries,
  peekSystemEvents,
  resetSystemEventsForTest,
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

vi.mock("../../infra/heartbeat-wake.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../infra/heartbeat-wake.js")>();
  return { ...actual, requestHeartbeat: vi.fn(), requestHeartbeatNow: vi.fn() };
});

vi.mock("../../infra/session-delivery-queue-runtime.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../infra/session-delivery-queue-runtime.js")>();
  return { ...actual, scheduleSessionDelivery: vi.fn(actual.scheduleSessionDelivery) };
});

vi.mock("../../infra/session-delivery-queue-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../infra/session-delivery-queue-storage.js")>();
  return { ...actual, ackSessionDelivery: vi.fn(actual.ackSessionDelivery) };
});

const targetingWarnings = vi.hoisted(() => [] as string[]);
vi.mock("../../logging/subsystem.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../logging/subsystem.js")>();
  return {
    ...actual,
    createSubsystemLogger: (subsystem: string) => {
      const logger = actual.createSubsystemLogger(subsystem);
      if (subsystem !== "continuation/targeting") {
        return logger;
      }
      return {
        ...logger,
        warn: (message: string, meta?: Record<string, unknown>) => {
          targetingWarnings.push(message);
          logger.warn(message, meta);
        },
      };
    },
  };
});

const MAX_EVENTS = 20;
const SESSION_KEY = "agent:main:sweep-recipient";
const SESSION_ID = "session-sweep-recipient";

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

function fillQueueWithNotes(count: number): void {
  for (let index = 0; index < count; index += 1) {
    expect(enqueueSystemEvent(`note-${index}`, { sessionKey: SESSION_KEY })).toBe(true);
  }
}

async function pendingRows(stateDir: string) {
  return await loadPendingSessionDeliveries(captureContinuationQueueContext(stateDir));
}

type DeliveryAttempt = { id: string; outcome: string; at: number };
let clock: ReturnType<typeof createGatewaySchedulerClock>;
let stopRuntime: (() => Promise<void>) | undefined;
const attempts: DeliveryAttempt[] = [];
const runtimeLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** Install a delivery runtime as gateway startup does, without its recovery or startup scan. */
function startRuntime(): void {
  clock = createGatewaySchedulerClock(Date.now());
  stopRuntime = startSessionDeliveryRuntime({
    scheduler: createTestGatewayScheduler(clock.clock),
    queueContext: captureOpenClawStateWorkerContext({
      env: { ...process.env, OPENCLAW_STATE_DIR: custody.stateDir() },
    }),
    deliver: async (entry, { queueContext }) => {
      try {
        await deliverQueuedSessionDelivery({ deps: {} as never, entry, queueContext });
        attempts.push({ id: entry.id, outcome: "returned", at: clock.clock.now() });
      } catch (error) {
        attempts.push({ id: entry.id, outcome: (error as Error).name, at: clock.clock.now() });
        throw error;
      }
    },
    log: runtimeLog,
    // Worst case for retry rate and sweep cadence: every jittered delay at its lower bound.
    random: () => 0,
  });
}

beforeEach(() => {
  resetSystemEventsForTest();
  attempts.length = 0;
  startRuntime();
});

afterEach(async () => {
  await stopRuntime?.();
  stopRuntime = undefined;
  resetSystemEventsForTest();
});

/** Step the gateway clock, running every armed drain to completion at each step. */
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

/** The admitting replay wakes exactly as the producer's fast path would have. */
function expectReplayWake(expected: {
  kind: "producer";
  reason: "delegate-return";
  parentRunId: string;
}): void {
  const wakes = wakesFor(SESSION_KEY) as Array<{ source?: string }>;
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
  targetingWarnings.length = 0;
}

describe("pending rows nothing armed: periodic sweep without duplicate adoption", () => {
  // One sweep period at its upper jitter bound (60s nominal, jittered ±25%).
  const SWEEP_PERIOD_MAX_MS = 75_000;

  async function admitTargetedReturn(stateDir: string, id: string): Promise<string> {
    const result = await enqueueContinuationReturnDeliveries({
      targetSessionKeys: [SESSION_KEY],
      text: `RETURN-${id}`,
      idempotencyKeyBase: `continuation-return:${id}`,
      wakeRecipients: true,
      childRunId: `run-${id}`,
      stateDir,
      ownerAgentId: "main",
    });
    expect(result.delivered).toBe(1);
    return result.deliveryIds[0] as string;
  }

  function acksFor(id: string): number {
    return vi.mocked(ackSessionDelivery).mock.calls.filter(([ackId]) => ackId === id).length;
  }

  /** Adopt the next prompt and return how many of its blocks carry `text`. */
  async function adoptAndCount(text: string): Promise<number> {
    const prepared = await runAdoptedTurn();
    return prepared.blocks.filter((block) => block.text.includes(text)).length;
  }

  beforeEach(() => {
    vi.mocked(ackSessionDelivery).mockClear();
  });

  it("Q3-S1: a return held while no runtime was active is delivered by the next runtime's sweep, with no restart and no startup scan", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    await stopRuntime?.();
    stopRuntime = undefined;
    fillQueueWithNotes(MAX_EVENTS);
    resetObservers();
    const result = await enqueueContinuationReturnDeliveries({
      targetSessionKeys: [SESSION_KEY],
      text: "RETURN-q3-s1",
      idempotencyKeyBase: "continuation-return:q3-s1",
      wakeRecipients: true,
      childRunId: "run-q3-s1",
      stateDir,
      ownerAgentId: "main",
    });
    const deliveryId = result.deliveryIds[0] as string;
    await expect(vi.mocked(scheduleSessionDelivery).mock.results[0]?.value).resolves.toBe(false);
    // The warning says when the row will be recovered.
    expect(targetingWarnings).toEqual([expect.stringContaining("periodic sweep")]);
    drainSystemEventEntries(SESSION_KEY);

    // A delivery runtime comes up without the gateway's startup recovery/scan.
    startRuntime();
    resetObservers();
    await stepClock(SWEEP_PERIOD_MAX_MS);
    expect(attemptsFor(deliveryId).length).toBeGreaterThan(0);
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q3-s1"]);
    expectReplayWake({ kind: "producer", reason: "delegate-return", parentRunId: "run-q3-s1" });

    expect(await adoptAndCount("RETURN-q3-s1")).toBe(1);
    expect(acksFor(deliveryId)).toBe(1);
    expect(await pendingRows(stateDir)).toEqual([]);
  });

  it("Q3-S2: a pending row another process wrote while this runtime runs is delivered within one sweep period", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    resetObservers();
    // Written straight to the shared state database; nothing in this process armed it.
    const deliveryId = await enqueueSessionDelivery(
      {
        kind: "systemEvent",
        sessionKey: SESSION_KEY,
        agentId: "main",
        text: "RETURN-q3-s2",
        idempotencyKey: `continuation-return:q3-s2:${SESSION_KEY}`,
        awaitPromptAdoption: true,
        returnWake: { reason: "delegate-return", parentRunId: "run-q3-s2" },
      },
      captureContinuationQueueContext(stateDir),
    );
    await stepClock(SWEEP_PERIOD_MAX_MS);
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q3-s2"]);
    expectReplayWake({ kind: "producer", reason: "delegate-return", parentRunId: "run-q3-s2" });
    expect(await adoptAndCount("RETURN-q3-s2")).toBe(1);
    expect(acksFor(deliveryId)).toBe(1);
    expect(await pendingRows(stateDir)).toEqual([]);
  });

  it("Q3-S3: a sweep over a row already queued in memory neither re-queues nor re-wakes it: one prompt appearance, one ack", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const deliveryId = await admitTargetedReturn(stateDir, "q3-s3");
    const [queued] = peekSystemEventEntries(SESSION_KEY);
    expect(queued?.sessionDeliveryAckId).toBe(deliveryId);
    resetObservers();

    await stepClock(2 * SWEEP_PERIOD_MAX_MS);
    // The same queued event (same occurrence id), not a replacement, and no new wake.
    expect(peekSystemEventEntries(SESSION_KEY).map((event) => event.id)).toEqual([queued?.id]);
    expect(wakesFor(SESSION_KEY)).toEqual([]);

    expect(await adoptAndCount("RETURN-q3-s3")).toBe(1);
    expect(acksFor(deliveryId)).toBe(1);
    await stepClock(SWEEP_PERIOD_MAX_MS);
    expect(peekSystemEvents(SESSION_KEY)).toEqual([]);
    expect(await adoptAndCount("RETURN-q3-s3")).toBe(0);
    expect(acksFor(deliveryId)).toBe(1);
  });

  it("Q3-S8: a row already delivered into memory is re-checked once per sweep, not polled every second", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const deliveryId = await admitTargetedReturn(stateDir, "q3-s8");
    resetObservers();
    await stepClock(4 * SWEEP_PERIOD_MAX_MS);
    // random() = 0 puts every sweep at its 45s lower bound: at most one replay each.
    const replays = attemptsFor(deliveryId);
    expect(replays.length).toBeGreaterThan(0);
    expect(replays.length).toBeLessThanOrEqual(Math.ceil((4 * SWEEP_PERIOD_MAX_MS) / 45_000));
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q3-s8"]);
    expect(wakesFor(SESSION_KEY)).toEqual([]);
    expect(await adoptAndCount("RETURN-q3-s8")).toBe(1);
    expect(acksFor(deliveryId)).toBe(1);
  });

  it("Q3-S9: a claim held by a turn from before a restart does not hide the row from startup recovery", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const deliveryId = await admitTargetedReturn(stateDir, "q3-s9");
    // A turn consumed it, then the gateway restarted before adoption (in-memory queue lost).
    await preparePrompt();
    drainSystemEventEntries(SESSION_KEY);
    resetObservers();
    await recoverPendingRestartContinuationDeliveries({
      deps: {} as never,
      queueContext: captureContinuationQueueContext(stateDir),
      log: runtimeLog,
    });
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q3-s9"]);
    expectReplayWake({ kind: "producer", reason: "delegate-return", parentRunId: "run-q3-s9" });
    expect(await adoptAndCount("RETURN-q3-s9")).toBe(1);
    expect(acksFor(deliveryId)).toBe(1);
  });

  it("Q3-S4: a sweep never pulls a row that is already scheduled ahead of its capacity backoff", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    fillQueueWithNotes(MAX_EVENTS);
    const result = await enqueueContinuationReturnDeliveries({
      targetSessionKeys: [SESSION_KEY],
      text: "RETURN-q3-s4",
      idempotencyKeyBase: "continuation-return:q3-s4",
      wakeRecipients: true,
      childRunId: "run-q3-s4",
      stateDir,
      ownerAgentId: "main",
    });
    const deliveryId = result.deliveryIds[0] as string;

    // Several sweep periods while the row waits out its jittered backoff.
    await stepClock(4 * SWEEP_PERIOD_MAX_MS);
    const times = attempts.filter((attempt) => attempt.id === deliveryId).map((a) => a.at);
    expect(times.length).toBeGreaterThan(5);
    const gaps = times.slice(1).map((at, index) => at - (times[index] as number));
    // Backoff gaps never shrink: no sweep-induced attempt between two backoff attempts.
    for (let index = 1; index < gaps.length; index += 1) {
      expect(gaps[index]).toBeGreaterThanOrEqual(gaps[index - 1] as number);
    }

    // Drain; the held return is admitted once, appears once, and is acked once.
    await runAdoptedTurn();
    await stepClock(31_000);
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q3-s4"]);
    expect(await adoptAndCount("RETURN-q3-s4")).toBe(1);
    expect(acksFor(deliveryId)).toBe(1);
    await stepClock(SWEEP_PERIOD_MAX_MS);
    expect(peekSystemEvents(SESSION_KEY)).toEqual([]);
  });

  it("Q3-S5: a sweep while a prepared turn is mid-adoption neither re-queues nor re-wakes it: one prompt appearance, one ack", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const deliveryId = await admitTargetedReturn(stateDir, "q3-s5");
    resetObservers();

    // The turn has consumed the event into its prompt but has not adopted it yet.
    const prepared = await preparePrompt();
    expect(prepared.blocks.filter((block) => block.text.includes("RETURN-q3-s5"))).toHaveLength(1);
    expect(prepared.managedDeliveries.map((delivery) => delivery.id)).toEqual([deliveryId]);
    expect(peekSystemEvents(SESSION_KEY)).toEqual([]);

    await stepClock(2 * SWEEP_PERIOD_MAX_MS);
    expect(peekSystemEvents(SESSION_KEY)).toEqual([]);
    expect(wakesFor(SESSION_KEY)).toEqual([]);
    expect((await pendingRows(stateDir)).map((entry) => entry.id)).toEqual([deliveryId]);

    await settleManagedSystemEventsAfterTurnAdoption({
      deliveries: prepared.managedDeliveries,
      persistedMessage: { __openclaw: { sessionDeliveryAckIds: [deliveryId] } },
    });
    expect(acksFor(deliveryId)).toBe(1);
    expect(await pendingRows(stateDir)).toEqual([]);

    await stepClock(SWEEP_PERIOD_MAX_MS);
    expect(peekSystemEvents(SESSION_KEY)).toEqual([]);
    expect(wakesFor(SESSION_KEY)).toEqual([]);
    expect(await adoptAndCount("RETURN-q3-s5")).toBe(0);
    expect(acksFor(deliveryId)).toBe(1);
  });

  it("Q3-S6: a mid-adoption turn that ends without adopting puts the return back; it is delivered once and acked once", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const deliveryId = await admitTargetedReturn(stateDir, "q3-s6");
    const prepared = await preparePrompt();
    await stepClock(SWEEP_PERIOD_MAX_MS);
    expect(peekSystemEvents(SESSION_KEY)).toEqual([]);

    // The turn is abandoned: its consumed event goes back to the queue.
    for (const delivery of prepared.managedDeliveries) {
      delivery.restore?.();
    }
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q3-s6"]);
    await stepClock(SWEEP_PERIOD_MAX_MS);
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q3-s6"]);

    expect(await adoptAndCount("RETURN-q3-s6")).toBe(1);
    expect(acksFor(deliveryId)).toBe(1);
    expect(await pendingRows(stateDir)).toEqual([]);
  });

  it("Q3-S7: a mid-adoption claim that is never adopted nor put back expires, so the row is not stranded", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const deliveryId = await admitTargetedReturn(stateDir, "q3-s7");
    // A turn path that neither adopts nor restores (the prepared turn is lost).
    await preparePrompt();
    await stepClock(SWEEP_PERIOD_MAX_MS);
    expect(peekSystemEvents(SESSION_KEY)).toEqual([]);

    // Past the adoption-claim lease the scheduler's retry re-queues and re-wakes it.
    const realNow = Date.now();
    const lease = vi.spyOn(Date, "now").mockReturnValue(realNow + 11 * 60_000);
    try {
      resetObservers();
      await stepClock(SWEEP_PERIOD_MAX_MS);
      expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q3-s7"]);
      expectReplayWake({ kind: "producer", reason: "delegate-return", parentRunId: "run-q3-s7" });
    } finally {
      lease.mockRestore();
    }
    expect(await adoptAndCount("RETURN-q3-s7")).toBe(1);
    expect(acksFor(deliveryId)).toBe(1);
    expect(await pendingRows(stateDir)).toEqual([]);
  });
});
