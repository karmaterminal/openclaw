// A continuation return whose producer required a wake must run its one turn
// even when the recipient agent has no heartbeat schedule, on the fast path and
// when a held return is replayed. A return whose producer asked for no wake
// runs none.
//
// Real: durable session-delivery rows, the system-event queue, the restart-
// sentinel replay executor, the heartbeat wake layer, the heartbeat scheduler
// and its execution-stage schedule gate. Observed: the scheduler's turn
// boundary (runOnce), which records each turn the scheduler admits.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveSessionStorePathCore } from "../../config/sessions.js";
import { replaceSessionEntry } from "../../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { deliverQueuedSessionDelivery } from "../../gateway/server-restart-sentinel.js";
import { resolveHeartbeatWakeStage } from "../../infra/heartbeat-runner-execution.js";
import { startHeartbeatRunner, type HeartbeatRunner } from "../../infra/heartbeat-runner.js";
import { setHeartbeatWakeHandler } from "../../infra/heartbeat-wake.js";
import { loadPendingSessionDeliveries } from "../../infra/session-delivery-queue-storage.js";
import {
  drainSystemEventEntries,
  enqueueSystemEvent,
  peekSystemEvents,
  resetSystemEventsForTest,
} from "../../infra/system-events.js";
import { useContinuationCustodyTestState } from "./custody/custody.test-support.js";
import { captureContinuationQueueContext } from "./queue-context.js";
import { enqueueContinuationReturnDeliveries } from "./targeting.js";

const MAX_EVENTS = 20;
const SESSION_KEY = "agent:main:unscheduled-recipient";
const SESSION_ID = "session-unscheduled-recipient";

const custody = useContinuationCustodyTestState();

// The recipient agent is configured but has no recurring heartbeat schedule.
const unscheduledConfig: OpenClawConfig = {
  agents: { defaults: { heartbeat: { every: "0m" } }, entries: { main: {} } },
};

type Turn = { reason?: string; sessionKey?: string; parentRunId?: string; gate: string };
const turns: Turn[] = [];
let runner: HeartbeatRunner | undefined;

beforeEach(() => {
  resetSystemEventsForTest();
  turns.length = 0;
  runner = startHeartbeatRunner({
    cfg: unscheduledConfig,
    runOnce: async (opts) => {
      // The execution stage applies its own schedule gate; record its verdict.
      const stage = await resolveHeartbeatWakeStage({ ...opts, cfg: unscheduledConfig });
      const gate =
        stage.kind === "skipped" && stage.reason === "disabled" ? "disabled" : "admitted";
      turns.push({
        reason: opts.reason,
        sessionKey: opts.sessionKey,
        parentRunId: opts.parentRunId,
        gate,
      });
      return { status: "ran", durationMs: 0 };
    },
  });
});

afterEach(async () => {
  runner?.stop();
  runner = undefined;
  const dispose = setHeartbeatWakeHandler(async () => ({ status: "skipped", reason: "disabled" }));
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 50);
  });
  dispose();
  resetSystemEventsForTest();
});

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

/** Let the wake layer coalesce and dispatch whatever was requested. */
async function settleWakes(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 1_000);
  });
}

/** A held return: the full queue refuses the fast path; the durable row remains. */
async function holdReturn(stateDir: string, id: string, wakeRecipients: boolean) {
  for (let index = 0; index < MAX_EVENTS; index += 1) {
    expect(enqueueSystemEvent(`note-${index}`, { sessionKey: SESSION_KEY })).toBe(true);
  }
  const result = await enqueueContinuationReturnDeliveries({
    targetSessionKeys: [SESSION_KEY],
    text: `RETURN-${id}`,
    idempotencyKeyBase: `continuation-return:${id}`,
    wakeRecipients,
    childRunId: `run-${id}`,
    stateDir,
    ownerAgentId: "main",
  });
  expect(result.delivered).toBe(0);
  expect(result.heldSessionKeys).toEqual([SESSION_KEY]);
  await settleWakes();
  expect(turns).toEqual([]);
  // A turn (outside this scheduler) drains the queue; the row is still pending.
  expect(drainSystemEventEntries(SESSION_KEY)).toHaveLength(MAX_EVENTS);
  const rows = await loadPendingSessionDeliveries(captureContinuationQueueContext(stateDir));
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

/** Replay the held row exactly as the delivery scheduler's executor does. */
async function replay(stateDir: string, entry: Awaited<ReturnType<typeof holdReturn>>) {
  await expect(
    deliverQueuedSessionDelivery({
      deps: {} as never,
      entry,
      queueContext: captureContinuationQueueContext(stateDir),
    }),
  ).rejects.toThrow("awaiting durable prompt adoption");
}

describe("wake-required continuation returns to an agent with no heartbeat schedule", () => {
  it("Q3-W1: a replayed wake-required return runs exactly one turn", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const row = await holdReturn(stateDir, "q3-w1", true);

    await replay(stateDir, row);
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q3-w1"]);
    await settleWakes();
    expect(turns).toEqual([
      {
        reason: "delegate-return",
        sessionKey: SESSION_KEY,
        parentRunId: "run-q3-w1",
        gate: "admitted",
      },
    ]);

    // A further replay of the still-queued row neither re-queues nor re-wakes.
    await replay(stateDir, row);
    await settleWakes();
    expect(turns).toHaveLength(1);
  });

  it("Q3-W2: a replayed no-wake return runs zero turns", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const row = await holdReturn(stateDir, "q3-w2", false);
    expect(row.kind === "systemEvent" ? row.returnWake : undefined).toBe(false);

    await replay(stateDir, row);
    expect(peekSystemEvents(SESSION_KEY)).toEqual(["RETURN-q3-w2"]);
    await settleWakes();
    expect(turns).toEqual([]);
  });

  it("Q3-W3: the fast-path admission of a wake-required return runs exactly one turn", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const result = await enqueueContinuationReturnDeliveries({
      targetSessionKeys: [SESSION_KEY],
      text: "RETURN-q3-w3",
      idempotencyKeyBase: "continuation-return:q3-w3",
      wakeRecipients: true,
      childRunId: "run-q3-w3",
      stateDir,
      ownerAgentId: "main",
    });
    expect(result.delivered).toBe(1);
    await settleWakes();
    expect(turns).toEqual([
      {
        reason: "delegate-return",
        sessionKey: SESSION_KEY,
        parentRunId: "run-q3-w3",
        gate: "admitted",
      },
    ]);
  });

  it("Q3-W4: the fast-path admission of a no-wake return runs zero turns", async () => {
    const stateDir = custody.stateDir();
    await seedRecipientSession(stateDir);
    const result = await enqueueContinuationReturnDeliveries({
      targetSessionKeys: [SESSION_KEY],
      text: "RETURN-q3-w4",
      idempotencyKeyBase: "continuation-return:q3-w4",
      wakeRecipients: false,
      stateDir,
      ownerAgentId: "main",
    });
    expect(result.delivered).toBe(1);
    await settleWakes();
    expect(turns).toEqual([]);
  });
});
