import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  consumePendingDelegates,
  consumeStagedPostCompactionDelegates,
} from "../../auto-reply/continuation-delegate-store.js";
import { createContinueDelegateTool } from "./continue-delegate-tool.js";

// Mock config for hot-reload testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadConfigMock = vi.fn((): any => ({
  agents: { defaults: { continuation: { maxDelegatesPerTurn: 5 } } },
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: () => loadConfigMock(),
}));

/** Extract the JSON payload from a tool result. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseResult(result: any): Record<string, unknown> {
  const textPart = result.content.find((c: { type: string }) => c.type === "text");
  return JSON.parse(textPart!.text);
}

describe("continue-delegate-tool P2: maxDelegatesPerTurn hot-reload", () => {
  const sessionKey = "test-session";

  beforeEach(() => {
    loadConfigMock.mockReset();
    loadConfigMock.mockReturnValue({
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 5 } } },
    });
    // Clear any leftover delegates
    consumePendingDelegates(sessionKey);
    consumeStagedPostCompactionDelegates(sessionKey);
  });

  it("reads maxDelegatesPerTurn from live config at execute time, not construction time", async () => {
    // Create tool with construction-time value of 2
    const tool = createContinueDelegateTool({
      agentSessionKey: sessionKey,
      maxDelegatesPerTurn: 2,
    });

    // Config says 5 at execute time — should override construction-time 2
    loadConfigMock.mockReturnValue({
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 5 } } },
    });

    // Dispatch 3 delegates — would fail with construction-time limit of 2
    const r1 = parseResult(await tool.execute("call-1", { task: "task one" }));
    const r2 = parseResult(await tool.execute("call-2", { task: "task two" }));
    const r3 = parseResult(await tool.execute("call-3", { task: "task three" }));

    expect(r1.status).toBe("scheduled");
    expect(r2.status).toBe("scheduled");
    expect(r3.status).toBe("scheduled");

    // Clean up
    consumePendingDelegates(sessionKey);
  });

  it("hot-reloaded config change takes effect without tool recreation", async () => {
    const tool = createContinueDelegateTool({
      agentSessionKey: sessionKey,
      maxDelegatesPerTurn: 10,
    });

    // Start with limit 2
    loadConfigMock.mockReturnValue({
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 2 } } },
    });

    const r1 = parseResult(await tool.execute("call-1", { task: "task one" }));
    const r2 = parseResult(await tool.execute("call-2", { task: "task two" }));
    const r3 = parseResult(await tool.execute("call-3", { task: "task three" }));

    expect(r1.status).toBe("scheduled");
    expect(r2.status).toBe("scheduled");
    // Third should be rejected — live config says 2
    expect(r3.status).toBe("error");

    consumePendingDelegates(sessionKey);
  });

  it("falls back to construction-time value when config has no maxDelegatesPerTurn", async () => {
    const tool = createContinueDelegateTool({
      agentSessionKey: sessionKey,
      maxDelegatesPerTurn: 3,
    });

    // Config has no maxDelegatesPerTurn
    loadConfigMock.mockReturnValue({
      agents: { defaults: { continuation: {} } },
    });

    const r1 = parseResult(await tool.execute("call-1", { task: "task one" }));
    const r2 = parseResult(await tool.execute("call-2", { task: "task two" }));
    const r3 = parseResult(await tool.execute("call-3", { task: "task three" }));
    const r4 = parseResult(await tool.execute("call-4", { task: "task four" }));

    expect(r1.status).toBe("scheduled");
    expect(r2.status).toBe("scheduled");
    expect(r3.status).toBe("scheduled");
    // Fourth rejected — falls back to construction-time 3
    expect(r4.status).toBe("error");

    consumePendingDelegates(sessionKey);
  });

  it("falls back to hardcoded 5 when neither config nor opts provide a value", async () => {
    const tool = createContinueDelegateTool({
      agentSessionKey: sessionKey,
      // No maxDelegatesPerTurn in opts
    });

    // Config has no maxDelegatesPerTurn
    loadConfigMock.mockReturnValue({
      agents: { defaults: { continuation: {} } },
    });

    // Dispatch 5 — should all succeed
    for (let i = 0; i < 5; i++) {
      const r = parseResult(await tool.execute(`call-${i}`, { task: `task ${i}` }));
      expect(r.status).toBe("scheduled");
    }

    // Sixth should be rejected
    const r6 = parseResult(await tool.execute("call-5", { task: "task 5" }));
    expect(r6.status).toBe("error");

    consumePendingDelegates(sessionKey);
  });
});
