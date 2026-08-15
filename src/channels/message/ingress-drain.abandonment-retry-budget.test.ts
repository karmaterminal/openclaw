/**
 * Characterization fossil for karmaterminal/openclaw#1254 (Silas seat).
 *
 * Deployed composite `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955` routes an
 * ordinary dispatch failure through `onFailed -> applyFailureDisposition ->
 * resolveIngressFailureDisposition`, which is the only place `maxAttempts` and
 * `deadLetterMinAgeMs` are enforced. Pre-adoption abandonment instead routes
 * `onAbandoned -> releaseUnadopted -> queue.release` unconditionally, so a claim
 * that can never be adopted consumes attempts forever without ever reaching the
 * bounded disposition, retries at the capped 180s backoff indefinitely, and
 * holds the head of its FIFO ingress lane.
 *
 * The first test states the desired contract and is expected to be RED until the
 * drain routes abandonment through the same bounded disposition. Every negative
 * control below is green before and after that repair and must stay that way:
 * they bound the repair so it cannot dead-letter early, cannot consume the
 * budget on cancellation, cannot disturb an unrelated lane, and cannot collapse
 * the abandonment producer identity into the ordinary-failure reason.
 */
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import { createChannelIngressDrain } from "./ingress-drain.js";
import {
  createTestIngressQueue,
  type IngressDrainTestPayload as Payload,
  withTempState,
} from "./ingress-drain.test-helpers.js";
import {
  DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS,
  DEFAULT_INGRESS_RETRY_MAX_MS,
} from "./ingress-retry-policy.js";

// Module-private in ingress-drain.ts; derive from the factory signature.
type ChannelIngressDispatchLifecycle = Parameters<
  Parameters<typeof createChannelIngressDrain>[0]["dispatchClaimedEvent"]
>[1];

/** Exactly what extensions/discord/src/monitor/ingress.ts configures for the incident seat. */
const INCIDENT_RETRY_POLICY = {
  maxAttempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS,
  deadLetterMinAgeMs: 0,
} as const;

/**
 * One tick past the capped backoff. Advancing the injected clock keeps every
 * pass deterministically re-claimable without disabling the real retry policy.
 */
const PAST_CAPPED_BACKOFF_MS = DEFAULT_INGRESS_RETRY_MAX_MS + 1_000;

const LANE = "guild/channel/silas";
const OTHER_LANE = "guild/channel/rune";
const HEAD = "source-message-head";
const FOLLOWER = "source-message-follower";
const HEAD_TEXT = "session changed while starting work";

/** Durable last-error the drain already writes for an un-admitted turn. */
const ABANDONED_ERROR = "turn-abandoned";

describe("channel ingress drain abandonment retry budget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    closeOpenClawStateDatabaseForTest();
  });

  it("terminalizes a repeatedly abandoned pre-adoption claim at the attempt ceiling", async () => {
    await withTempState(async (stateDir) => {
      let clock = 10_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(HEAD, { text: HEAD_TEXT }, { laneKey: LANE, receivedAt: 1 });
      await queue.enqueue(FOLLOWER, { text: "next turn" }, { laneKey: LANE, receivedAt: 2 });

      const abandonedAttempts: number[] = [];
      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        retryPolicy: INCIDENT_RETRY_POLICY,
        dispatchClaimedEvent: async (event, lifecycle) => {
          if (event.id === HEAD) {
            // Incident shape: the followup defers to the reply lane, then
            // completeFollowupRunLifecycle relinquishes it never admitted.
            lifecycle.onDeferred();
            abandonedAttempts.push(event.attempts);
            await lifecycle.onAbandoned();
            return { kind: "deferred" };
          }
          await lifecycle.onAdopted();
          adopted.push(event.id);
          return { kind: "completed" };
        },
      });

      for (let pass = 0; pass < DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS; pass += 1) {
        await drain.drainOnce();
        await drain.waitForIdle();
        clock += PAST_CAPPED_BACKOFF_MS;
      }

      // The same row went through the exact onAbandoned path once per attempt,
      // consuming one unit of retry budget each time.
      expect(abandonedAttempts).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(adopted).toEqual([]);
      expect(await queue.listClaims()).toEqual([]);

      expect(await queue.listFailed?.({ limit: "all" })).toEqual([
        expect.objectContaining({
          id: HEAD,
          laneKey: LANE,
          reason: "retry-limit-exceeded",
          // Producer identity survives terminalization: abandonment is not
          // collapsed into a generic dispatch-failure message.
          message: ABANDONED_ERROR,
          // queue.fail never increments; the retained count is the claim-time
          // budget already consumed, exactly as the onFailed path records it.
          attempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS - 1,
          // Dead letters stay operator-visible with their original payload.
          payload: { text: HEAD_TEXT },
        }),
      ]);

      // Terminal head unblocks the lane: no poison-head starvation.
      await drain.drainOnce();
      await drain.waitForIdle();
      expect(adopted).toEqual([FOLLOWER]);
      expect(await queue.listPending()).toEqual([]);
      drain.dispose();
    });
  });

  it("keeps an abandoned claim retryable below the attempt ceiling", async () => {
    await withTempState(async (stateDir) => {
      let clock = 10_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(HEAD, { text: HEAD_TEXT }, { laneKey: LANE, receivedAt: 1 });

      let abandonments = 0;
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        retryPolicy: INCIDENT_RETRY_POLICY,
        dispatchClaimedEvent: async (_event, lifecycle) => {
          lifecycle.onDeferred();
          abandonments += 1;
          await lifecycle.onAbandoned();
          return { kind: "deferred" };
        },
      });

      for (let pass = 0; pass < DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS - 1; pass += 1) {
        await drain.drainOnce();
        await drain.waitForIdle();
        clock += PAST_CAPPED_BACKOFF_MS;
      }

      expect(abandonments).toBe(DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS - 1);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      expect(await queue.listPending()).toEqual([
        expect.objectContaining({
          id: HEAD,
          attempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS - 1,
          lastError: ABANDONED_ERROR,
          payload: { text: HEAD_TEXT },
        }),
      ]);
      drain.dispose();
    });
  });

  it("leaves cancellation budget-free even at the attempt ceiling", async () => {
    await withTempState(async (stateDir) => {
      let clock = 10_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(HEAD, { text: HEAD_TEXT }, { laneKey: LANE, receivedAt: 1 });
      // Seed the row at the ceiling the abandonment loop would reach.
      for (let attempt = 0; attempt < DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS - 1; attempt += 1) {
        const seedClaim = await queue.claim(HEAD, { ownerId: "seed-owner" });
        await queue.release(expectDefined(seedClaim, "seed claim"), {
          lastError: ABANDONED_ERROR,
          releasedAt: clock,
        });
      }
      // Retry facts only: release always bumps updated_at, and cancellation is
      // contracted to preserve the budget, not the row's write timestamp.
      const ceilingRetryFacts = {
        id: HEAD,
        attempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS - 1,
        lastAttemptAt: clock,
        lastError: ABANDONED_ERROR,
      };
      expect(await queue.listPending()).toEqual([expect.objectContaining(ceilingRetryFacts)]);

      for (let pass = 0; pass < 3; pass += 1) {
        clock += PAST_CAPPED_BACKOFF_MS;
        const lifecycles: ChannelIngressDispatchLifecycle[] = [];
        const drain = createChannelIngressDrain<Payload>({
          queue,
          now: () => clock,
          retryPolicy: INCIDENT_RETRY_POLICY,
          dispatchClaimedEvent: async (_event, lifecycle) => {
            lifecycles.push(lifecycle);
            return { kind: "deferred" };
          },
        });
        await drain.drainOnce();
        await vi.waitFor(() => expect(lifecycles).toHaveLength(1));
        await expectDefined(
          expectDefined(lifecycles[0], "cancelled lifecycle").onCancelled,
          "cancel callback",
        )();
        // Cancellation ended ownership before delivery: retry facts are frozen
        // and no attempt-ceiling dead-letter may fire.
        expect(await queue.listPending()).toEqual([expect.objectContaining(ceilingRetryFacts)]);
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
        drain.dispose();
      }
    });
  });

  it("keeps an unrelated lane draining while one lane head is abandoned", async () => {
    await withTempState(async (stateDir) => {
      let clock = 10_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(HEAD, { text: HEAD_TEXT }, { laneKey: LANE, receivedAt: 1 });
      await queue.enqueue(
        "other-lane-message",
        { text: "unrelated" },
        {
          laneKey: OTHER_LANE,
          receivedAt: 2,
        },
      );

      let abandonments = 0;
      const adopted: string[] = [];
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        retryPolicy: INCIDENT_RETRY_POLICY,
        dispatchClaimedEvent: async (event, lifecycle) => {
          if (event.id === HEAD) {
            lifecycle.onDeferred();
            abandonments += 1;
            await lifecycle.onAbandoned();
            return { kind: "deferred" };
          }
          await lifecycle.onAdopted();
          adopted.push(event.id);
          return { kind: "completed" };
        },
      });

      for (let pass = 0; pass < 3; pass += 1) {
        await drain.drainOnce();
        await drain.waitForIdle();
        clock += PAST_CAPPED_BACKOFF_MS;
      }

      expect(abandonments).toBe(3);
      // The unrelated lane completed on its first pass and was never released,
      // dead-lettered, or re-dispatched by the neighbouring abandonment loop.
      expect(adopted).toEqual(["other-lane-message"]);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      expect((await queue.listPending()).map((event) => event.id)).toEqual([HEAD]);
      drain.dispose();
    });
  });

  it("still dead-letters an ordinary thrown dispatch failure on its bounded path", async () => {
    await withTempState(async (stateDir) => {
      let clock = 10_000;
      const queue = createTestIngressQueue(stateDir, { now: () => clock });
      await queue.enqueue(HEAD, { text: HEAD_TEXT }, { laneKey: LANE, receivedAt: 1 });
      await queue.enqueue(FOLLOWER, { text: "next turn" }, { laneKey: LANE, receivedAt: 2 });

      const adopted: string[] = [];
      let throwCount = 0;
      const drain = createChannelIngressDrain<Payload>({
        queue,
        now: () => clock,
        retryPolicy: INCIDENT_RETRY_POLICY,
        dispatchClaimedEvent: async (event, lifecycle) => {
          if (event.id === HEAD) {
            throwCount += 1;
            throw new Error("dispatch exploded");
          }
          await lifecycle.onAdopted();
          adopted.push(event.id);
          return { kind: "completed" };
        },
      });

      for (let pass = 0; pass < DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS; pass += 1) {
        await drain.drainOnce();
        await drain.waitForIdle();
        clock += PAST_CAPPED_BACKOFF_MS;
      }

      expect(throwCount).toBe(DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS);
      expect(await queue.listFailed?.({ limit: "all" })).toEqual([
        expect.objectContaining({
          id: HEAD,
          reason: "retry-limit-exceeded",
          // Distinct from the abandonment producer identity above.
          message: "dispatch exploded",
          attempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS - 1,
          payload: { text: HEAD_TEXT },
        }),
      ]);

      await drain.drainOnce();
      await drain.waitForIdle();
      expect(adopted).toEqual([FOLLOWER]);
      drain.dispose();
    });
  });
});
