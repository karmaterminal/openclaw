// Overflow under drop:"old" must settle the evicted source's ingress custody.
import { describe, expect, it, vi } from "vitest";
import { createQueueCase } from "./queue.case.test-support.js";
import {
  createQueueTestRun as createRun,
  installQueueRuntimeErrorSilencer,
} from "./queue.test-helpers.js";
import { clearFollowupQueue, getExistingFollowupQueue } from "./queue/state.js";

installQueueRuntimeErrorSilencer();

describe("followup queue drop:old settlement", () => {
  // With deferredLaneOccupancy "release" (#1415), several rows from one Discord
  // channel can sit in the collect queue at once, so cap overflow evicts real
  // ingress-backed sources. The evicted source never reaches adoption; its
  // lifecycle must still end through onAbandoned + onSettled so the durable
  // ingress claim settles instead of leaking until the stall watchdog.
  it("settles an evicted source's lifecycle exactly once", () => {
    const q = createQueueCase({ mode: "collect", cap: 1, dropPolicy: "old" }, 1);
    const onDeferred = vi.fn();
    const onAbandoned = vi.fn();
    const onSettled = vi.fn();
    const onAdopted = vi.fn(async () => {});
    const onDisposition = vi.fn();
    try {
      expect(
        q.add({
          ...createRun({ prompt: "evicted" }),
          onQueueDisposition: onDisposition,
          turnAdoptionLifecycle: { onAdopted, onDeferred, onAbandoned, onSettled },
        }),
      ).toBe(true);
      expect(onDeferred).toHaveBeenCalledOnce();

      expect(q.add(createRun({ prompt: "survivor" }))).toBe(true);

      expect(onDisposition).toHaveBeenCalledWith("queue-cap-old");
      expect(onAbandoned).toHaveBeenCalledOnce();
      expect(onSettled).toHaveBeenCalledOnce();
      expect(onAdopted).not.toHaveBeenCalled();
      expect(getExistingFollowupQueue(q.key)?.items.map((item) => item.prompt)).toEqual([
        "survivor",
      ]);
    } finally {
      clearFollowupQueue(q.key);
    }
  });
});
