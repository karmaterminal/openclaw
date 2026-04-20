import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  consumePendingWorkRequest,
  resetDelegateStoreForTests,
} from "../../auto-reply/continuation/delegate-store.js";
import { ToolInputError } from "./common.js";
import { createContinueWorkTool } from "./continue-work-tool.js";

const SESSION_KEY = "agent:main:discord:channel:test-continue-work";
const REASON =
  "next-step: re-target #241 base after #235 merges; this turn was scoped to scribe-pass.";

type ExecuteResult = Awaited<ReturnType<ReturnType<typeof createContinueWorkTool>["execute"]>>;

type JsonPayload = {
  status: string;
  delaySeconds?: number;
};

function readJsonPayload(result: ExecuteResult): JsonPayload {
  // jsonResult() returns content = [{ type: "text", text: JSON.stringify(...) }]
  const content = (result as { content: Array<{ type: string; text: string }> }).content;
  expect(content[0]?.type).toBe("text");
  return JSON.parse(content[0]?.text ?? "{}") as JsonPayload;
}

describe("continue_work tool", () => {
  beforeEach(() => {
    resetDelegateStoreForTests();
  });

  afterEach(() => {
    resetDelegateStoreForTests();
  });

  // (a) ToolInputError on missing session
  it("throws ToolInputError when agentSessionKey is absent", async () => {
    const tool = createContinueWorkTool({ agentSessionKey: undefined });
    await expect(tool.execute("call-1", { reason: REASON })).rejects.toBeInstanceOf(ToolInputError);
  });

  // (b) delaySeconds defaults to 0 when undefined
  it("defaults delaySeconds to 0 when undefined and writes the request", async () => {
    const tool = createContinueWorkTool({ agentSessionKey: SESSION_KEY });
    const payload = readJsonPayload(await tool.execute("call-2", { reason: REASON }));
    expect(payload.status).toBe("scheduled");
    expect(payload.delaySeconds).toBe(0);

    const stored = consumePendingWorkRequest(SESSION_KEY);
    expect(stored).toEqual({ reason: REASON, delaySeconds: 0 });
  });

  // (b cont) honors configured value when present
  it("honors a positive delaySeconds value and persists it under sessionKey", async () => {
    const tool = createContinueWorkTool({ agentSessionKey: SESSION_KEY });
    const payload = readJsonPayload(
      await tool.execute("call-3", { reason: REASON, delaySeconds: 30 }),
    );
    expect(payload.status).toBe("scheduled");
    expect(payload.delaySeconds).toBe(30);

    const stored = consumePendingWorkRequest(SESSION_KEY);
    expect(stored).toEqual({ reason: REASON, delaySeconds: 30 });
  });

  it("accepts delaySeconds=0 explicitly without coercing to undefined", async () => {
    const tool = createContinueWorkTool({ agentSessionKey: SESSION_KEY });
    const payload = readJsonPayload(
      await tool.execute("call-3b", { reason: REASON, delaySeconds: 0 }),
    );
    expect(payload.status).toBe("scheduled");
    expect(payload.delaySeconds).toBe(0);
  });

  // (c) delaySeconds < 0 throws ToolInputError
  it("throws ToolInputError when delaySeconds is negative", async () => {
    const tool = createContinueWorkTool({ agentSessionKey: SESSION_KEY });
    await expect(
      tool.execute("call-4", { reason: REASON, delaySeconds: -1 }),
    ).rejects.toBeInstanceOf(ToolInputError);
  });

  // (d) setPendingWorkRequest writes {reason, delaySeconds} under sessionKey
  it("writes the pending request to the store keyed by the active sessionKey", async () => {
    const tool = createContinueWorkTool({ agentSessionKey: SESSION_KEY });
    await tool.execute("call-5", { reason: REASON, delaySeconds: 5 });

    // Reading from a different key returns undefined.
    expect(consumePendingWorkRequest("agent:main:discord:channel:other")).toBeUndefined();

    // The active sessionKey returns the stored entry.
    const stored = consumePendingWorkRequest(SESSION_KEY);
    expect(stored).toEqual({ reason: REASON, delaySeconds: 5 });

    // Consume drains: subsequent reads return undefined.
    expect(consumePendingWorkRequest(SESSION_KEY)).toBeUndefined();
  });

  // (e) Reason sliced to 1024 chars
  it("slices reason to 1024 chars when stored", async () => {
    const longReason = "x".repeat(2000);
    const tool = createContinueWorkTool({ agentSessionKey: SESSION_KEY });
    await tool.execute("call-6", { reason: longReason });

    const stored = consumePendingWorkRequest(SESSION_KEY);
    expect(stored?.reason.length).toBe(1024);
    expect(stored?.reason).toBe("x".repeat(1024));
  });

  it("leaves shorter reasons unmodified", async () => {
    const shortReason = "concise next-step";
    const tool = createContinueWorkTool({ agentSessionKey: SESSION_KEY });
    await tool.execute("call-7", { reason: shortReason });

    const stored = consumePendingWorkRequest(SESSION_KEY);
    expect(stored?.reason).toBe(shortReason);
  });
});
