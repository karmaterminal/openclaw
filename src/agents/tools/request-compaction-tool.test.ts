import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetTaskFlowRegistryForTests,
  listTaskFlowsForOwnerKey,
} from "../../tasks/task-flow-registry.js";
import { configureTaskFlowRegistryRuntime } from "../../tasks/task-flow-registry.store.js";
import {
  CONTINUATION_COMPACTION_CONTROLLER_ID,
  _guards,
  _resetGuardState,
  _resetVolitionalCounts,
  _setPending,
  createRequestCompactionTool,
  getVolitionalCompactionCount,
  type RequestCompactionToolOpts,
} from "./request-compaction-tool.js";

describe("request_compaction tool", () => {
  const SESSION_KEY = "test-session";
  const SESSION_ID = "session-uuid-1234";

  let contextUsage = 0.85;
  let mockTriggerCompaction: ReturnType<
    typeof vi.fn<RequestCompactionToolOpts["triggerCompaction"]>
  >;

  function makeOpts(overrides?: Partial<RequestCompactionToolOpts>): RequestCompactionToolOpts {
    return {
      agentSessionKey: SESSION_KEY,
      sessionId: SESSION_ID,
      getContextUsage: () => contextUsage,
      triggerCompaction: mockTriggerCompaction,
      ...overrides,
    };
  }

  async function executeTool(
    tool: ReturnType<typeof createRequestCompactionTool>,
    args: Record<string, unknown> = { reason: "context pressure is high; notes preserved" },
  ) {
    return (await tool.execute("call-1", args))?.details as Record<string, unknown>;
  }

  beforeEach(() => {
    contextUsage = 0.85;
    resetTaskFlowRegistryForTests({ persist: false });
    configureTaskFlowRegistryRuntime({
      store: {
        loadSnapshot: () => ({ flows: new Map() }),
        saveSnapshot: () => {},
        upsertFlow: () => {},
        deleteFlow: () => {},
      },
    });
    _resetGuardState();
    _resetVolitionalCounts();
    mockTriggerCompaction = vi.fn().mockResolvedValue({
      ok: true,
      compacted: true,
    });
  });

  afterEach(() => {
    _resetGuardState();
    _resetVolitionalCounts();
    resetTaskFlowRegistryForTests({ persist: false });
  });

  it("rejects when context usage is below the minimum threshold", async () => {
    contextUsage = _guards.MIN_CONTEXT_THRESHOLD - 0.01;

    const result = await executeTool(createRequestCompactionTool(makeOpts()));

    expect(result).toMatchObject({
      status: "rejected",
      guard: "context_threshold",
      threshold: 70,
    });
    expect(mockTriggerCompaction).not.toHaveBeenCalled();
  });

  it("deduplicates when a compaction request is already pending", async () => {
    _setPending(SESSION_KEY);

    const result = await executeTool(createRequestCompactionTool(makeOpts()));

    expect(result).toMatchObject({
      status: "already_pending",
    });
    expect(mockTriggerCompaction).not.toHaveBeenCalled();
  });

  it("rate-limits repeat requests for the same session", async () => {
    const tool = createRequestCompactionTool(makeOpts());

    const first = await executeTool(tool);
    await Promise.resolve();
    const second = await executeTool(tool);

    expect(first).toMatchObject({ status: "compaction_requested" });
    expect(second).toMatchObject({
      status: "rejected",
      guard: "rate_limit",
    });
  });

  it("tracks the request in TaskFlow-owned state", async () => {
    await executeTool(createRequestCompactionTool(makeOpts()));
    await Promise.resolve();

    expect(listTaskFlowsForOwnerKey(SESSION_KEY)).toEqual([
      expect.objectContaining({
        ownerKey: SESSION_KEY,
        controllerId: CONTINUATION_COMPACTION_CONTROLLER_ID,
        status: "succeeded",
        currentStep: "Compaction completed",
      }),
    ]);
  });

  it("enqueues background compaction and records a successful volitional request", async () => {
    const result = await executeTool(createRequestCompactionTool(makeOpts()));

    expect(result).toMatchObject({
      status: "compaction_requested",
      contextUsage: 85,
    });
    expect(mockTriggerCompaction).toHaveBeenCalledTimes(1);

    await Promise.resolve();

    expect(getVolitionalCompactionCount(SESSION_KEY)).toBe(1);
  });
});
