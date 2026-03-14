import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumePendingDelegates,
  consumeStagedPostCompactionDelegates,
} from "../../auto-reply/continuation-delegate-store.js";
import {
  setRuntimeConfigSnapshot,
  clearRuntimeConfigSnapshot,
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
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 5 } } },
    } as any);
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 10 } } },
    } as any);

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
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 10 } } },
    } as any);
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    for (let index = 0; index < 5; index += 1) {
      const result = await executeTool(tool, index, { task: `delegate ${index + 1}` });
      expect(result).toMatchObject({ status: "scheduled" });
    }

    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 5 } } },
    } as any);

    const overflow = await executeTool(tool, 5, { task: "delegate 6" });
    expect(overflow).toMatchObject({
      status: "error",
      limit: 5,
    });
  });

  it("uses the runtime default of 5 when maxDelegatesPerTurn is unset", async () => {
    // No config snapshot set — loadConfig falls back to empty config,
    // continuation-runtime resolves the default (5).
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
});
