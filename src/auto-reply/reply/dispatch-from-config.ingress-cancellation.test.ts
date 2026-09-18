import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindIngressLifecycleToReplyOptions,
  type ChannelIngressDispatchLifecycle,
} from "../../channels/message/ingress-drain-lifecycle.js";
import { createChannelIngressDrain } from "../../channels/message/ingress-drain.js";
import {
  createTestIngressQueue,
  withTempState,
} from "../../channels/message/ingress-drain.test-helpers.js";
import { fanInChannelIngressLifecycles } from "../../plugin-sdk/channel-ingress-runtime.js";
import { createInboundDebouncer } from "../inbound-debounce.js";
import type { MsgContext } from "../templating.js";
import type { GetReplyOptions } from "../types.js";
import { createDispatcher } from "./dispatch-from-config.shared.test-harness.js";
import {
  automaticDirectReplyConfig,
  describe0BeforeEach0,
  dispatchReplyFromConfig,
  globalBeforeAll0,
  setNoAbort,
} from "./dispatch-from-config.test-harness.js";
import {
  withDispatchProcessedOutcomeSink,
  type DispatchProcessedNote,
} from "./dispatch-processed-outcome.js";
import { resetInboundDedupe } from "./inbound-dedupe.js";
import {
  clearSessionQueues,
  completeFollowupRunLifecycle,
  enqueueFollowupRun,
  scheduleFollowupDrain,
  type FollowupRun,
} from "./queue.js";
import { createQueueTestRun } from "./queue.test-helpers.js";
import { resetRecentQueuedMessageIdDedupe } from "./queue/enqueue.test-support.js";
import { resolveReplyOperationRunState } from "./reply-operation-run-state.js";
import { testing as replyRunTesting } from "./reply-run-registry.test-support.js";
import { buildTestCtx } from "./test-ctx.js";

beforeAll(globalBeforeAll0);
beforeEach(() => {
  describe0BeforeEach0();
  setNoAbort();
  resetRecentQueuedMessageIdDedupe();
  vi.useFakeTimers();
});
afterEach(() => {
  replyRunTesting.resetReplyRunRegistry();
  resetInboundDedupe();
  vi.clearAllTimers();
  vi.useRealTimers();
});

const QUEUE_SETTINGS = {
  mode: "followup",
  debounceMs: 0,
  cap: 10,
  dropPolicy: "summarize",
} as const;

describe("queued ingress cancellation through the reply terminal path", () => {
  it("settles the durable claim once through cancellation and keeps its retry budget", async () => {
    await withTempState(async (stateDir) => {
      let clock = Date.now();
      const key = "agent:main:discord:direct:ingress-cancel";
      const messageId = "cancel-me";
      const prompt = "Please deliver this queued message";
      const ctx = buildTestCtx({
        Provider: "discord",
        Surface: "discord",
        ChatType: "direct",
        From: "user:ingress-fixture",
        To: "channel:ingress-fixture",
        SessionKey: key,
        MessageSid: messageId,
        BodyForAgent: prompt,
      });
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(messageId, { text: prompt }, { laneKey: key });

      // Counted at the durable owner: the whole chain must deliver exactly one
      // cancellation and never fall back to a budget-spending abandonment.
      const cancelled = vi.fn();
      const abandoned = vi.fn();
      const flushErrors: unknown[] = [];
      const outcomes: Array<DispatchProcessedNote | undefined> = [];
      const finishAbortedFollowup = vi.fn(async (run: FollowupRun) => {
        expect(run.abortSignal?.aborted).toBe(true);
      });
      let dispatcher = createDispatcher();

      const buildQueuedRun = (options?: GetReplyOptions) => {
        const run = createQueueTestRun({
          prompt,
          messageId,
          originatingChannel: "discord",
          originatingTo: "channel:ingress-fixture",
        });
        run.turnAdoptionLifecycle = options?.turnAdoptionLifecycle;
        run.abortSignal = options?.turnAdoptionLifecycle?.abortSignal;
        return run;
      };

      const resolver = vi.fn(async (_ctx: MsgContext, options?: GetReplyOptions) => {
        if (resolver.mock.calls.length > 1) {
          return { text: "Queued message delivered" };
        }
        expect(
          enqueueFollowupRun(
            key,
            buildQueuedRun(options),
            QUEUE_SETTINGS,
            "message-id",
            finishAbortedFollowup,
            false,
          ),
        ).toBe(true);
        const runState = resolveReplyOperationRunState(options);
        if (!runState) {
          throw new Error("dispatch did not bind its run state");
        }
        runState.admission = { status: "accepted", mode: "followup" };
        return undefined;
      });

      // Real channel shape: durable claim -> fan-in -> inbound debounce flush ->
      // bound reply options -> dispatch -> followup queue.
      const debouncer = createInboundDebouncer<{
        key: string;
        lifecycle: ChannelIngressDispatchLifecycle;
      }>({
        debounceMs: 0,
        buildKey: (entry) => entry.key,
        onFlush: (entries, createFlush) => {
          const fanned = fanInChannelIngressLifecycles(entries.map((entry) => entry.lifecycle));
          return createFlush({
            lifecycle: fanned.lifecycle,
            dispatch: async (admissionLifecycle) => {
              const { processedOutcome } = await withDispatchProcessedOutcomeSink(() =>
                dispatchReplyFromConfig({
                  ctx,
                  cfg: automaticDirectReplyConfig,
                  dispatcher,
                  replyOptions: bindIngressLifecycleToReplyOptions(admissionLifecycle),
                  replyResolver: resolver,
                }),
              );
              outcomes.push(processedOutcome);
            },
          });
        },
        onError: (err) => flushErrors.push(err),
      });

      const stop = new AbortController();
      const drain = createChannelIngressDrain({
        queue,
        now: () => clock,
        abortSignal: stop.signal,
        retryPolicy: { baseMs: 1, maxMs: 1 },
        dispatchClaimedEvent: async (_event, lifecycle) => {
          const instrumented: ChannelIngressDispatchLifecycle = {
            ...lifecycle,
            onCancelled: async () => {
              cancelled();
              await lifecycle.onCancelled?.();
            },
            onAbandoned: async () => {
              abandoned();
              await lifecycle.onAbandoned();
            },
          };
          await debouncer.enqueue({ key, lifecycle: instrumented });
          return { kind: "deferred" };
        },
      });

      try {
        await drain.drainOnce();
        await drain.waitForIdle();
        expect(flushErrors).toEqual([]);
        expect(resolver).toHaveBeenCalledOnce();
        expect(dispatcher.sendFinalReply).not.toHaveBeenCalled();
        expect(await queue.listClaims()).toHaveLength(1);

        // Gateway stop while the turn is still queued: the followup queue's
        // abort path cancels ownership instead of abandoning it.
        stop.abort();
        await vi.waitFor(async () => {
          expect(await queue.listClaims()).toEqual([]);
        });
        await drain.waitForIdle();

        expect(cancelled).toHaveBeenCalledOnce();
        expect(abandoned).not.toHaveBeenCalled();
        expect(finishAbortedFollowup).toHaveBeenCalledOnce();
        const pending = await queue.listPending();
        expect(pending).toEqual([expect.objectContaining({ id: messageId, attempts: 0 })]);
        expect(pending[0]?.lastError ?? undefined).toBeUndefined();
        expect(await queue.listFailed?.()).toEqual([]);

        // Cancellation ran the pre-retry dedupe releases, so the same message id
        // may be queued again rather than being silently swallowed.
        expect(
          enqueueFollowupRun(
            key,
            buildQueuedRun(),
            QUEUE_SETTINGS,
            "message-id",
            finishAbortedFollowup,
            false,
          ),
        ).toBe(true);
        clearSessionQueues([key]);

        // The recovered claim still delivers; inbound dedupe was released too.
        clock += 1_000;
        dispatcher = createDispatcher();
        const recovery = createChannelIngressDrain({
          queue,
          now: () => clock,
          retryPolicy: { baseMs: 1, maxMs: 1 },
          dispatchClaimedEvent: async (_event, lifecycle) => {
            await debouncer.enqueue({ key, lifecycle });
          },
        });
        try {
          expect(await recovery.drainOnce()).toEqual({ started: 1 });
          await recovery.waitForIdle();
        } finally {
          recovery.dispose();
        }
        expect(flushErrors).toEqual([]);
        expect(resolver).toHaveBeenCalledTimes(2);
        expect(dispatcher.sendFinalReply).toHaveBeenCalledWith({
          text: "Queued message delivered",
        });
        expect(outcomes.at(-1)).toMatchObject({ outcome: "completed" });
        expect(await queue.listPending()).toEqual([]);
        expect(await queue.listClaims()).toEqual([]);
      } finally {
        drain.dispose();
        clearSessionQueues([key]);
      }
    });
  });

  it("cancels every source of a mixed fan-in through the bound reply lifecycle", async () => {
    await withTempState(async (stateDir) => {
      const key = "agent:main:discord:direct:ingress-mixed-cancel";
      const queue = createTestIngressQueue(stateDir);
      await queue.enqueue("modern", { text: "x" }, { laneKey: "modern" });
      await queue.enqueue("legacy", { text: "x" }, { laneKey: "legacy" });
      const claimed = new Map<string, ChannelIngressDispatchLifecycle>();
      const drain = createChannelIngressDrain({
        queue,
        // One attempt: any abandonment would dead-letter both rows immediately.
        retryPolicy: { maxAttempts: 1, deadLetterMinAgeMs: 0, baseMs: 0, maxMs: 0 },
        dispatchClaimedEvent: async (event, lifecycle) => {
          claimed.set(event.id, lifecycle);
          lifecycle.onDeferred();
          return { kind: "deferred" };
        },
      });

      try {
        await drain.drainOnce();
        await drain.waitForIdle();
        const modern = claimed.get("modern");
        const legacySource = claimed.get("legacy");
        if (!modern || !legacySource) {
          throw new Error("drain did not claim both events");
        }
        // A source-compatible lifecycle predates onCancelled.
        const { onCancelled: _onCancelled, ...legacy } = legacySource;
        const fanned = fanInChannelIngressLifecycles([modern, legacy]);
        const run: FollowupRun = {
          ...createQueueTestRun({ prompt: "mixed", messageId: "mixed" }),
          turnAdoptionLifecycle: fanned.lifecycle
            ? bindIngressLifecycleToReplyOptions(fanned.lifecycle).turnAdoptionLifecycle
            : undefined,
        };

        completeFollowupRunLifecycle(run, "cancelled");

        await vi.waitFor(async () => {
          expect(await queue.listClaims()).toEqual([]);
        });
        const pending = await queue.listPending();
        expect(pending).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: "modern", attempts: 0 }),
            expect.objectContaining({ id: "legacy", attempts: 0 }),
          ]),
        );
        expect(await queue.listFailed?.()).toEqual([]);
      } finally {
        drain.dispose();
        clearSessionQueues([key]);
      }
    });
  });

  it("cancels a collect-group source aborted while its group drain is awaited", async () => {
    await withTempState(async (stateDir) => {
      const key = "agent:main:discord:direct:ingress-collect-cancel";
      const queue = createTestIngressQueue(stateDir);
      // Distinct ingress lanes so both claims are held while one session queue
      // collects them into a single group.
      await queue.enqueue("cancelled-item", { text: "a" }, { laneKey: "lane-a" });
      await queue.enqueue("surviving-item", { text: "b" }, { laneKey: "lane-b" });
      const aborts = new Map<string, AbortController>();
      const drain = createChannelIngressDrain({
        queue,
        // One attempt: abandonment would dead-letter the aborted row.
        retryPolicy: { maxAttempts: 1, deadLetterMinAgeMs: 0, baseMs: 0, maxMs: 0 },
        dispatchClaimedEvent: async (event, lifecycle) => {
          const abort = new AbortController();
          aborts.set(event.id, abort);
          const run: FollowupRun = {
            ...createQueueTestRun({
              prompt: event.id,
              messageId: event.id,
              originatingChannel: "discord",
              originatingTo: "channel:ingress-fixture",
            }),
            abortSignal: abort.signal,
            turnAdoptionLifecycle:
              bindIngressLifecycleToReplyOptions(lifecycle).turnAdoptionLifecycle,
          };
          expect(
            enqueueFollowupRun(
              key,
              run,
              { mode: "collect", debounceMs: 0, cap: 10, dropPolicy: "summarize" },
              "message-id",
              undefined,
              false,
            ),
          ).toBe(true);
          return { kind: "deferred" };
        },
      });

      try {
        await drain.drainOnce();
        await drain.waitForIdle();
        expect(await queue.listClaims()).toHaveLength(2);

        // The collect group never admits, and one source is aborted mid-drain:
        // the post-drain cancellation sweep must not spend its retry budget.
        const groupRuns: string[] = [];
        scheduleFollowupDrain(key, async (run) => {
          groupRuns.push(run.prompt);
          aborts.get("cancelled-item")?.abort();
        });
        await vi.waitFor(async () => {
          expect(await queue.listClaims()).toEqual([]);
        });

        expect(groupRuns.length).toBeGreaterThan(0);
        // Same ceiling, opposite dispositions: the aborted source keeps its
        // budget while the one that merely never admitted spends its last try.
        expect(await queue.listPending()).toEqual([
          expect.objectContaining({ id: "cancelled-item", attempts: 0 }),
        ]);
        expect(await queue.listFailed?.()).toEqual([
          expect.objectContaining({
            id: "surviving-item",
            reason: "retry-limit-exceeded",
            message: "turn-abandoned",
          }),
        ]);
      } finally {
        drain.dispose();
        clearSessionQueues([key]);
      }
    });
  });
});
