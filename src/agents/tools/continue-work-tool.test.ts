import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTINUATION_DEFAULTS } from "../../auto-reply/continuation-config.js";
import { clearAllContinuationTimers } from "../../auto-reply/continuation-scheduler.js";
import { createContinueWorkTool, type ContinueWorkToolContext } from "./continue-work-tool.js";

function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0];
  if (first?.type === "text" && typeof first.text === "string") {
    return first.text;
  }
  throw new Error("Expected text content in result");
}

describe("continue_work tool", () => {
  afterEach(() => {
    clearAllContinuationTimers();
    vi.restoreAllMocks();
  });

  function makeCtx(overrides?: Partial<ContinueWorkToolContext>): ContinueWorkToolContext {
    return {
      sessionKey: "agent:main:test:work",
      config: { ...CONTINUATION_DEFAULTS, enabled: true },
      chainDepth: 0,
      chainTokens: 0,
      ...overrides,
    };
  }

  it("schedules a continuation turn with default delay", async () => {
    const tool = createContinueWorkTool(makeCtx());
    const result = await tool.execute("call-1", {});
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("scheduled");
    expect(payload.delayMs).toBe(CONTINUATION_DEFAULTS.defaultDelayMs);
    expect(payload.chainDepth).toBe(1);
  });

  it("schedules with a custom delay", async () => {
    const tool = createContinueWorkTool(makeCtx());
    const result = await tool.execute("call-2", { delay_seconds: 60 });
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("scheduled");
    expect(payload.delayMs).toBe(60_000);
  });

  it("clamps delay below minDelayMs", async () => {
    const tool = createContinueWorkTool(makeCtx());
    const result = await tool.execute("call-3", { delay_seconds: 1 });
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("scheduled");
    expect(payload.delayMs).toBe(CONTINUATION_DEFAULTS.minDelayMs);
  });

  it("clamps delay above maxDelayMs", async () => {
    const tool = createContinueWorkTool(makeCtx());
    const result = await tool.execute("call-4", { delay_seconds: 999999 });
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("scheduled");
    expect(payload.delayMs).toBe(CONTINUATION_DEFAULTS.maxDelayMs);
  });

  it("rejects when chain depth is exceeded", async () => {
    const tool = createContinueWorkTool(
      makeCtx({ chainDepth: CONTINUATION_DEFAULTS.maxChainLength }),
    );
    const result = await tool.execute("call-5", {});
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("rejected");
    expect(payload.reason).toBe("chain_depth_exceeded");
  });

  it("rejects when cost cap is exceeded", async () => {
    const tool = createContinueWorkTool(
      makeCtx({ chainTokens: CONTINUATION_DEFAULTS.costCapTokens }),
    );
    const result = await tool.execute("call-6", {});
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("rejected");
    expect(payload.reason).toBe("cost_cap_exceeded");
  });

  it("rejects when continuation is disabled", async () => {
    const tool = createContinueWorkTool(
      makeCtx({
        config: { ...CONTINUATION_DEFAULTS, enabled: false },
      }),
    );
    const result = await tool.execute("call-7", {});
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("rejected");
    expect(payload.reason).toBe("scheduling_failed");
  });
});
