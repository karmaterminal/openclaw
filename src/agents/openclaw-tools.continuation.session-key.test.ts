import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContinueDelegateTool: vi.fn(() => ({ name: "continue_delegate" })),
}));

// mock-isolation: The delegate tool factory is recorded so the case can check its session identity without loading delegate stores.
vi.mock("./tools/continue-delegate-tool.js", () => ({
  createContinueDelegateTool: mocks.createContinueDelegateTool,
}));

import { createOpenClawContinuationTools } from "./openclaw-tools.continuation.js";
import { _resetGuardState, _setPending } from "./tools/request-compaction-tool.js";

describe("createOpenClawContinuationTools live session identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the live run session for delegate dispatch", () => {
    createOpenClawContinuationTools({
      config: { agents: { defaults: { continuation: { enabled: true } } } },
      agentSessionKey: "agent:main:sandbox-policy",
      runSessionKey: "agent:main:live-session",
      sessionId: "session-1",
      runId: "run-1",
    });

    expect(mocks.createContinueDelegateTool).toHaveBeenCalledWith({
      agentSessionKey: "agent:main:live-session",
      runId: "run-1",
    });
  });

  it("keys request_compaction's guards by the live run session the pressure cue reads", async () => {
    _setPending("agent:main:live-session");
    const tools = createOpenClawContinuationTools({
      config: { agents: { defaults: { continuation: { enabled: true } } } },
      agentSessionKey: "agent:main:sandbox-policy",
      runSessionKey: "agent:main:live-session",
      sessionId: "session-1",
      requestCompactionOpts: {
        getContextUsage: () => 0.8,
        triggerCompaction: async () => ({ ok: true, compacted: true }),
      },
    });
    const tool = tools.find((candidate) => candidate.name === "request_compaction");

    const result = await tool?.execute("call-1", { reason: "chosen seam" });

    _resetGuardState();
    expect(result?.details).toMatchObject({ status: "already_pending" });
  });

  it("falls back to the policy session when no separate run session exists", () => {
    createOpenClawContinuationTools({
      config: { agents: { defaults: { continuation: { enabled: true } } } },
      agentSessionKey: "agent:main:session",
    });

    expect(mocks.createContinueDelegateTool).toHaveBeenCalledWith({
      agentSessionKey: "agent:main:session",
    });
  });
});
