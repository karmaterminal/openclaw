// Command queue lane-idle tests cover waiting for one lane's queued and active
// work to drain. Split from command-queue.test.ts to keep both under the test
// max-lines cap.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeferred } from "../../test/helpers/promise.js";
import { resetCommandQueueStateForTest } from "./command-queue.test-support.js";
import { CommandLane } from "./lanes.js";

vi.mock("../logging/diagnostic-runtime.js", () => ({
  logLaneEnqueue: vi.fn(),
  logLaneDequeue: vi.fn(),
  diagnosticLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

type CommandQueueModule = typeof import("./command-queue.js");

let enqueueCommandInLane: CommandQueueModule["enqueueCommandInLane"];
let setCommandLaneConcurrency: CommandQueueModule["setCommandLaneConcurrency"];
let waitForCommandLaneIdle: CommandQueueModule["waitForCommandLaneIdle"];

function enqueueBlockedMainTask<T = void>(
  onRelease?: () => Promise<T> | T,
): {
  task: Promise<T>;
  release: () => void;
} {
  const deferred = createDeferred();
  const task = enqueueCommandInLane(CommandLane.Main, async () => {
    await deferred.promise;
    return (await onRelease?.()) as T;
  });
  return { task, release: deferred.resolve };
}

describe("command queue", () => {
  beforeAll(async () => {
    ({ enqueueCommandInLane, setCommandLaneConcurrency, waitForCommandLaneIdle } =
      await import("./command-queue.js"));
  });

  beforeEach(() => {
    vi.useRealTimers();
    resetCommandQueueStateForTest();
    // Queue state is global across module instances, so reset main lane
    // concurrency explicitly to avoid cross-file leakage.
    setCommandLaneConcurrency(CommandLane.Main, 1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waitForCommandLaneIdle waits until queued and active lane work both drain", async () => {
    const { task: blocker, release } = enqueueBlockedMainTask(async () => "blocker");
    let followupRan = false;
    const followup = enqueueCommandInLane(CommandLane.Main, async () => {
      followupRan = true;
      return "followup";
    });

    const idlePromise = waitForCommandLaneIdle(CommandLane.Main, 1_000);

    release();
    await expect(blocker).resolves.toBe("blocker");
    await expect(followup).resolves.toBe("followup");
    await expect(idlePromise).resolves.toEqual({ idle: true });
    expect(followupRan).toBe(true);
  });

  it("waitForCommandLaneIdle returns idle=false when the lane remains busy past timeout", async () => {
    const { task, release } = enqueueBlockedMainTask();

    vi.useFakeTimers();
    try {
      const idlePromise = waitForCommandLaneIdle(CommandLane.Main, 50);
      await vi.advanceTimersByTimeAsync(50);
      await expect(idlePromise).resolves.toEqual({ idle: false });

      release();
      await task;
    } finally {
      vi.useRealTimers();
    }
  });
});
