import { describe, expect, it, vi } from "vitest";
import { createNoReplyTool } from "./no-reply-tool.js";

describe("no_reply tool", () => {
  it("returns error when no sessionId is provided", async () => {
    const onNoReply = vi.fn();
    const tool = createNoReplyTool({ onNoReply });
    const result = await tool.execute("call-1", {});
    expect(result.details).toMatchObject({
      status: "error",
      error: "No session context",
    });
    expect(onNoReply).not.toHaveBeenCalled();
  });

  it("returns no_reply status with no reason when none given", async () => {
    const onNoReply = vi.fn();
    const tool = createNoReplyTool({ sessionId: "test-session", onNoReply });
    const result = await tool.execute("call-1", {});
    expect(result.details).toMatchObject({ status: "no_reply" });
    expect(onNoReply).toHaveBeenCalledOnce();
    expect(onNoReply).toHaveBeenCalledWith(undefined);
  });

  it("passes the reason through the no_reply callback", async () => {
    const onNoReply = vi.fn();
    const tool = createNoReplyTool({ sessionId: "test-session", onNoReply });
    const result = await tool.execute("call-1", { reason: "peer CoT-leak, not addressed to me" });
    expect(result.details).toMatchObject({
      status: "no_reply",
      reason: "peer CoT-leak, not addressed to me",
    });
    expect(onNoReply).toHaveBeenCalledOnce();
    expect(onNoReply).toHaveBeenCalledWith("peer CoT-leak, not addressed to me");
  });

  it("works without onNoReply callback (silence is still valid)", async () => {
    const tool = createNoReplyTool({ sessionId: "test-session" });
    const result = await tool.execute("call-1", {});
    expect(result.details).toMatchObject({ status: "no_reply" });
  });
});
