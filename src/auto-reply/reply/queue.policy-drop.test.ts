import { describe, expect, it, vi } from "vitest";
import { enqueueFollowupRun } from "./queue.js";
import { createQueueTestRun, createQueueSettings } from "./queue.test-helpers.js";
import { clearFollowupQueue } from "./queue/state.js";

describe("followup queue policy drop", () => {
  it("settles a queue-cap old victim as a policy drop, not abandonment", async () => {
    const key = `test-drop-old-ingress-${Date.now()}`;
    const settings = createQueueSettings({ mode: "followup", cap: 1, dropPolicy: "old" });
    const dropped = vi.fn();
    const abandoned = vi.fn();
    const victim = createQueueTestRun({ prompt: "victim" });
    victim.turnAdoptionLifecycle = {
      admission: "exclusive",
      onAdopted: vi.fn(),
      onDropped: dropped,
      onAbandoned: abandoned,
    };
    try {
      expect(enqueueFollowupRun(key, victim, settings)).toBe(true);
      expect(enqueueFollowupRun(key, createQueueTestRun({ prompt: "survivor" }), settings)).toBe(
        true,
      );
      await victim.controllerInput!.settlement.promise;
      expect(dropped).toHaveBeenCalledExactlyOnceWith("queue-cap-old");
      expect(abandoned).not.toHaveBeenCalled();
    } finally {
      clearFollowupQueue(key);
    }
  });
});
