// A follow-up queue cap eviction is an intentional policy drop: the evicted
// ingress row must complete (with its disposition), never re-deliver.
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindIngressLifecycleToReplyOptions } from "../../channels/message/ingress-drain-lifecycle.js";
import { createChannelIngressDrain } from "../../channels/message/ingress-drain.js";
import {
  createTestIngressQueue,
  type IngressDrainTestPayload as Payload,
  withTempState,
} from "../../channels/message/ingress-drain.test-helpers.js";
import {
  createMonitor,
  useIngressMonitorQueueFixture,
} from "../../channels/message/ingress-monitor.test-harness.js";
import { fanInChannelIngressLifecycles } from "../../plugin-sdk/channel-ingress-runtime.js";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import { createQueueCase } from "./queue.case.test-support.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { completeFollowupRunLifecycle, enqueueFollowupRun } from "./queue.js";
import {
  createQueueTestRun as createRun,
  installQueueRuntimeErrorSilencer,
} from "./queue.test-helpers.js";
import { clearFollowupQueue } from "./queue/state.js";

installQueueRuntimeErrorSilencer();

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function createHarness(stateDir: string, settings: Partial<QueueSettings>) {
  const queue = createTestIngressQueue(stateDir);
  const followups = createQueueCase(settings, 1);
  const runs = new Map<string, FollowupRun>();
  const added = new Map<string, boolean>();
  const dispatched: string[] = [];
  const drain = createChannelIngressDrain<Payload>({
    queue,
    // Discord's #1415 shape: a deferred row releases its lane.
    deferredLaneOccupancy: "release",
    retryPolicy: { maxAttempts: 8, deadLetterMinAgeMs: 0, baseMs: 0, maxMs: 0 },
    dispatchClaimedEvent: async (event, lifecycle) => {
      dispatched.push(event.id);
      // Real channel dispatch reaches the reply queue only after async work
      // (the monitor's inspection read), so the drain has registered the claim.
      await Promise.resolve();
      // What a channel reply pipeline does: hand the turn to the follow-up queue.
      const run: FollowupRun = {
        ...createRun({ prompt: event.payload.text, messageId: event.id }),
        ...bindIngressLifecycleToReplyOptions(lifecycle),
      };
      runs.set(event.id, run);
      added.set(event.id, followups.add(run));
      return { kind: "deferred" };
    },
  });
  const drainUntilDispatched = async (count: number) => {
    for (let pass = 0; pass < 10 && dispatched.length < count; pass += 1) {
      await drain.drainOnce();
      await drain.waitForIdle();
    }
  };
  return { queue, followups, runs, added, dispatched, drain, drainUntilDispatched };
}

async function dispose(harness: Harness | undefined) {
  if (harness) {
    harness.drain.dispose();
    clearFollowupQueue(harness.followups.key);
  }
}

describe("follow-up queue policy drops settle durable ingress claims", () => {
  afterEach(() => {
    closeOpenClawStateDatabaseForTest();
  });

  it("completes a drop:old eviction with its disposition and never re-delivers it", async () => {
    await withTempState(async (stateDir) => {
      let harness: Harness | undefined;
      try {
        harness = await createHarness(stateDir, { mode: "collect", cap: 1, dropPolicy: "old" });
        const { queue, dispatched } = harness;
        await queue.enqueue("evicted", { text: "first" }, { laneKey: "room", receivedAt: 1 });
        await queue.enqueue("survivor", { text: "second" }, { laneKey: "room", receivedAt: 2 });

        // The second row is claimed while the first waits in the follow-up queue,
        // and its enqueue evicts the first at cap 1.
        await harness.drainUntilDispatched(2);
        expect(dispatched).toEqual(["evicted", "survivor"]);
        expect([...harness.added.values()]).toEqual([true, true]);

        await expect(queue.enqueue("evicted", { text: "first" })).resolves.toMatchObject({
          kind: "completed",
          record: { id: "evicted", metadata: { policyDrop: "queue-cap-old" } },
        });
        expect((await queue.listPending({ limit: "all" })).map((row) => row.id)).toEqual([]);
        expect((await queue.listClaims()).map((claim) => claim.id)).toEqual(["survivor"]);
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);

        // Further passes never hand the evicted row to a turn again.
        await harness.drain.drainOnce();
        await harness.drain.waitForIdle();
        expect(dispatched).toEqual(["evicted", "survivor"]);
      } finally {
        await dispose(harness);
      }
    });
  });

  it("still spends a retry attempt and re-delivers a genuinely abandoned turn", async () => {
    await withTempState(async (stateDir) => {
      let harness: Harness | undefined;
      try {
        harness = await createHarness(stateDir, { mode: "collect", cap: 10, dropPolicy: "old" });
        const { queue, runs, dispatched } = harness;
        await queue.enqueue("abandoned", { text: "only" }, { laneKey: "room", receivedAt: 1 });
        await harness.drainUntilDispatched(1);
        expect(harness.added.get("abandoned")).toBe(true);

        // A queued turn that ends without admission for any other reason.
        const run = runs.get("abandoned");
        if (!run) {
          throw new Error("expected the abandoned row to reach the follow-up queue");
        }
        completeFollowupRunLifecycle(run);
        await harness.drain.waitForIdle();

        await expect(queue.listPending({ limit: "all" })).resolves.toEqual([
          expect.objectContaining({ id: "abandoned", attempts: 1, lastError: "turn-abandoned" }),
        ]);
        clearFollowupQueue(harness.followups.key);
        await harness.drainUntilDispatched(2);
        expect(dispatched).toEqual(["abandoned", "abandoned"]);
      } finally {
        await dispose(harness);
      }
    });
  });

  it("completes a row rejected because protected priority runs fill the cap", async () => {
    await withTempState(async (stateDir) => {
      let harness: Harness | undefined;
      try {
        harness = await createHarness(stateDir, { mode: "collect", cap: 1, dropPolicy: "old" });
        const { queue, followups, dispatched } = harness;
        // A front-positioned (priority) run is protected from overflow eviction.
        expect(
          enqueueFollowupRun(
            followups.key,
            createRun({ prompt: "priority" }),
            followups.settings,
            "message-id",
            undefined,
            false,
            { position: "front" },
          ),
        ).toBe(true);
        await queue.enqueue("rejected", { text: "late" }, { laneKey: "room", receivedAt: 1 });

        await harness.drainUntilDispatched(1);
        expect(harness.added.get("rejected")).toBe(false);
        await harness.drain.waitForIdle();

        await expect(queue.enqueue("rejected", { text: "late" })).resolves.toMatchObject({
          kind: "completed",
          record: { id: "rejected", metadata: { policyDrop: "queue-cap-protected" } },
        });
        expect(await queue.listClaims()).toEqual([]);
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
        await harness.drain.drainOnce();
        await harness.drain.waitForIdle();
        expect(dispatched).toEqual(["rejected"]);
      } finally {
        await dispose(harness);
      }
    });
  });

  const withMonitorQueue = useIngressMonitorQueueFixture();

  it("completes an eviction through the monitor and fan-in layers Discord dispatches through", async () => {
    await withMonitorQueue(async (queue) => {
      const followups = createQueueCase({ mode: "collect", cap: 1, dropPolicy: "old" }, 1);
      const dispatched: string[] = [];
      const monitor = createMonitor(
        queue,
        async (raw, lifecycle) => {
          dispatched.push(raw.id);
          // Discord: debounce fan-in, then the reply-options binding, then the queue.
          const { lifecycle: fannedIn } = fanInChannelIngressLifecycles([lifecycle]);
          if (!fannedIn) {
            throw new Error("fan-in lost its only lifecycle");
          }
          expect(
            followups.add({
              ...createRun({ prompt: raw.text, messageId: raw.id }),
              ...bindIngressLifecycleToReplyOptions(fannedIn),
            }),
          ).toBe(true);
          return { kind: "deferred" };
        },
        { deferredLaneOccupancy: "release" },
      );
      monitor.start();
      try {
        await monitor.admit({ id: "evicted", lane: "room", text: "first" });
        await vi.waitFor(() => expect(dispatched).toEqual(["evicted"]));
        await monitor.admit({ id: "survivor", lane: "room", text: "second" });
        await vi.waitFor(async () =>
          expect(await queue.enqueue("evicted", { version: 1, rawEvent: "{}" })).toMatchObject({
            kind: "completed",
            record: { metadata: { policyDrop: "queue-cap-old" } },
          }),
        );
        expect(dispatched).toEqual(["evicted", "survivor"]);
        expect(await queue.listFailed?.({ limit: "all" })).toEqual([]);
      } finally {
        await monitor.stop();
        clearFollowupQueue(followups.key);
      }
    });
  });
});
