import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createOpenClawTools } from "./openclaw-tools.js";
import { REQUEST_COMPACTION_REASON_MAX_LENGTH } from "./tools/request-compaction-tool.js";

function toolNames(tools: ReturnType<typeof createOpenClawTools>): string[] {
  return tools.map((tool) => tool.name);
}

describe("createOpenClawTools request_compaction registration", () => {
  it("does not expose request_compaction without a compaction trigger", () => {
    const tools = createOpenClawTools({
      config: {} as OpenClawConfig,
      disablePluginTools: true,
      disableMessageTool: true,
      wrapBeforeToolCallHook: false,
    });

    expect(toolNames(tools)).not.toContain("request_compaction");
  });

  it("exposes request_compaction when caller provides the compaction trigger", () => {
    const tools = createOpenClawTools({
      agentSessionKey: "agent:main:test",
      sessionId: "session-123",
      config: {} as OpenClawConfig,
      disablePluginTools: true,
      disableMessageTool: true,
      wrapBeforeToolCallHook: false,
      requestCompactionOpts: {
        getContextUsage: () => 0.9,
        triggerCompaction: vi.fn(async () => ({ ok: true, compacted: true })),
      },
    });

    const tool = tools.find((candidate) => candidate.name === "request_compaction");
    const parameters = tool?.parameters as
      | { properties?: { reason?: { maxLength?: number } } }
      | undefined;

    expect(tool).toBeDefined();
    expect(parameters?.properties?.reason?.maxLength).toBe(REQUEST_COMPACTION_REASON_MAX_LENGTH);
  });
});
