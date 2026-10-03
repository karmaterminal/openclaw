import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContinueDelegateTool: vi.fn(() => ({ name: "continue_delegate" })),
}));

vi.mock("./tools/continue-delegate-tool.js", () => ({
  createContinueDelegateTool: mocks.createContinueDelegateTool,
}));

import { createOpenClawContinuationTools } from "./openclaw-tools.continuation.js";

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
