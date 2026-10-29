// Upstream's partial-merge restore case, moved verbatim out of subagent-registry.test.ts so the
// suite's continuation custody hooks stay under its line cap.
import { expect, it } from "vitest";
import {
  createSubagentRunRecord,
  type SubagentRegistryHarness,
} from "../../subagent-test-fixtures.test-helpers.js";
import type { createSubagentRegistryMockState } from "./subagent-registry.mock-state.test-support.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

export function registerRegistryRestoreRetryTest({
  getRegistry,
  mocks,
  activateRegistry,
}: {
  getRegistry: () => SubagentRegistryHarness;
  mocks: Pick<
    ReturnType<typeof createSubagentRegistryMockState>,
    "restoreSubagentRunsFromDisk" | "onAgentEvent"
  >;
  activateRegistry: () => Promise<unknown>;
}): void {
  it("reconciles a partial merge on the next explicit restore", async () => {
    const mod = getRegistry();
    const runId = "run-restore-retry";
    const restored = createSubagentRunRecord({
      runId,
      childSessionIdentity: {
        sessionId: "sess-child",
        lifecycleRevision: "revision-child",
      },
      pauseReason: "sessions_yield",
      createdAt: Date.now(),
    });
    mocks.restoreSubagentRunsFromDisk
      .mockImplementationOnce((async (params: { runs: Map<string, SubagentRunRecord> }) => {
        params.runs.set(runId, restored);
        throw new Error("transient sqlite read failure");
      }) as never)
      .mockResolvedValue(0);

    await mod.initSubagentRegistry();
    expect(mocks.restoreSubagentRunsFromDisk).toHaveBeenCalledOnce();
    expect(mocks.onAgentEvent).not.toHaveBeenCalled();

    await mod.initSubagentRegistry();

    expect(mocks.restoreSubagentRunsFromDisk).toHaveBeenCalledTimes(2);
    expect(mod.getSubagentRunByRunId(runId)?.runId).toBe(runId);
    await activateRegistry();
    expect(mocks.onAgentEvent).toHaveBeenCalledOnce();

    await mod.initSubagentRegistry();
    expect(mocks.restoreSubagentRunsFromDisk).toHaveBeenCalledTimes(2);
  });
}
