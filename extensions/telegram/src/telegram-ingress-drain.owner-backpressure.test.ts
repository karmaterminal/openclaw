// Frond (karmaterminal, #1564): core settles the human owner's room message refused at a full
// protected reply queue as backpressure. Telegram's spooled lifecycle must carry it to the durable
// retry owner as a paced retry that spends no attempt, while other settlements keep their accounting.
import {
  closeOpenClawStateDatabaseForTest,
  createChannelIngressQueueForTests,
} from "openclaw/plugin-sdk/channel-ingress-test-runtime";
import type { GetReplyOptions } from "openclaw/plugin-sdk/reply-runtime";
import { withOpenClawTestState } from "openclaw/plugin-sdk/test-state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTelegramMessageProcessor } from "./bot-message.js";
import {
  createTelegramSpooledReplayDeferredParticipant,
  type TelegramSpooledReplayDeferredParticipant,
} from "./bot-processing-outcome.js";
import { createTelegramIngressMonitor } from "./telegram-ingress-drain.js";
import type { TelegramSpooledUpdatePayload } from "./telegram-ingress-spool.payload.js";
import { telegramSpooledUpdateLaneKey } from "./telegram-ingress-spool.test-support.js";

type OwnerReplyLifecycle = NonNullable<GetReplyOptions["turnAdoptionLifecycle"]>;
type Queue = ReturnType<typeof createChannelIngressQueueForTests<TelegramSpooledUpdatePayload>>;

const buildTelegramMessageContext = vi.hoisted(() => vi.fn());
const dispatchTelegramMessage = vi.hoisted(() => vi.fn());

// mock-isolation: dispatch stands in for core's reply lane. The durable spool, the drain and its
// retry owner, the spooled-replay participant and the message processor's lifecycle are real.
vi.mock("./bot-message-context.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bot-message-context.js")>()),
  buildTelegramMessageContext,
}));
vi.mock("./bot-message-dispatch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bot-message-dispatch.js")>()),
  dispatchTelegramMessage,
}));

const HOUR_MS = 60 * 60_000;
// The ingress backoff for attempt-free retries: 1 s doubling to the 3 min cap.
const PACING_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 180_000, 180_000];

function roomUpdate(updateId: number) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      text: "room message",
      from: { id: 111, is_bot: false },
      chat: { id: -100123, type: "supergroup" },
    },
  };
}

async function enqueueRoomUpdate(queue: Queue, updateId: number, receivedAt: number) {
  const update = roomUpdate(updateId);
  await queue.enqueue(
    String(updateId).padStart(16, "0"),
    { version: 1, updateId, receivedAt, update },
    { laneKey: telegramSpooledUpdateLaneKey(update), receivedAt },
  );
}

async function roomRowState(queue: Queue, updateId: number) {
  const id = String(updateId).padStart(16, "0");
  const pending = (await queue.listPending({ limit: "all" })).find((row) => row.id === id);
  if (pending) {
    return { state: "pending", attempts: pending.attempts };
  }
  const failed = (await queue.listFailed?.({ limit: "all" }))?.find((row) => row.id === id);
  return failed ? { state: "failed", reason: failed.reason } : { state: "settled" };
}

// Core's mailbox notifier settles a backpressure disposition through onBackpressure and falls
// back to abandonment only for a lifecycle without it (session-controller.mailbox-source.ts).
function refuseAtFullCap(lifecycle: OwnerReplyLifecycle) {
  void (lifecycle.onBackpressure ? lifecycle.onBackpressure() : lifecycle.onAbandoned?.());
}

type OwnerRoomHarness = {
  queue: Queue;
  advance: (ms: number) => Promise<void>;
  restart: () => Promise<void>;
};

async function withOwnerRoomIngress(
  run: (harness: OwnerRoomHarness) => Promise<void>,
  seed: (queue: Queue) => Promise<void> = async () => {},
) {
  // The queue and monitor capture their clock at construction.
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  await withOpenClawTestState(
    { layout: "state-only", prefix: "openclaw-telegram-owner-backpressure-", applyEnv: false },
    async ({ stateDir }) => {
      const openQueue = () =>
        createChannelIngressQueueForTests<TelegramSpooledUpdatePayload>({
          channelId: "telegram",
          accountId: "default",
          stateDir,
        });
      const queue = openQueue();
      const processMessage = createTelegramMessageProcessor({
        bot: {},
        account: {},
        historyLimit: 0,
        dmPolicy: {},
        allowFrom: [],
        groupAllowFrom: [],
        ackReactionScope: "none",
        logger: {},
        resolveGroupActivation: () => true,
        resolveGroupRequireMention: () => false,
        resolveTelegramGroupConfig: () => ({}),
        runtime: {},
        replyToMode: "auto",
        streamMode: "partial",
        textLimit: 4096,
        opts: {},
      } as unknown as Parameters<typeof createTelegramMessageProcessor>[0]);
      const createMonitor = (monitorQueue = queue) =>
        createTelegramIngressMonitor({
          queue: monitorQueue,
          getConfig: () => ({}),
          accountId: "default",
          adoptionStallTimeoutMs: 10 * 60_000,
          dispatch: async (claimed) =>
            await processMessage({
              ctx: {
                message: (claimed as ReturnType<typeof roomUpdate>).message,
                update: claimed,
              } as unknown as Parameters<typeof processMessage>[0]["ctx"],
              allMedia: [],
              storeAllowFrom: [],
              turnContext: { cfg: {}, telegramCfg: {} },
            }),
        });
      let monitor = createMonitor();
      const start = async () => {
        monitor.start();
        await monitor.waitForIdle();
      };
      const advance = async (ms: number) => {
        await vi.advanceTimersByTimeAsync(ms);
        await monitor.waitForIdle();
      };
      // A process restart reopens the queue, whose retry owner keeps pacing in memory.
      const restart = async () => {
        await monitor.stop();
        monitor = createMonitor(openQueue());
        await start();
      };
      try {
        await seed(queue);
        await start();
        await run({ queue, advance, restart });
      } finally {
        await monitor.stop();
      }
    },
  );
}

function onRoomDispatch(
  settle: (lifecycle: OwnerReplyLifecycle, messageId: number) => Promise<void>,
) {
  dispatchTelegramMessage.mockImplementation(async ({ context, turnAdoptionLifecycle }) => {
    await settle(turnAdoptionLifecycle, context.messageId);
    return { kind: "completed" };
  });
}

describe("Telegram owner backpressure", () => {
  beforeEach(() => {
    dispatchTelegramMessage.mockReset();
    buildTelegramMessageContext.mockReset().mockImplementation(async ({ primaryCtx }) => ({
      cfg: {},
      chatId: -100123,
      messageId: primaryCtx.message.message_id,
      ctxPayload: { From: "telegram:group:-100123", ChatType: "group", RawBody: "room message" },
      primaryCtx: { me: { username: "openclaw_bot" } },
      route: { sessionKey: "agent:main:telegram:group:-100123" },
      sendTyping: vi.fn().mockResolvedValue(undefined),
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
    closeOpenClawStateDatabaseForTest();
  });

  it("holds a refused owner message past 24 h and 8 refusals with no attempt spent, paced, then admits each once in order", async () => {
    const claims: Array<{ messageId: number; at: number }> = [];
    const admitted: number[] = [];
    let capacityFree = false;
    onRoomDispatch(async (lifecycle, messageId) => {
      claims.push({ messageId, at: Date.now() });
      // drop:old / drop:summarize: core defers the source before overflow refuses it.
      lifecycle.onDeferred?.();
      if (!capacityFree) {
        refuseAtFullCap(lifecycle);
        return;
      }
      admitted.push(messageId);
      await lifecycle.onAdopted();
    });
    const ownerClaims = () => claims.filter((claim) => claim.messageId === 101);
    await withOwnerRoomIngress(
      async ({ queue, advance }) => {
        const trace = [];
        for (const [step, delayMs] of PACING_MS.entries()) {
          if (step === 3) {
            // A later message in the same chat waits behind the held one.
            await enqueueRoomUpdate(queue, 102, Date.now());
          }
          const before = ownerClaims().length;
          await advance(delayMs - 1);
          const early = ownerClaims().length > before;
          await advance(1);
          const onTime = ownerClaims().length > before;
          if (!onTime) {
            await advance(10 * 60_000);
          }
          trace.push({ delayMs, early, onTime, row: await roomRowState(queue, 101) });
        }
        expect(trace).toEqual(
          PACING_MS.map((delayMs) => ({
            delayMs,
            early: false,
            onTime: true,
            row: { state: "pending", attempts: 0 },
          })),
        );
        expect(claims.map((claim) => claim.messageId)).not.toContain(102);

        capacityFree = true;
        await advance(180_000);
        expect(admitted).toEqual([101, 102]);
        expect(ownerClaims()).toHaveLength(PACING_MS.length + 2);
        expect(await queue.listPending({ limit: "all" })).toEqual([]);
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
        // Already past the dead-letter age floor when the monitor first claims it.
      },
      async (queue) => await enqueueRoomUpdate(queue, 101, Date.now() - 25 * HOUR_MS),
    );
  });

  it("retains an owner message by backpressure on a drop:new cap while an addressed arrival drops once", async () => {
    const dispatched: number[] = [];
    let capacityFree = false;
    onRoomDispatch(async (lifecycle, messageId) => {
      dispatched.push(messageId);
      if (messageId === 101) {
        // An addressed message keeps upstream drop:new: a terminal, undeferred refusal.
        await lifecycle.onDropped?.("queue-cap-new");
        return;
      }
      if (!capacityFree) {
        // drop:new refuses before deferral; the owner's room message is backpressure.
        refuseAtFullCap(lifecycle);
        return;
      }
      lifecycle.onDeferred?.();
      await lifecycle.onAdopted();
    });
    await withOwnerRoomIngress(
      async ({ queue, advance }) => {
        expect(await roomRowState(queue, 101)).toEqual({
          state: "failed",
          reason: "queue-cap-new",
        });
        expect(await roomRowState(queue, 102)).toEqual({ state: "pending", attempts: 0 });
        await advance(1_000);
        expect(await roomRowState(queue, 102)).toEqual({ state: "pending", attempts: 0 });
        capacityFree = true;
        await advance(2_000);
        expect(dispatched).toEqual([101, 102, 102, 102]);
        expect(await queue.listPending({ limit: "all" })).toEqual([]);
        expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
          { reason: "queue-cap-new" },
        ]);
      },
      async (queue) => {
        await enqueueRoomUpdate(queue, 101, Date.now());
        await enqueueRoomUpdate(queue, 102, Date.now());
      },
    );
  });

  it.each([
    {
      name: "a discarded ambient room event settles once and never replays",
      settle: async (lifecycle: OwnerReplyLifecycle) => await lifecycle.onAdopted(),
      attempts: [],
    },
    {
      name: "an unprotected full-cap refusal spends one attempt each",
      settle: async (lifecycle: OwnerReplyLifecycle, delivery: number) => {
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
    onRoomDispatch(async (lifecycle) =>
      settle(lifecycle, dispatchTelegramMessage.mock.calls.length - 1),
    );
    await withOwnerRoomIngress(
      async ({ queue, advance }) => {
        const seenAttempts: number[] = [];
        for (const delayMs of [1_000, 2_000]) {
          const row = await roomRowState(queue, 101);
          if (row.state === "pending") {
            seenAttempts.push(row.attempts ?? 0);
          }
          await advance(delayMs);
        }
        await advance(10 * 60_000);
        expect(seenAttempts).toEqual(attempts);
        expect(dispatchTelegramMessage).toHaveBeenCalledTimes(attempts.length + 1);
        expect(await queue.listPending({ limit: "all" })).toEqual([]);
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      },
      async (queue) => await enqueueRoomUpdate(queue, 101, Date.now()),
    );
  });

  it("keeps a held owner message attempt-free across a restart, whose fresh drain redelivers it", async () => {
    const claimedAt: number[] = [];
    let capacityFree = false;
    onRoomDispatch(async (lifecycle) => {
      claimedAt.push(Date.now());
      lifecycle.onDeferred?.();
      if (!capacityFree) {
        refuseAtFullCap(lifecycle);
        return;
      }
      await lifecycle.onAdopted();
    });
    await withOwnerRoomIngress(
      async ({ queue, advance, restart }) => {
        await advance(1_000);
        expect(await roomRowState(queue, 101)).toEqual({ state: "pending", attempts: 0 });
        // The pacing record lives with the retry owner, so a fresh drain claims at once.
        const restartedAt = Date.now();
        await restart();
        expect(claimedAt).toEqual([restartedAt - 1_000, restartedAt, restartedAt]);
        expect(await roomRowState(queue, 101)).toEqual({ state: "pending", attempts: 0 });
        capacityFree = true;
        await advance(1_000);
        expect(claimedAt).toHaveLength(4);
        expect(await queue.listPending({ limit: "all" })).toEqual([]);
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      },
      async (queue) => await enqueueRoomUpdate(queue, 101, Date.now() - 25 * HOUR_MS),
    );
  });

  it("retries a coalesced member paced and budget-free when its participant settles backpressure", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    await withOpenClawTestState(
      { layout: "state-only", prefix: "openclaw-telegram-owner-backpressure-", applyEnv: false },
      async ({ stateDir }) => {
        const queue = createChannelIngressQueueForTests<TelegramSpooledUpdatePayload>({
          channelId: "telegram",
          accountId: "default",
          stateDir,
        });
        await enqueueRoomUpdate(queue, 103, Date.now() - 25 * HOUR_MS);
        // A non-head album member only defers its participant; the coalesced
        // turn settles it later with the shared result.
        const participants: TelegramSpooledReplayDeferredParticipant[] = [];
        const monitor = createTelegramIngressMonitor({
          queue,
          getConfig: () => ({}),
          accountId: "default",
          dispatch: async () => {
            const participant = createTelegramSpooledReplayDeferredParticipant(
              `test:backpressure-member-${participants.length}`,
            );
            if (participant) {
              participants.push(participant);
            }
          },
        });
        try {
          monitor.start();
          await monitor.waitForIdle();
          participants[0]?.settle({ kind: "backpressure" });
          await monitor.waitForDeferredClaims();
          expect(await roomRowState(queue, 103)).toEqual({ state: "pending", attempts: 0 });
          await vi.advanceTimersByTimeAsync(999);
          await monitor.waitForIdle();
          expect(participants).toHaveLength(1);
          await vi.advanceTimersByTimeAsync(1);
          await monitor.waitForIdle();
          expect(participants).toHaveLength(2);
          participants[1]?.settle({ kind: "completed" });
          await monitor.waitForDeferredClaims();
          expect(await queue.listPending({ limit: "all" })).toEqual([]);
          expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
        } finally {
          for (const participant of participants) {
            participant.settle({ kind: "skipped" });
          }
          await monitor.stop();
        }
      },
    );
  });
});
