// Frond (karmaterminal): a cancelled turn spends no ingress attempt. An aged row at the retry
// ceiling whose queued turn is cancelled, alone or as a coalesced album member, is redelivered with
// its prior retry facts instead of being dead-lettered.
import {
  createChannelIngressQueueForTests,
  observeChannelIngressQueueWrite,
} from "openclaw/plugin-sdk/channel-ingress-test-runtime";
import { DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS } from "openclaw/plugin-sdk/channel-outbound";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { withOpenClawTestState } from "openclaw/plugin-sdk/test-state";
import { describe, expect, it, vi } from "vitest";
import { createTelegramMessageProcessor } from "./bot-message.js";
import {
  createTelegramSpooledReplayDeferredParticipant,
  type TelegramSpooledReplayDeferredParticipant,
} from "./bot-processing-outcome.js";
import { createTelegramIngressMonitor } from "./telegram-ingress-drain.js";
import type { TelegramSpooledUpdatePayload } from "./telegram-ingress-spool.payload.js";
import { telegramSpooledUpdateLaneKey } from "./telegram-ingress-spool.test-support.js";

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

const cfg: OpenClawConfig = {
  channels: { telegram: { allowFrom: ["111"], dmPolicy: "allowlist" } },
};

async function withQueue<T>(
  fn: (
    queue: ReturnType<typeof createChannelIngressQueueForTests<TelegramSpooledUpdatePayload>>,
  ) => Promise<T>,
) {
  return withOpenClawTestState(
    { layout: "state-only", prefix: "openclaw-telegram-ingress-cancelled-", applyEnv: false },
    ({ stateDir }) =>
      fn(
        createChannelIngressQueueForTests<TelegramSpooledUpdatePayload>({
          channelId: "telegram",
          accountId: "default",
          stateDir,
        }),
      ),
  );
}

function updatePayload(updateId: number) {
  return {
    version: 1,
    updateId,
    receivedAt: updateId,
    update: {
      update_id: updateId,
      message: { text: "hello", from: { id: 111 }, chat: { id: 111, type: "private" } },
    },
  } satisfies TelegramSpooledUpdatePayload;
}

describe("createTelegramIngressMonitor cancelled turns", () => {
  it("releases a coalesced member's aged row budget-free when its participant settles cancelled", async () => {
    await withQueue(async (queue) => {
      const eventId = "8".padStart(16, "0");
      const payload = { ...updatePayload(8), receivedAt: 1 };
      const laneKey = telegramSpooledUpdateLaneKey(payload.update);
      // Received long before the dead-letter age floor, with one try left.
      await queue.enqueue(eventId, payload, { laneKey, receivedAt: 1 });
      for (let attempt = 1; attempt < DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS; attempt += 1) {
        const claim = await queue.claim(eventId);
        if (!claim) {
          throw new Error("expected to claim the aged Telegram row");
        }
        await queue.release(claim, { lastError: "prior failure", releasedAt: 1 });
      }
      // A non-head album member only defers its participant; the coalesced
      // turn settles it later with the shared result.
      const participants: TelegramSpooledReplayDeferredParticipant[] = [];
      const arrivals = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
      const monitor = createTelegramIngressMonitor({
        queue,
        getConfig: () => cfg,
        accountId: "default",
        dispatch: async () => {
          const participant = createTelegramSpooledReplayDeferredParticipant(
            `test:coalesced-member-${participants.length}`,
          );
          if (participant) {
            participants.push(participant);
            arrivals[participants.length - 1]?.resolve();
          }
        },
      });

      try {
        monitor.start();
        await arrivals[0]?.promise;
        participants[0]?.settle({ kind: "cancelled" });

        // Cancellation spends no budget, so the drain redelivers the row.
        await arrivals[1]?.promise;
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
        expect(await queue.listClaims()).toEqual([
          expect.objectContaining({
            id: eventId,
            attempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS - 1,
            lastError: "prior failure",
          }),
        ]);
        const completed = observeChannelIngressQueueWrite(queue, "complete", eventId);
        participants[1]?.settle({ kind: "completed" });
        await expect(completed).resolves.toBe(true);
        expect(await queue.listClaims()).toEqual([]);
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      } finally {
        for (const participant of participants) {
          participant.settle({ kind: "skipped" });
        }
        await monitor.stop();
      }
    });
  });

  it("keeps an aged row at the retry ceiling recoverable when its queued turn is cancelled", async () => {
    await withQueue(async (queue) => {
      const eventId = "7".padStart(16, "0");
      const update = {
        update_id: 7,
        message: {
          message_id: 456,
          text: "hello",
          from: { id: 111 },
          chat: { id: 111, type: "private" },
        },
      };
      const laneKey = telegramSpooledUpdateLaneKey(update);
      // Received long before the dead-letter age floor, with one try left.
      await queue.enqueue(
        eventId,
        { version: 1, updateId: 7, receivedAt: 1, update },
        { laneKey, receivedAt: 1 },
      );
      for (let attempt = 1; attempt < DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS; attempt += 1) {
        const claim = await queue.claim(eventId);
        if (!claim) {
          throw new Error("expected to claim the aged Telegram row");
        }
        await queue.release(claim, { lastError: "prior failure", releasedAt: 1 });
      }

      buildTelegramMessageContext.mockResolvedValue({
        cfg: {},
        chatId: 111,
        ctxPayload: {
          From: "telegram:111",
          To: "telegram:111",
          ChatType: "direct",
          RawBody: "hello",
        },
        primaryCtx: { me: { username: "openclaw_bot" } },
        route: { sessionKey: "agent:main:main" },
        sendTyping: vi.fn().mockResolvedValue(undefined),
      });
      const finishRedelivery = Promise.withResolvers<void>();
      const redelivered = Promise.withResolvers<void>();
      dispatchTelegramMessage
        .mockImplementationOnce(async ({ turnAdoptionLifecycle }) => {
          turnAdoptionLifecycle?.onDeferred?.();
          // The reply lane settles a cleared queued turn through onCancelled and
          // falls back to abandonment only when the lifecycle cannot cancel.
          if (turnAdoptionLifecycle?.onCancelled) {
            void turnAdoptionLifecycle.onCancelled();
          } else {
            turnAdoptionLifecycle?.onAbandoned?.();
          }
          return { kind: "completed" };
        })
        .mockImplementationOnce(async ({ turnAdoptionLifecycle }) => {
          redelivered.resolve();
          await finishRedelivery.promise;
          await turnAdoptionLifecycle?.onAdopted();
          return { kind: "completed" };
        });
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
      const monitor = createTelegramIngressMonitor({
        queue,
        getConfig: () => cfg,
        accountId: "default",
        dispatch: async (claimed) =>
          await processMessage({
            ctx: { message: update.message, update: claimed } as unknown as Parameters<
              typeof processMessage
            >[0]["ctx"],
            allMedia: [],
            storeAllowFrom: [],
            turnContext: { cfg: {}, telegramCfg: {} },
          }),
      });

      try {
        monitor.start();
        // Cancellation spends no budget, so the drain redelivers the row with
        // its prior retry facts instead of dead-lettering it.
        await redelivered.promise;
        expect(dispatchTelegramMessage).toHaveBeenCalledTimes(2);
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
        expect(await queue.listClaims()).toEqual([
          expect.objectContaining({
            id: eventId,
            attempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS - 1,
            lastError: "prior failure",
          }),
        ]);
        const completed = observeChannelIngressQueueWrite(queue, "complete", eventId);
        finishRedelivery.resolve();
        await expect(completed).resolves.toBe(true);
        expect(await queue.listClaims()).toEqual([]);
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      } finally {
        finishRedelivery.resolve();
        await monitor.stop();
      }
    });
  });
});
