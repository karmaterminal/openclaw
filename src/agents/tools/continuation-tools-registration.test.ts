import { describe, expect, it, vi } from "vitest";
import { createOpenClawTools } from "../openclaw-tools.js";
import "../test-helpers/fast-core-tools.js";
import { createPerSenderSessionConfig } from "../test-helpers/session-config.js";

describe("continuation tool registration", () => {
  const config = {
    session: createPerSenderSessionConfig(),
    agents: {
      defaults: {
        continuation: {
          enabled: true,
        },
      },
    },
  } as const;

  it("exposes continue_delegate only when drain pipeline is active", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
      drainsContinuationDelegateQueue: true,
    });

    expect(tools.some((tool) => tool.name === "continue_delegate")).toBe(true);
  });

  it("hides continue_delegate when drain pipeline is not active", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
      drainsContinuationDelegateQueue: false,
    });

    expect(tools.some((tool) => tool.name === "continue_delegate")).toBe(false);
  });

  it("hides continue_delegate when drainsContinuationDelegateQueue is omitted", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
    });

    expect(tools.some((tool) => tool.name === "continue_delegate")).toBe(false);
  });

  it("exposes continue_work when continuation is enabled and the runner wires it", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
      continueWorkOpts: {
        requestContinuation: vi.fn(),
      },
    });

    expect(tools.some((tool) => tool.name === "continue_work")).toBe(true);
  });
});
