import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  consumePendingDelegates,
  consumeStagedPostCompactionDelegates,
} from "../../auto-reply/continuation-delegate-store.js";
import {
  setRuntimeConfigSnapshot,
  clearRuntimeConfigSnapshot,
  type OpenClawConfig,
} from "../../config/config.js";
import { createContinueDelegateTool } from "./continue-delegate-tool.js";

describe("continue_delegate tool", () => {
  beforeEach(() => {
    consumePendingDelegates("test-session");
    consumeStagedPostCompactionDelegates("test-session");
    clearRuntimeConfigSnapshot();
  });

  afterEach(() => {
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

  it("re-reads maxDelegatesPerTurn on each call", async () => {
    const initialConfig: OpenClawConfig = {
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 10 } } },
    };
    setRuntimeConfigSnapshot(initialConfig);
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    for (let index = 0; index < 5; index += 1) {
      const result = await executeTool(tool, index, { task: `delegate ${index + 1}` });
      expect(result).toMatchObject({ status: "scheduled" });
    }

    const updatedConfig: OpenClawConfig = {
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 5 } } },
    };
    setRuntimeConfigSnapshot(updatedConfig);

    const overflow = await executeTool(tool, 5, { task: "delegate 6" });
    expect(overflow).toMatchObject({
      status: "error",
      limit: 5,
    });
  });

  it("uses the runtime default of 5 when maxDelegatesPerTurn is unset", async () => {
    // Pin an empty config so the test doesn't pick up host-level openclaw.json.
    setRuntimeConfigSnapshot({});
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    for (let index = 0; index < 5; index += 1) {
      const result = await executeTool(tool, index, { task: `delegate ${index + 1}` });
      expect(result).toMatchObject({ status: "scheduled" });
    }

    const overflow = await executeTool(tool, 5, { task: "delegate 6" });
    expect(overflow).toMatchObject({
      status: "error",
      limit: 5,
    });
  });

  it("stages post-compaction delegates as silent-wake delegates", async () => {
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    const result = await executeTool(tool, 0, {
      task: "carry compacted working state forward",
      mode: "post-compaction",
    });

    expect(result).toMatchObject({
      status: "queued-for-compaction",
      mode: "post-compaction",
    });
    expect(consumeStagedPostCompactionDelegates("test-session")).toEqual([
      expect.objectContaining({
        task: "carry compacted working state forward",
        silent: true,
        silentWake: true,
      }),
    ]);
  });

  it("accepts and persists targetSessionKeys descriptor (#355 multi-recipient stage-1)", async () => {
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    const result = await executeTool(tool, 0, {
      task: "choral fan-out shard",
      targetSessionKeys: [
        "agent:silas:discord:channel:thornfield",
        "agent:elliott:discord:channel:thornfield",
      ],
    });

    expect(result).toMatchObject({ status: "scheduled" });
    const pending = consumePendingDelegates("test-session");
    expect(pending).toHaveLength(1);
    expect(pending[0].targetSessionKeys).toEqual([
      "agent:silas:discord:channel:thornfield",
      "agent:elliott:discord:channel:thornfield",
    ]);
  });

  it("omits targetSessionKeys when not provided", async () => {
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    await executeTool(tool, 0, { task: "single-recipient legacy shape" });
    const pending = consumePendingDelegates("test-session");
    expect(pending).toHaveLength(1);
    expect(pending[0].targetSessionKeys).toBeUndefined();
  });

  it("rejects targetSessionKeys when not an array of non-empty strings", async () => {
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    await expect(
      executeTool(tool, 0, { task: "bad recipients", targetSessionKeys: "agent:silas:..." }),
    ).rejects.toThrow(/array/);
    await expect(
      executeTool(tool, 1, { task: "bad recipients", targetSessionKeys: ["", "agent:elliott"] }),
    ).rejects.toThrow(/non-empty/);
  });
});
