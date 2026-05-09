import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _guards,
  _resetGuardState,
  _resetVolitionalCounts,
  createRequestCompactionTool,
  REQUEST_COMPACTION_REASON_MAX_LENGTH,
  type RequestCompactionToolOpts,
} from "./request-compaction-tool.js";

const SESSION_KEY = "test-session";
const SESSION_ID = "session-uuid-1234";

function reasonSchemaMaxLength(tool: ReturnType<typeof createRequestCompactionTool>): number {
  const parameters = tool.parameters as {
    properties?: { reason?: { maxLength?: number; description?: string } };
  };
  const maxLength = parameters.properties?.reason?.maxLength;
  if (typeof maxLength !== "number") {
    throw new Error("expected reason.maxLength schema");
  }
  return maxLength;
}

function reasonSchemaDescription(tool: ReturnType<typeof createRequestCompactionTool>): string {
  const parameters = tool.parameters as {
    properties?: { reason?: { description?: string } };
  };
  return parameters.properties?.reason?.description ?? "";
}

describe("request_compaction reason cap", () => {
  let triggerCompaction: ReturnType<typeof vi.fn<RequestCompactionToolOpts["triggerCompaction"]>>;

  function makeTool(overrides: Partial<RequestCompactionToolOpts> = {}) {
    return createRequestCompactionTool({
      agentSessionKey: SESSION_KEY,
      sessionId: SESSION_ID,
      getContextUsage: () => _guards.MIN_CONTEXT_THRESHOLD,
      triggerCompaction,
      ...overrides,
    });
  }

  beforeEach(() => {
    _resetGuardState();
    _resetVolitionalCounts();
    triggerCompaction = vi.fn(async () => ({ ok: true, compacted: true }));
  });

  afterEach(async () => {
    await new Promise((resolve) => setImmediate(resolve));
    _resetGuardState();
    _resetVolitionalCounts();
    vi.restoreAllMocks();
  });

  it("advertises an 8192-character diagnostic-only reason cap", () => {
    const tool = makeTool();

    expect(reasonSchemaMaxLength(tool)).toBe(REQUEST_COMPACTION_REASON_MAX_LENGTH);
    expect(reasonSchemaDescription(tool)).toContain("not used as compaction prompt input");
    expect(reasonSchemaDescription(tool)).toContain("8192");
  });

  it("accepts multi-line cohort summaries above the old 1024-character cap", async () => {
    const reason = [
      "context pressure at 91%",
      "cohort state: " + "a".repeat(1500),
      "handoff state: " + "b".repeat(1500),
    ].join("\n");
    expect(reason.length).toBeGreaterThan(1024);
    expect(reason.length).toBeLessThan(REQUEST_COMPACTION_REASON_MAX_LENGTH);

    const tool = makeTool();
    const result = await tool.execute("call-1", { reason });

    expect(result.details).toMatchObject({
      status: "compaction_requested",
      reason,
    });
    expect(triggerCompaction).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: SESSION_KEY,
        sessionId: SESSION_ID,
        reason,
        trigger: "volitional",
      }),
    );
  });

  it("caps direct execute callers at the same maximum as the schema", async () => {
    const reason = "x".repeat(REQUEST_COMPACTION_REASON_MAX_LENGTH + 50);
    const tool = makeTool();

    const result = await tool.execute("call-1", { reason });

    expect((result.details as { reason?: string }).reason).toHaveLength(
      REQUEST_COMPACTION_REASON_MAX_LENGTH,
    );
    expect(triggerCompaction).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "x".repeat(REQUEST_COMPACTION_REASON_MAX_LENGTH),
      }),
    );
  });
});
