import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cancelPendingDelegates,
  consumePendingDelegates,
  resetDelegateStoreForTests,
} from "../../auto-reply/continuation-delegate-store.js";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
  type OpenClawConfig,
} from "../../config/config.js";
import { createContinueDelegateTool } from "./continue-delegate-tool.js";

const DISPATCHING_SESSION = "agent:main:self";

function continuationConfig(crossSessionTargeting: "disabled" | "enabled"): OpenClawConfig {
  return {
    agents: {
      defaults: {
        continuation: {
          enabled: true,
          maxDelegatesPerTurn: 5,
          crossSessionTargeting,
        },
      },
    },
  };
}

async function executeContinueDelegate(params: {
  crossSessionTargeting: "disabled" | "enabled";
  args?: Record<string, unknown>;
}) {
  setRuntimeConfigSnapshot(continuationConfig(params.crossSessionTargeting));
  const tool = createContinueDelegateTool({ agentSessionKey: DISPATCHING_SESSION });
  return (await tool.execute("call", { task: "delegate task", ...params.args }))?.details as
    | Record<string, unknown>
    | undefined;
}

describe("continue_delegate cross-session targeting gate", () => {
  beforeEach(() => {
    resetDelegateStoreForTests();
    clearRuntimeConfigSnapshot();
  });

  afterEach(() => {
    cancelPendingDelegates(DISPATCHING_SESSION);
    resetDelegateStoreForTests();
    clearRuntimeConfigSnapshot();
  });

  it("case 1: disabled rejects targetSessionKey for another session", async () => {
    await expect(
      executeContinueDelegate({
        crossSessionTargeting: "disabled",
        args: { targetSessionKey: "agent:main:other" },
      }),
    ).rejects.toThrow("cross-session continuation targeting is disabled");
    expect(consumePendingDelegates(DISPATCHING_SESSION)).toEqual([]);
  });

  it("case 2: disabled rejects targetSessionKeys", async () => {
    await expect(
      executeContinueDelegate({
        crossSessionTargeting: "disabled",
        args: { targetSessionKeys: ["agent:main:a", "agent:main:b"] },
      }),
    ).rejects.toThrow("cross-session continuation targeting is disabled");
    expect(consumePendingDelegates(DISPATCHING_SESSION)).toEqual([]);
  });

  it("case 3: disabled allows fanoutMode=tree", async () => {
    const result = await executeContinueDelegate({
      crossSessionTargeting: "disabled",
      args: { fanoutMode: "tree" },
    });
    expect(result).toMatchObject({ status: "scheduled", fanoutMode: "tree" });
    expect(consumePendingDelegates(DISPATCHING_SESSION)).toEqual([
      expect.objectContaining({ fanoutMode: "tree" }),
    ]);
  });

  it("case 4: disabled rejects fanoutMode=all", async () => {
    await expect(
      executeContinueDelegate({
        crossSessionTargeting: "disabled",
        args: { fanoutMode: "all" },
      }),
    ).rejects.toThrow("cross-session continuation targeting is disabled");
    expect(consumePendingDelegates(DISPATCHING_SESSION)).toEqual([]);
  });

  it("case 5: disabled allows no targeting", async () => {
    const result = await executeContinueDelegate({ crossSessionTargeting: "disabled" });
    expect(result).toMatchObject({ status: "scheduled" });
    expect(consumePendingDelegates(DISPATCHING_SESSION)).toEqual([
      expect.objectContaining({ task: "delegate task" }),
    ]);
  });

  it("case 6: disabled allows targetSessionKey for the dispatching session", async () => {
    const result = await executeContinueDelegate({
      crossSessionTargeting: "disabled",
      args: { targetSessionKey: DISPATCHING_SESSION },
    });
    expect(result).toMatchObject({
      status: "scheduled",
      targetSessionKey: DISPATCHING_SESSION,
    });
    expect(consumePendingDelegates(DISPATCHING_SESSION)).toEqual([
      expect.objectContaining({ targetSessionKey: DISPATCHING_SESSION }),
    ]);
  });

  it("case 8: enabled allows targetSessionKey for another session", async () => {
    const result = await executeContinueDelegate({
      crossSessionTargeting: "enabled",
      args: { targetSessionKey: "agent:main:other" },
    });
    expect(result).toMatchObject({
      status: "scheduled",
      targetSessionKey: "agent:main:other",
    });
    expect(consumePendingDelegates(DISPATCHING_SESSION)).toEqual([
      expect.objectContaining({ targetSessionKey: "agent:main:other" }),
    ]);
  });

  it("case 9: enabled allows fanoutMode=all", async () => {
    const result = await executeContinueDelegate({
      crossSessionTargeting: "enabled",
      args: { fanoutMode: "all" },
    });
    expect(result).toMatchObject({ status: "scheduled", fanoutMode: "all" });
    expect(consumePendingDelegates(DISPATCHING_SESSION)).toEqual([
      expect.objectContaining({ fanoutMode: "all" }),
    ]);
  });
});
