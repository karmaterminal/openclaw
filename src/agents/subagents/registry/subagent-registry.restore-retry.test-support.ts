import { expect, it, vi } from "vitest";
import {
  createSubagentRunRecord,
  type SubagentRegistryHarness,
} from "../../subagent-test-fixtures.test-helpers.js";
import type { createSubagentRegistryMockState } from "./subagent-registry.mock-state.test-support.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

type RestoreRetryTestOptions = {
  getRegistry: () => SubagentRegistryHarness;
  mocks: Pick<
    ReturnType<typeof createSubagentRegistryMockState>,
    "restoreSubagentRunsFromDisk" | "onAgentEvent"
  >;
  hydrateAndActivateRegistry: () => Promise<void>;
};

export function registerRegistryRestoreRetryTest({
  getRegistry,
  mocks,
  hydrateAndActivateRegistry,
}: RestoreRetryTestOptions): void {
  it("retries registry restore after a transient partial-merge failure", async () => {
    const mod = getRegistry();
    const runId = "run-restore-retry";
    const restored = createSubagentRunRecord({
      runId,
      task: "retry registry restore",
      cleanup: "keep",
      pauseReason: "sessions_yield",
      createdAt: Date.now(),
    });
    mocks.restoreSubagentRunsFromDisk
      .mockImplementationOnce((async (params: { runs: Map<string, SubagentRunRecord> }) => {
        params.runs.set(runId, restored);
        throw new Error("transient sqlite read failure");
      }) as never)
      .mockResolvedValue(0);

    await hydrateAndActivateRegistry();
    expect(mocks.restoreSubagentRunsFromDisk).toHaveBeenCalledOnce();
    expect(mocks.onAgentEvent).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(mocks.restoreSubagentRunsFromDisk).toHaveBeenCalledTimes(2);
    expect(mod.getSubagentRunByRunId(runId)?.runId).toBe(runId);
    expect(mocks.onAgentEvent).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    // Successful restore must retire its retry timer.
    vi.advanceTimersByTime(2_000);
    expect(mocks.restoreSubagentRunsFromDisk).toHaveBeenCalledTimes(2);

    await mod.initSubagentRegistry();
    expect(mocks.restoreSubagentRunsFromDisk).toHaveBeenCalledTimes(2);
  });
}
