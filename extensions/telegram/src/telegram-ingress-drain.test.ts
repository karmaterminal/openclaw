import { GrammyError } from "grammy";
import {
  closeOpenClawStateDatabaseForTest,
  createChannelIngressQueueForTests,
  observeChannelIngressQueueWrite,
} from "openclaw/plugin-sdk/channel-ingress-test-runtime";
import { DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS } from "openclaw/plugin-sdk/channel-outbound";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import type { GetReplyOptions } from "openclaw/plugin-sdk/reply-runtime";
import { closeOpenClawStateDatabaseAsync } from "openclaw/plugin-sdk/sqlite-runtime-testing";
import { withOpenClawTestState } from "openclaw/plugin-sdk/test-state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTelegramMessageProcessor } from "./bot-message.js";
import {
  createTelegramSpooledReplayDeferredParticipant,
  recordTelegramMessageProcessingResult,
  resolveTelegramUpdateReceivedAtSeconds,
  runWithTelegramUpdateProcessingFrame,
  type TelegramSpooledReplayDeferredParticipant,
} from "./bot-processing-outcome.js";
import { telegramBotInfoForTest } from "./bot.create-telegram-bot.test-support.js";
import { resolveTelegramForumFlag } from "./bot/helpers.js";
import { commitTelegramMessageDispatchReplay } from "./message-dispatch-dedupe.js";
import { createTelegramIngressMonitor } from "./telegram-ingress-drain.js";
import {
  TelegramIngressPayloadError,
  type TelegramSpooledUpdatePayload,
} from "./telegram-ingress-spool.payload.js";
import { telegramSpooledUpdateLaneKey } from "./telegram-ingress-spool.test-support.js";

const buildTelegramMessageContext = vi.hoisted(() => vi.fn());
const dispatchTelegramMessage = vi.hoisted(() => vi.fn());

vi.mock("./bot-message-context.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bot-message-context.js")>()),
  buildTelegramMessageContext,
}));

vi.mock("./bot-message-dispatch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bot-message-dispatch.js")>()),
  dispatchTelegramMessage,
}));

type MonitorOptions = Parameters<typeof createTelegramIngressMonitor>[0];
type Queue = MonitorOptions["queue"];
type MakeMonitor = (
  options: Omit<MonitorOptions, "queue" | "getConfig" | "accountId">,
) => ReturnType<typeof createTelegramIngressMonitor>;

function createFixture(stateDir: string) {
  const queue = createChannelIngressQueueForTests<TelegramSpooledUpdatePayload>({
    channelId: "telegram",
    accountId: "default",
    stateDir,
  });
  return {
    stateDir,
    queue,
    monitor: (options: Parameters<MakeMonitor>[0]) =>
      createTelegramIngressMonitor({ queue, ...monitorDefaults, ...options }),
    enqueue: async (updateId: number, callback = false) => {
      const payload = callback ? callbackPayload(updateId) : updatePayload(updateId);
      const eventId = String(updateId).padStart(16, "0");
      const laneKey = telegramSpooledUpdateLaneKey(payload.update);
      await queue.enqueue(eventId, payload, { laneKey });
      return { eventId, payload, laneKey };
    },
  };
}
async function withTempState<T>(fn: (fixture: ReturnType<typeof createFixture>) => Promise<T>) {
  return withOpenClawTestState(
    { layout: "state-only", prefix: "openclaw-telegram-ingress-drain-", applyEnv: false },
    ({ stateDir }) => fn(createFixture(stateDir)),
  );
}

const cfg: OpenClawConfig = {
  channels: { telegram: { allowFrom: ["111"], dmPolicy: "allowlist" } },
};
const monitorDefaults = { getConfig: () => cfg, accountId: "default" };

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

function callbackPayload(updateId: number) {
  const payload = updatePayload(updateId);
  return {
    ...payload,
    update: {
      update_id: updateId,
      callback_query: {
        id: `callback-${updateId}`,
        data: "choice",
        from: { id: 111 },
        message: payload.update.message,
      },
    },
  } satisfies TelegramSpooledUpdatePayload;
}

function telegramSendError(errorCode: number, description: string): GrammyError {
  return new GrammyError(
    "Call to 'sendMessage' failed",
    { ok: false, error_code: errorCode, description },
    "sendMessage",
    { chat_id: 111 },
  );
}

function forumFlag(chatId: number, isForum: boolean) {
  return resolveTelegramForumFlag({ chatId, chatType: "supergroup", isGroup: true, isForum });
}

async function createTelegramMessageDispatchReplayForgetError(): Promise<unknown> {
  type ReplayGuard = Parameters<typeof commitTelegramMessageDispatchReplay>[0]["guard"];
  type ReplayClaim = import("openclaw/plugin-sdk/persistent-dedupe").ChannelReplayClaimHandle;
  const diskError = new Error("dedupe disk write failed");
  const guard: ReplayGuard = {
    claim: async () => ({ kind: "invalid" }),
    forget: async (event) => !("keys" in event && event.keys?.[0] === "first"),
    warmup: async () => 0,
  };
  const claims: ReplayClaim[] = ["first", "second"].map((key) => ({
    keys: [key],
    commit: async (options) => {
      if (key === "second") {
        options?.onDiskError?.(diskError);
      }
      return true;
    },
    release: () => undefined,
  }));
  try {
    await commitTelegramMessageDispatchReplay({ guard, claims, requirePersistent: true });
  } catch (error) {
    return error;
  }
  throw new Error("expected Telegram dispatch rollback failure");
}

const deferred = <T = void>() => Promise.withResolvers<T>();

async function startDeferred(makeMonitor: MakeMonitor, name: string) {
  const participant: { current?: TelegramSpooledReplayDeferredParticipant } = {};
  const dispatch = vi.fn(async () => {
    participant.current = createTelegramSpooledReplayDeferredParticipant(name) ?? undefined;
  });
  const monitor = makeMonitor({ dispatch });
  monitor.start();
  await vi.waitFor(() => expect(participant.current).toBeDefined());
  return { monitor, participant, dispatch };
}

async function expectPending(queue: Queue, rows: Array<Record<string, unknown>>) {
  expect(await queue.listPending({ limit: "all" })).toMatchObject(rows);
}

async function waitPending(queue: Queue, rows: Array<Record<string, unknown>>) {
  await vi.waitFor(() => expectPending(queue, rows));
}

describe("createTelegramIngressMonitor", () => {
  it.each([
    {
      name: "wrapped callback authority rejection",
      callback: true,
      error: new Error("spooled callback failed", {
        cause: new Error("Gateway requester authority changed"),
      }),
      reason: "callback-authority-changed",
      message: "Gateway requester authority changed",
    },
    {
      name: "deferred callback authority rejection",
      callback: true,
      deferred: true,
      error: new Error("Gateway requester authority changed"),
      reason: "callback-authority-changed",
      message: "Gateway requester authority changed",
    },
    {
      name: "expired callback query",
      callback: true,
      error: new GrammyError(
        "Call to 'answerCallbackQuery' failed",
        {
          ok: false,
          error_code: 400,
          description:
            "Bad Request: query is too old and response timeout expired or query ID is invalid",
        },
        "answerCallbackQuery",
        { callback_query_id: "expired-callback" },
      ),
      reason: "callback-query-expired",
      message: "query is too old",
    },
    {
      name: "blocked Telegram recipient",
      error: telegramSendError(403, "Forbidden: bot was blocked by the user"),
      reason: "recipient-unreachable",
      message: "bot was blocked by the user",
    },
    {
      name: "wrapped missing harness",
      error: new Error("Agent turn failed", {
        cause: new Error('Requested agent harness "missing-harness-85470" is not registered.'),
      }),
      reason: "missing-agent-harness",
      message: 'Requested agent harness "missing-harness-85470" is not registered.',
    },
    {
      name: "wrapped archived session rejection",
      error: new Error("Command failed", {
        cause: Object.assign(new Error("Restore the archived session before starting work."), {
          name: "SessionWorkStartError",
          reason: "archived",
          retryable: false,
        }),
      }),
      reason: "session-archived",
      message: "Restore the archived session before starting work.",
    },
  ])("dead-letters a $name and releases the next same-chat update", async (testCase) => {
    const { error, reason, message } = testCase;
    const callback = "callback" in testCase && testCase.callback;
    await withTempState(async ({ queue, monitor: makeMonitor, enqueue }) => {
      const { eventId } = await enqueue(3, callback);
      await enqueue(4);
      const dispatch = vi
        .fn<MonitorOptions["dispatch"]>()
        .mockImplementationOnce(async () => {
          if ("deferred" in testCase && testCase.deferred) {
            const participant = createTelegramSpooledReplayDeferredParticipant("callback");
            participant?.settle({ kind: "failed-retryable", error });
            return undefined;
          }
          return { kind: "failed-retryable", error };
        })
        .mockResolvedValue({ kind: "completed" });
      const monitor = makeMonitor({ dispatch });

      monitor.start();
      await monitor.waitForIdle();

      expect(dispatch.mock.calls.map(([update]) => update)).toEqual([
        (callback ? callbackPayload(3) : updatePayload(3)).update,
        updatePayload(4).update,
      ]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([
        expect.objectContaining({
          id: eventId,
          reason,
          message: expect.stringContaining(message),
        }),
      ]);
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      await monitor.stop();
    });
  });

  it("keeps a fresh admission lane when the forum cache changes during ACK", async () => {
    await withTempState(async ({ queue, monitor: makeMonitor }) => {
      const update = {
        update_id: 17,
        message: {
          text: "hello",
          from: { id: 111 },
          chat: { id: -9017, type: "supergroup" },
        },
      };
      await forumFlag(-9017, false);
      const ackEntered = deferred();
      const ackRelease = deferred();
      const receivedAt = 1_700_000_000_000;
      const delivered: Array<{ laneKey: string | undefined; receivedAt: number }> = [];
      const monitor = makeMonitor({
        botInfo: telegramBotInfoForTest,
        onDurableAdmission: async () => {
          ackEntered.resolve();
          await ackRelease.promise;
        },
        dispatch: async (raw, lifecycle) => {
          const [claim] = await queue.listClaims();
          delivered.push({
            laneKey: claim?.laneKey,
            receivedAt: resolveTelegramUpdateReceivedAtSeconds(raw),
          });
          await lifecycle.onAdopted();
          return { kind: "completed" };
        },
      });
      monitor.start();
      await monitor.waitForIdle();
      const admission = monitor.admit(update, { receivedAt });
      try {
        await ackEntered.promise;
        expect(await queue.listClaims()).toEqual([
          expect.objectContaining({ laneKey: "telegram:-9017", attempts: 0 }),
        ]);
        expect(delivered).toEqual([]);
        await forumFlag(-9017, true);
        ackRelease.resolve();
        await admission;
        await monitor.waitForIdle();
        expect(delivered).toEqual([{ laneKey: "telegram:-9017", receivedAt: 1_700_000_000 }]);
        expect(await monitor.admit(update)).toMatchObject({
          kind: "durable",
          queueResult: { kind: "completed" },
        });
        expect(delivered).toHaveLength(1);
      } finally {
        ackRelease.resolve();
        await admission;
        await monitor.stop();
      }
    });
  });

  it("reconciles a cached General topic when private bot topics are disabled", async () => {
    await withTempState(async ({ queue, monitor: makeMonitor }) => {
      const eventId = "9".padStart(16, "0");
      const payload = updatePayload(9);
      payload.update.message.chat = { id: -9003, type: "supergroup" };
      await forumFlag(-9003, true);
      await queue.enqueue(eventId, payload, { laneKey: "telegram:-9003" });

      const dispatch = vi.fn(async (_update, lifecycle) => {
        expect(await queue.listClaims()).toEqual([
          expect.objectContaining({ laneKey: "telegram:-9003:topic:1" }),
        ]);
        await lifecycle.onAdopted();
        return { kind: "completed" as const };
      });
      const monitor = makeMonitor({
        botInfo: { id: 999, has_topics_enabled: false } as never,
        dispatch,
      });

      monitor.start();
      await monitor.waitForIdle();

      expect(dispatch).toHaveBeenCalledOnce();
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      await monitor.stop();
    });
  });

  it.each([
    {
      name: "private topic",
      updateKind: "edited_message",
      chat: { id: 1234, type: "private" },
      topic: { message_thread_id: 42 },
      laneKey: "telegram:1234:topic:42",
    },
    {
      name: "edited_channel_post",
      updateKind: "edited_channel_post",
      chat: { id: -1234, type: "channel" },
      topic: {},
      laneKey: "telegram:-1234",
    },
    {
      name: "mismatched Direct Messages lane telegram:-1234:approval",
      updateKind: "message",
      chat: { id: -1234, type: "supergroup", is_direct_messages: true },
      topic: { direct_messages_topic: { topic_id: 42 }, message_thread_id: 99 },
      laneKey: "telegram:-1234:approval",
      reject: true,
    },
  ])("replays promoted controls after restart: $name", async (testCase) => {
    await withTempState(async ({ stateDir }) => {
      const queueOptions = { channelId: "telegram", accountId: "default", stateDir };
      const update = {
        update_id: 136,
        [testCase.updateKind]: {
          message_id: 1,
          date: 1_736_380_800,
          from: { id: 111, is_bot: false, first_name: "Ada" },
          chat: testCase.chat,
          ...testCase.topic,
          text: "/models@openclaw_bot",
        },
      };
      const eventId = String(update.update_id).padStart(16, "0");
      const payload = { ...updatePayload(136), receivedAt: 1_736_382_000_123, update };
      await createChannelIngressQueueForTests<TelegramSpooledUpdatePayload>(queueOptions).enqueue(
        eventId,
        payload,
        { laneKey: testCase.laneKey },
      );
      await closeOpenClawStateDatabaseAsync();
      closeOpenClawStateDatabaseForTest();

      const queue = createChannelIngressQueueForTests<TelegramSpooledUpdatePayload>(queueOptions);
      const controlLaneKey = `telegram:${testCase.chat.id}:control`;
      const dispatch = vi.fn(async (dispatchedUpdate: unknown) => {
        expect(resolveTelegramUpdateReceivedAtSeconds(dispatchedUpdate)).toBe(1_736_382_000);
        expect(await queue.listClaims()).toMatchObject([{ laneKey: controlLaneKey }]);
        return { kind: "completed" as const };
      });
      const monitor = createTelegramIngressMonitor({
        queue,
        ...monitorDefaults,
        botInfo: {
          ...telegramBotInfoForTest,
          has_topics_enabled: true,
        },
        dispatch,
      });
      try {
        monitor.start();
        await monitor.waitForIdle();
        if ("reject" in testCase && testCase.reject) {
          expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
            { reason: "invalid-event", laneKey: testCase.laneKey },
          ]);
          expect(dispatch).not.toHaveBeenCalled();
        } else {
          expect(dispatch).toHaveBeenCalledExactlyOnceWith(update, expect.any(Object));
          expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
          const replay = await queue.enqueue(eventId, payload, { laneKey: controlLaneKey });
          expect(replay.kind).toBe("completed");
        }
        expect(await queue.listPending()).toEqual([]);
      } finally {
        await monitor.stop();
      }
    });
  });

  it.each([
    new Error("late provider blip"),
    new Error("Gateway requester authority changed"),
    Object.assign(new Error("workspace is not ready"), {
      name: "SessionWorkStartError",
      reason: "workspace_pending",
      retryable: true,
    }),
    new Error("Session is archived"),
  ])("preserves retry for a late deferred failure: %s", async (error) => {
    await withTempState(async ({ queue, monitor: makeMonitor, enqueue }) => {
      const { eventId } = await enqueue(4);
      const { monitor, participant } = await startDeferred(makeMonitor, "test:late-retry");
      expect(await queue.listClaims()).toHaveLength(1);
      participant.current?.settle({ kind: "failed-retryable", error });

      await waitPending(queue, [{ id: eventId, attempts: 1, lastError: error.message }]);
      await monitor.stop();
    });
  });

  it("dead-letters a deferred queue-cap drop instead of completing the spool row", async () => {
    await withTempState(async ({ queue, monitor: makeMonitor, enqueue }) => {
      const { eventId } = await enqueue(6);
      const { monitor, participant } = await startDeferred(makeMonitor, "test:late-queue-cap");
      participant.current?.settle({ kind: "dropped", reason: "queue-cap-old" });

      await vi.waitFor(async () =>
        expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
          { id: eventId, reason: "queue-cap-old" },
        ]),
      );
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      await monitor.stop();
    });
  });

  it("dead-letters a late deferred dispatch dedupe rollback failure", async () => {
    await withTempState(async ({ queue, monitor: makeMonitor, enqueue }) => {
      const { eventId } = await enqueue(5);
      const { monitor, participant, dispatch } = await startDeferred(
        makeMonitor,
        "test:late-fatal",
      );
      participant.current?.settle({
        kind: "failed-retryable",
        error: await createTelegramMessageDispatchReplayForgetError(),
      });

      await vi.waitFor(async () =>
        expect(await queue.listFailed?.({ limit: "all" })).toMatchObject([
          { id: eventId, reason: "dispatch-dedupe-rollback-failed" },
        ]),
      );
      await monitor.waitForIdle();
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect(await queue.listClaims()).toEqual([]);
      expect(dispatch).toHaveBeenCalledOnce();
      await monitor.stop();
    });
  });

  it("releases an aborted deferred claim after a late completed settlement", async () => {
    await withTempState(async ({ queue, monitor: makeMonitor, enqueue }) => {
      const { eventId, payload, laneKey } = await enqueue(6);
      const { monitor, participant } = await startDeferred(makeMonitor, "test:late-completed");
      await monitor.stop();
      expect(await queue.listClaims()).toEqual([]);
      await expectPending(queue, [{ id: eventId, attempts: 0 }]);

      participant.current?.settle({ kind: "completed" });
      await waitPending(queue, [{ id: eventId, attempts: 0 }]);
      expect((await queue.listPending({ limit: "all" }))[0]?.lastError).toBeUndefined();
      expect((await queue.enqueue(eventId, payload, { laneKey })).kind).not.toBe("completed");
    });
  });

  it("uses participant settlement to own the row despite frame completion after abort", async () => {
    await withTempState(async ({ queue, monitor: makeMonitor, enqueue }) => {
      const { eventId, payload, laneKey } = await enqueue(8);
      const started = deferred();
      const monitor = makeMonitor({
        dispatch: async (_update, lifecycle) => {
          const { result } = await runWithTelegramUpdateProcessingFrame(async () => {
            const participant = createTelegramSpooledReplayDeferredParticipant("test:inline-abort");
            expect(participant).not.toBeNull();
            const aborted = new Promise<void>((resolve) => {
              lifecycle.abortSignal.addEventListener("abort", () => resolve(), { once: true });
            });
            started.resolve();
            await aborted;
            recordTelegramMessageProcessingResult({ kind: "completed" });
            participant?.settle({ kind: "skipped" });
            await participant?.task;
          });
          return result;
        },
      });

      monitor.start();
      await started.promise;
      await monitor.stop();

      await expectPending(queue, [{ id: eventId, attempts: 0 }]);
      expect((await queue.listPending({ limit: "all" }))[0]?.lastError).toBeUndefined();
      expect((await queue.enqueue(eventId, payload, { laneKey })).kind).not.toBe("completed");
    });
  });

  it("uses participant adoption to own the row despite a failed frame outcome", async () => {
    await withTempState(async ({ queue, monitor: makeMonitor, enqueue }) => {
      const { eventId, payload, laneKey } = await enqueue(8);
      const release = vi.spyOn(queue, "release");
      const monitor = makeMonitor({
        dispatch: async () => {
          const { result } = await runWithTelegramUpdateProcessingFrame(async () => {
            const participant = createTelegramSpooledReplayDeferredParticipant("test:adopted");
            expect(participant).not.toBeNull();
            recordTelegramMessageProcessingResult({
              kind: "failed-retryable",
              error: new Error("late frame failure"),
            });
            participant?.settle({ kind: "completed" });
            await participant?.task;
          });
          return result;
        },
      });

      monitor.start();
      await monitor.waitForIdle();
      await monitor.stop();

      expect((await queue.enqueue(eventId, payload, { laneKey })).kind).toBe("completed");
      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect(release).not.toHaveBeenCalled();
    });
  });

  it("preserves an adopted tombstone when inline completion returns after shutdown", async () => {
    await withTempState(async ({ queue, monitor: makeMonitor, enqueue }) => {
      const { eventId, payload, laneKey } = await enqueue(8);
      const adopted = deferred();
      const finishDispatch = deferred();
      const monitor = makeMonitor({
        dispatch: async (_update, lifecycle) => {
          await lifecycle.onAdopted();
          adopted.resolve();
          await finishDispatch.promise;
          return { kind: "completed" };
        },
      });

      monitor.start();
      await adopted.promise;
      const stopped = monitor.stop();
      finishDispatch.resolve();
      await stopped;

      expect(await queue.listPending({ limit: "all" })).toEqual([]);
      expect((await queue.enqueue(eventId, payload, { laneKey })).kind).toBe("completed");
    });
  });

  it("requeues an aborted deferred participant even when its late result is non-retryable", async () => {
    await withTempState(async ({ queue, monitor: makeMonitor, enqueue }) => {
      const { eventId } = await enqueue(9);
      const { monitor, participant } = await startDeferred(
        makeMonitor,
        "test:aborted-non-retryable",
      );
      await monitor.stop();
      participant.current?.settle({
        kind: "failed-retryable",
        error: new TelegramIngressPayloadError("late invalid payload"),
      });

      await waitPending(queue, [{ id: eventId, attempts: 0 }]);
      expect((await queue.listPending({ limit: "all" }))[0]?.lastError).toBeUndefined();
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
    });
  });

  it("releases when dispatch settles only after its owner was aborted", async () => {
    await withTempState(async ({ queue, monitor: makeMonitor, enqueue }) => {
      const { eventId, payload, laneKey } = await enqueue(8);
      const priorClaim = await queue.claim(eventId, { ownerId: "prior-owner" });
      if (!priorClaim) {
        throw new Error("Expected the prior Telegram ingress claim.");
      }
      const priorAttemptAt = Date.now() - 10_000;
      await queue.release(priorClaim, {
        releasedAt: priorAttemptAt,
        lastError: "previous delivery failed",
      });
      const dispatchGate = deferred();
      let ownerSignal: AbortSignal | undefined;
      const monitor = makeMonitor({
        dispatch: async (_update, lifecycle) => {
          ownerSignal = lifecycle.abortSignal;
          const participant = createTelegramSpooledReplayDeferredParticipant(
            "test:abort-before-settlement",
          );
          await dispatchGate.promise;
          participant?.settle({ kind: "completed" });
        },
      });

      monitor.start();
      await vi.waitFor(() => expect(ownerSignal).toBeDefined());
      const stopped = monitor.stop();
      await vi.waitFor(() => expect(ownerSignal?.aborted).toBe(true));
      dispatchGate.resolve();
      await stopped;

      await waitPending(queue, [
        {
          id: eventId,
          attempts: 1,
          lastAttemptAt: priorAttemptAt,
          lastError: "previous delivery failed",
        },
      ]);
      expect((await queue.enqueue(eventId, payload, { laneKey })).kind).not.toBe("completed");
    });
  });

  it("releases a coalesced member's aged row budget-free when its participant settles cancelled", async () => {
    await withTempState(async ({ queue }) => {
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
    await withTempState(async ({ queue }) => {
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

// Frond (karmaterminal, #1564): core settles the human owner's room message refused at a full
// protected reply queue as backpressure. Telegram's spooled lifecycle must carry it to the durable
// retry owner as a paced retry that spends no attempt, while other settlements keep their accounting.
type OwnerReplyLifecycle = NonNullable<GetReplyOptions["turnAdoptionLifecycle"]>;

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
    await withTempState(async ({ queue, monitor: makeMonitor }) => {
      await enqueueRoomUpdate(queue, 103, Date.now() - 25 * HOUR_MS);
      // A non-head album member only defers its participant; the coalesced
      // turn settles it later with the shared result.
      const participants: TelegramSpooledReplayDeferredParticipant[] = [];
      const monitor = makeMonitor({
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
    });
  });
});
