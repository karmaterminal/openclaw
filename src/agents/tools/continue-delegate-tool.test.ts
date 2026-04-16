import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingDelegates,
  consumePendingDelegates,
  consumeStagedPostCompactionDelegates,
} from "../../auto-reply/continuation-delegate-store.js";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
  type OpenClawConfig,
} from "../../config/config.js";
import { createContinueDelegateTool } from "./continue-delegate-tool.js";

describe("continue_delegate tool", () => {
  beforeEach(() => {
    clearPendingDelegates("test-session");
    clearRuntimeConfigSnapshot();
    setRuntimeConfigSnapshot({});
  });

  afterEach(() => {
    clearPendingDelegates("test-session");
    clearRuntimeConfigSnapshot();
  });

  async function executeTool(
    tool: ReturnType<typeof createContinueDelegateTool>,
    index: number,
    args: Record<string, unknown>,
  ) {
    return (await tool.execute(`call-${index}`, args))?.details as Record<string, unknown>;
  }

  it("reads maxDelegatesPerTurn at execute time instead of tool construction time", async () => {
    const initialConfig: OpenClawConfig = {
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 5 } } },
    };
    setRuntimeConfigSnapshot(initialConfig);
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    const updatedConfig: OpenClawConfig = {
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 10 } } },
    };
    setRuntimeConfigSnapshot(updatedConfig);

    for (let index = 0; index < 10; index += 1) {
      const result = await executeTool(tool, index, { task: `delegate ${index + 1}` });
      expect(result).toMatchObject({ status: "scheduled" });
    }

    const overflow = await executeTool(tool, 10, { task: "delegate 11" });
    expect(overflow).toMatchObject({
      status: "error",
      limit: 10,
    });
  });

  it("stores pending delegates for post-run dispatch", async () => {
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    await executeTool(tool, 0, {
      task: "inspect logs",
      delaySeconds: 3,
    });

    expect(consumePendingDelegates("test-session")).toEqual([
      { task: "inspect logs", delayMs: 3000 },
    ]);
  });

  it("preserves silent delegate modes for the scheduler", async () => {
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    const result = await executeTool(tool, 0, {
      task: "inspect quietly",
      mode: "silent-wake",
    });

    expect(result).toMatchObject({
      status: "scheduled",
      mode: "silent-wake",
    });
    expect(consumePendingDelegates("test-session")).toEqual([
      { task: "inspect quietly", delayMs: undefined, silent: true, silentWake: true },
    ]);
  });

  it("stages post-compaction delegates for later release", async () => {
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    const result = await executeTool(tool, 0, {
      task: "resume after compaction",
      mode: "post-compaction",
    });

    expect(result).toMatchObject({
      status: "staged",
      mode: "post-compaction",
    });
    expect(consumePendingDelegates("test-session")).toEqual([]);
    expect(consumeStagedPostCompactionDelegates("test-session")).toEqual([
      {
        task: "resume after compaction",
        silent: true,
        silentWake: true,
        postCompaction: true,
      },
    ]);
  });
});
