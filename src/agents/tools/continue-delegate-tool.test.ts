import { afterEach, describe, expect, it } from "vitest";
import { CONTINUATION_DEFAULTS } from "../../auto-reply/continuation-config.js";
import { clearAllPendingDelegates } from "../../auto-reply/continuation-delegate-store.js";
import {
  createContinueDelegateTool,
  type ContinueDelegateToolContext,
} from "./continue-delegate-tool.js";

function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0];
  if (first?.type === "text" && typeof first.text === "string") {
    return first.text;
  }
  throw new Error("Expected text content in result");
}

describe("continue_delegate tool", () => {
  afterEach(() => {
    clearAllPendingDelegates();
  });

  function makeCtx(overrides?: Partial<ContinueDelegateToolContext>): ContinueDelegateToolContext {
    return {
      sessionKey: "agent:main:test:delegate",
      config: { ...CONTINUATION_DEFAULTS, enabled: true },
      chainDepth: 0,
      chainTokens: 0,
      turnDelegateCount: 0,
      ...overrides,
    };
  }

  it("enqueues a delegate with default mode", async () => {
    const tool = createContinueDelegateTool(makeCtx());
    const result = await tool.execute("call-1", {
      task: "check CI status",
    });
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("enqueued");
    expect(payload.mode).toBe("normal");
    expect(payload.pendingCount).toBe(1);
  });

  it("enqueues a delegate with silent-wake mode", async () => {
    const tool = createContinueDelegateTool(makeCtx());
    const result = await tool.execute("call-2", {
      task: "background research",
      mode: "silent-wake",
    });
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("enqueued");
    expect(payload.mode).toBe("silent-wake");
  });

  it("enqueues with custom delay", async () => {
    const tool = createContinueDelegateTool(makeCtx());
    const result = await tool.execute("call-3", {
      task: "delayed check",
      delay_seconds: 60,
    });
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("enqueued");
    expect(payload.delayMs).toBe(60_000);
  });

  it("allows immediate dispatch with delay_seconds=0", async () => {
    const tool = createContinueDelegateTool(makeCtx());
    const result = await tool.execute("call-4", {
      task: "immediate work",
      delay_seconds: 0,
    });
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("enqueued");
    expect(payload.delayMs).toBe(0);
  });

  it("rejects when chain depth is exceeded", async () => {
    const tool = createContinueDelegateTool(
      makeCtx({ chainDepth: CONTINUATION_DEFAULTS.maxChainLength }),
    );
    const result = await tool.execute("call-5", { task: "should fail" });
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("rejected");
    expect(payload.reason).toBe("chain_depth_exceeded");
  });

  it("rejects when cost cap is exceeded", async () => {
    const tool = createContinueDelegateTool(
      makeCtx({ chainTokens: CONTINUATION_DEFAULTS.costCapTokens }),
    );
    const result = await tool.execute("call-6", { task: "should fail" });
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("rejected");
    expect(payload.reason).toBe("cost_cap_exceeded");
  });

  it("rejects when fan-out limit is reached", async () => {
    const tool = createContinueDelegateTool(
      makeCtx({ turnDelegateCount: CONTINUATION_DEFAULTS.maxDelegatesPerTurn }),
    );
    const result = await tool.execute("call-7", { task: "should fail" });
    const payload = JSON.parse(resultText(result));

    expect(payload.status).toBe("rejected");
    expect(payload.reason).toBe("max_delegates_per_turn_exceeded");
  });

  it("enqueues multiple delegates sequentially", async () => {
    const tool = createContinueDelegateTool(makeCtx());
    const r1 = await tool.execute("call-a", { task: "task 1" });
    const r2 = await tool.execute("call-b", { task: "task 2" });
    const r3 = await tool.execute("call-c", { task: "task 3" });

    expect(JSON.parse(resultText(r1)).pendingCount).toBe(1);
    expect(JSON.parse(resultText(r2)).pendingCount).toBe(2);
    expect(JSON.parse(resultText(r3)).pendingCount).toBe(3);
  });

  it("truncates long task in response", async () => {
    const longTask = "a".repeat(200);
    const tool = createContinueDelegateTool(makeCtx());
    const result = await tool.execute("call-8", { task: longTask });
    const payload = JSON.parse(resultText(result));

    expect(payload.task.length).toBeLessThanOrEqual(120);
  });
});
