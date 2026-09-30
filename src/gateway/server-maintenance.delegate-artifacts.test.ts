import { afterEach, describe, expect, it, vi } from "vitest";
import { createGatewayMaintenanceStateForTest } from "./test-helpers.maintenance-state.js";

function createMaintenanceTimerDeps() {
  return {
    ...createGatewayMaintenanceStateForTest(),
    logHealth: { info: vi.fn(), error: vi.fn() },
    runWorktreeGc: vi.fn(async () => undefined),
    runDeliveryQueueMediaGc: vi.fn(async () => undefined),
    runDelegateArtifactGc: vi.fn(async () => 0),
    runManagedOutgoingMediaGc: vi.fn(async () => ({
      deletedRecordCount: 0,
      deletedFileCount: 0,
      retainedCount: 0,
    })),
  };
}

async function stopMaintenanceTimers(
  timers: ReturnType<typeof import("./server-maintenance.js").startGatewayMaintenanceTimers>,
) {
  await timers.stopPeriodicTasks();
  await timers.skillUsageCleanup();
}

describe("delegate artifact gateway maintenance", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("purges expired artifacts at startup, after restart, and hourly", async () => {
    vi.useFakeTimers();
    const { startGatewayMaintenanceTimers } = await import("./server-maintenance.js");
    const deps = createMaintenanceTimerDeps();
    const first = startGatewayMaintenanceTimers(deps);

    await vi.advanceTimersByTimeAsync(0);
    expect(deps.runDelegateArtifactGc).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(deps.runDelegateArtifactGc).toHaveBeenCalledTimes(2);
    await stopMaintenanceTimers(first);

    const restarted = startGatewayMaintenanceTimers(deps);
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.runDelegateArtifactGc).toHaveBeenCalledTimes(3);
    await stopMaintenanceTimers(restarted);
  });

  it("drains expired artifacts in bounded batches", async () => {
    vi.useFakeTimers();
    const { startGatewayMaintenanceTimers } = await import("./server-maintenance.js");
    const deps = createMaintenanceTimerDeps();
    deps.runDelegateArtifactGc
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(12);

    const timers = startGatewayMaintenanceTimers(deps);
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }

    expect(deps.runDelegateArtifactGc).toHaveBeenCalledTimes(3);
    await stopMaintenanceTimers(timers);
  });

  it("yields during long artifact cleanup drains", async () => {
    vi.useFakeTimers();
    const { startGatewayMaintenanceTimers } = await import("./server-maintenance.js");
    const deps = createMaintenanceTimerDeps();
    for (let index = 0; index < 12; index += 1) {
      deps.runDelegateArtifactGc.mockResolvedValueOnce(index < 11 ? 100 : 1);
    }

    const timers = startGatewayMaintenanceTimers(deps);
    for (let index = 0; index < 20; index += 1) {
      await Promise.resolve();
    }
    expect(deps.runDelegateArtifactGc).toHaveBeenCalledTimes(10);
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.runDelegateArtifactGc).toHaveBeenCalledTimes(12);
    await stopMaintenanceTimers(timers);
  });

  it("stops artifact cleanup draining during maintenance teardown", async () => {
    vi.useFakeTimers();
    const { startGatewayMaintenanceTimers } = await import("./server-maintenance.js");
    const deps = createMaintenanceTimerDeps();
    let releaseBatch: ((purged: number) => void) | undefined;
    deps.runDelegateArtifactGc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseBatch = resolve;
        }),
    );

    const timers = startGatewayMaintenanceTimers(deps);
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.runDelegateArtifactGc).toHaveBeenCalledTimes(1);
    // Started, not awaited: the batch below is released while the cleanup is
    // still in flight, which is the interleaving this case exercises.
    void timers.skillUsageCleanup();
    releaseBatch?.(100);
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.runDelegateArtifactGc).toHaveBeenCalledTimes(1);
    await stopMaintenanceTimers(timers);
  });
});
