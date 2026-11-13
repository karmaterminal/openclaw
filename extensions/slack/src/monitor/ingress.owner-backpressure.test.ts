// Frond (karmaterminal, #1564): core settles the human owner's room message refused at a full
// protected reply queue as backpressure. Slack's own lifecycle must carry it to the durable retry
// owner as a paced retry that spends no attempt, while every other settlement keeps its accounting.
import { closeOpenClawStateDatabaseForTest } from "openclaw/plugin-sdk/channel-ingress-test-runtime";
import type { PluginJsonValue } from "openclaw/plugin-sdk/plugin-entry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSlackTestRuntime } from "../test-runtime.test-support.js";
import { registerSlackMessageEvents } from "./events/messages.js";
import { attachBoltIngress, withQueue, type SlackIngressQueue } from "./ingress.test-support.js";
import { createSlackMessageHandler } from "./message-handler.js";
import type { PreparedSlackMessage } from "./message-handler/types.js";
import { createMonitorTestContext } from "./monitor-context.test-support.js";

type ReplyLifecycle = NonNullable<PreparedSlackMessage["turnAdoptionLifecycle"]>;

const replyLane = vi.hoisted(() => ({
  dispatch: vi.fn<(prepared: { message: { ts?: string } }) => Promise<void>>(),
}));

// mock-isolation: the reply lane stands in for core dispatch. Bolt routing, durable ingress, the
// message handler with its logical replay claims, and the retry owner all run for real.
vi.mock("./message-handler/pipeline.runtime.js", () => ({
  prepareSlackMessage: async ({ message }: { message: { ts?: string } }) => ({
    message,
    ctxPayload: {},
    route: { sessionKey: "agent:main:slack:channel:c_room" },
  }),
  dispatchPreparedSlackMessage: (prepared: { message: { ts?: string } }) =>
    replyLane.dispatch(prepared),
}));

const HOUR_MS = 60 * 60_000;
// The ingress backoff for attempt-free retries: 1 s doubling to the 3 min cap.
const PACING_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 180_000, 180_000];

function roomEvent(eventId: string, ts: string): PluginJsonValue {
  return {
    team_id: "T_TEST",
    api_app_id: "A_TEST",
    type: "event_callback",
    event_id: eventId,
    event_time: 1_700_000_000,
    event: {
      type: "message",
      channel: "C_ROOM",
      channel_type: "channel",
      user: "U_OWNER",
      ts,
      text: "room message",
    },
  };
}

// The queue and the monitor capture their clock at construction.
function useIngressClock() {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
}

function attachRoomIngress(queue: SlackIngressQueue) {
  installSlackTestRuntime();
  const { app, ingress } = attachBoltIngress(queue, { adoptionStallTimeoutMs: 10 * 60_000 });
  const ctx = createMonitorTestContext({
    app,
    teamId: "T_TEST",
    apiAppId: "A_TEST",
    installationIdentity: { kind: "workspace", teamId: "T_TEST" },
  });
  ctx.readRuntimeContext = async () => ctx;
  registerSlackMessageEvents({ ctx, handleSlackMessage: createSlackMessageHandler({ ctx }) });
  const advance = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
    await ingress.waitForIdle();
  };
  return { ingress, advance };
}

async function enqueue(queue: SlackIngressQueue, eventId: string, ts: string, receivedAt: number) {
  await queue.enqueue(
    eventId,
    { version: 1, receivedAt, kind: "events-api", body: roomEvent(eventId, ts) },
    { receivedAt },
  );
}

async function rowState(queue: SlackIngressQueue, eventId: string) {
  const pending = (await queue.listPending({ limit: "all" })).find((row) => row.id === eventId);
  if (pending) {
    return { state: "pending", attempts: pending.attempts };
  }
  const failed = (await queue.listFailed?.({ limit: "all" }))?.find((row) => row.id === eventId);
  return failed ? { state: "failed", reason: failed.reason } : { state: "settled" };
}

// Core's mailbox notifier settles a backpressure disposition through onBackpressure and falls
// back to abandonment only for a lifecycle without it (session-controller.mailbox-source.ts).
function refuse(lifecycle: ReplyLifecycle) {
  void (lifecycle.onBackpressure ? lifecycle.onBackpressure() : lifecycle.onAbandoned?.());
}

describe("Slack owner backpressure", () => {
  beforeEach(() => {
    replyLane.dispatch.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    closeOpenClawStateDatabaseForTest();
  });

  it("holds a refused owner message past 24 h and 8 refusals with no attempt spent, paced, then admits each once in order", async () => {
    useIngressClock();
    await withQueue(async (queue) => {
      const { ingress, advance } = attachRoomIngress(queue);
      // Already past the dead-letter age floor.
      await enqueue(queue, "Ev-owner-1", "1700000000.000101", Date.now() - 25 * HOUR_MS);
      const claims: Array<{ ts: string | undefined; at: number }> = [];
      const admitted: Array<string | undefined> = [];
      let capacityFree = false;
      replyLane.dispatch.mockImplementation(async (prepared) => {
        const lifecycle = (prepared as PreparedSlackMessage).turnAdoptionLifecycle!;
        claims.push({ ts: prepared.message.ts, at: Date.now() });
        // drop:old / drop:summarize: core defers the source before overflow refuses it.
        lifecycle.onDeferred?.();
        if (!capacityFree) {
          refuse(lifecycle);
          return;
        }
        admitted.push(prepared.message.ts);
        await lifecycle.onAdopted();
      });
      const ownerClaims = () => claims.filter((claim) => claim.ts === "1700000000.000101");
      try {
        ingress.start();
        await ingress.waitForIdle();
        const trace = [];
        for (const [step, delayMs] of PACING_MS.entries()) {
          if (step === 3) {
            // A later message in the same conversation waits behind the held one.
            await enqueue(queue, "Ev-owner-2", "1700000000.000201", Date.now());
          }
          const before = ownerClaims().length;
          await advance(delayMs - 1);
          const early = ownerClaims().length > before;
          await advance(1);
          const onTime = ownerClaims().length > before;
          if (!onTime) {
            await advance(10 * 60_000);
          }
          trace.push({ delayMs, early, onTime, row: await rowState(queue, "Ev-owner-1") });
        }
        expect(trace).toEqual(
          PACING_MS.map((delayMs) => ({
            delayMs,
            early: false,
            onTime: true,
            row: { state: "pending", attempts: 0 },
          })),
        );
        expect(claims.map((claim) => claim.ts)).not.toContain("1700000000.000201");

        capacityFree = true;
        await advance(180_000);
        expect(admitted).toEqual(["1700000000.000101", "1700000000.000201"]);
        expect(ownerClaims()).toHaveLength(PACING_MS.length + 2);
        expect(await queue.listPending({ limit: "all" })).toEqual([]);
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      } finally {
        await ingress.stop();
      }
    });
  });

  it("retains an owner message by backpressure on a drop:new cap while an addressed arrival drops once", async () => {
    useIngressClock();
    await withQueue(async (queue) => {
      const { ingress, advance } = attachRoomIngress(queue);
      await enqueue(queue, "Ev-addressed", "1700000000.000101", Date.now());
      await enqueue(queue, "Ev-owner", "1700000000.000201", Date.now());
      const dispatched: Array<string | undefined> = [];
      let capacityFree = false;
      replyLane.dispatch.mockImplementation(async (prepared) => {
        const lifecycle = (prepared as PreparedSlackMessage).turnAdoptionLifecycle!;
        dispatched.push(prepared.message.ts);
        if (prepared.message.ts === "1700000000.000101") {
          // An addressed message keeps upstream drop:new: a terminal, undeferred refusal.
          await lifecycle.onDropped?.("queue-cap-new");
          return;
        }
        if (!capacityFree) {
          // drop:new refuses before deferral; the owner's room message is backpressure.
          refuse(lifecycle);
          return;
        }
        lifecycle.onDeferred?.();
        await lifecycle.onAdopted();
      });
      try {
        ingress.start();
        await ingress.waitForIdle();
        expect(await rowState(queue, "Ev-addressed")).toEqual({
          state: "failed",
          reason: "queue-cap-new",
        });
        expect(await rowState(queue, "Ev-owner")).toEqual({ state: "pending", attempts: 0 });
        await advance(1_000);
        expect(await rowState(queue, "Ev-owner")).toEqual({ state: "pending", attempts: 0 });
        capacityFree = true;
        await advance(2_000);
        expect(dispatched).toEqual([
          "1700000000.000101",
          "1700000000.000201",
          "1700000000.000201",
          "1700000000.000201",
        ]);
        expect(await queue.listPending({ limit: "all" })).toEqual([]);
        expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
          { id: "Ev-addressed", reason: "queue-cap-new" },
        ]);
      } finally {
        await ingress.stop();
      }
    });
  });

  it.each([
    {
      name: "a discarded ambient room event settles once and never replays",
      settle: async (lifecycle: ReplyLifecycle) => await lifecycle.onAdopted(),
      attempts: [],
    },
    {
      name: "an unprotected full-cap refusal spends one attempt each",
      settle: async (lifecycle: ReplyLifecycle, delivery: number) => {
        lifecycle.onDeferred?.();
        if (delivery < 2) {
          // Core never protects a non-owner or a bot: its refusal is abandonment.
          void lifecycle.onAbandoned?.();
          return;
        }
        await lifecycle.onAdopted();
      },
      attempts: [1, 2],
    },
  ])("keeps upstream accounting: $name", async ({ settle, attempts }) => {
    useIngressClock();
    await withQueue(async (queue) => {
      const { ingress, advance } = attachRoomIngress(queue);
      await enqueue(queue, "Ev-control", "1700000000.000101", Date.now());
      const seenAttempts: number[] = [];
      replyLane.dispatch.mockImplementation(async (prepared) => {
        await settle(
          (prepared as PreparedSlackMessage).turnAdoptionLifecycle!,
          replyLane.dispatch.mock.calls.length - 1,
        );
      });
      try {
        ingress.start();
        await ingress.waitForIdle();
        for (const delayMs of [1_000, 2_000]) {
          const row = await rowState(queue, "Ev-control");
          if (row.state === "pending") {
            seenAttempts.push(row.attempts ?? 0);
          }
          await advance(delayMs);
        }
        await advance(10 * 60_000);
        expect(seenAttempts).toEqual(attempts);
        expect(replyLane.dispatch).toHaveBeenCalledTimes(attempts.length + 1);
        expect(await queue.listPending({ limit: "all" })).toEqual([]);
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      } finally {
        await ingress.stop();
      }
    });
  });
});
