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

  it("exposes continue_delegate on normal turns when continuation is enabled", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
    });

    expect(tools.some((tool) => tool.name === "continue_delegate")).toBe(true);
  });

  it("hides continue_delegate when continuation is disabled", () => {
    const tools = createOpenClawTools({
      config: {
        ...config,
        agents: { defaults: { continuation: { enabled: false } } },
      },
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

  it("exposes request_compaction when continuation is enabled and compaction opts are wired", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
      requestCompactionOpts: {
        getContextUsage: () => 0.85,
        getSessionGeneration: () => 1,
        turnGeneration: 1,
        triggerCompaction: vi.fn().mockResolvedValue({ ok: true, compacted: false }),
      },
    });

    expect(tools.some((tool) => tool.name === "request_compaction")).toBe(true);
  });

  it("hides request_compaction when continuation is disabled", () => {
    const tools = createOpenClawTools({
      config: {
        ...config,
        agents: { defaults: { continuation: { enabled: false } } },
      },
      agentSessionKey: "main",
      requestCompactionOpts: {
        getContextUsage: () => 0.85,
        getSessionGeneration: () => 1,
        turnGeneration: 1,
        triggerCompaction: vi.fn().mockResolvedValue({ ok: true, compacted: false }),
      },
    });

    expect(tools.some((tool) => tool.name === "request_compaction")).toBe(false);
  });

  it("hides request_compaction when compaction opts are not provided", () => {
    const tools = createOpenClawTools({
      config,
      agentSessionKey: "main",
      // no requestCompactionOpts
    });

    expect(tools.some((tool) => tool.name === "request_compaction")).toBe(false);
  });
});
