import { describe, expect, it, vi } from "vitest";
import { createContinueWorkTool } from "./continue-work-tool.js";

describe("continue_work tool", () => {
  it("captures continuation requests for active sessions", async () => {
    const requestContinuation = vi.fn();
    const tool = createContinueWorkTool({
      agentSessionKey: "test-session",
      requestContinuation,
    });

    const result = (
      await tool.execute("call-1", {
        reason: "Need one more turn",
        delaySeconds: 5,
      })
    )?.details as Record<string, unknown>;

    expect(result).toMatchObject({
      status: "scheduled",
      delaySeconds: 5,
    });
    expect(requestContinuation).toHaveBeenCalledWith({
      reason: "Need one more turn",
      delaySeconds: 5,
    });
  });
});
