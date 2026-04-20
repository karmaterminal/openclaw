/**
 * Tests for post-compaction delegate dispatch.
 *
 * Issue #203: Silent catch was swallowing post-compaction delegate spawn failures.
 * This test verifies that spawn failures are now properly logged and surfaced
 * as system events, matching the pattern in the regular delegate dispatch path.
 *
 * Issue #211: Post-compaction lifecycle release path had no integration test.
 * This file now also pins the spawn payload shape (silentAnnounce, wakeOnReturn,
 * drainsContinuationDelegateQueue) and verifies the happy-path dispatch behavior.
 *
 * NOTE: The guard-level behavior (preflightCompactionApplied check, continuationEnabledForPressure,
 * clearContextPressureState, checkContextPressure calls) lives in agent-runner.ts:1617-1659.
 * Testing that flow end-to-end requires full agent-runner fixture wiring (>200 lines of setup).
 * These helper-level tests pin the spawn payload contract; guard branches are verified manually
 * and through the observability of clearContextPressureState and checkContextPressure's own tests.
 *
 * See also: #639 for the bug-class precedent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture mock state for assertions
const mockState = vi.hoisted(() => ({
  spawnSubagentDirect: vi.fn(),
  warnLog: vi.fn(),
  infoLog: vi.fn(),
  enqueueSystemEvent: vi.fn(),
}));

// Mock spawnSubagentDirect — this is what we'll make throw
vi.mock("../../agents/subagent-spawn.js", () => ({
  spawnSubagentDirect: mockState.spawnSubagentDirect,
}));

// Mock the subsystem logger to capture log.warn calls
vi.mock("../../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: mockState.infoLog,
    warn: mockState.warnLog,
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock enqueueSystemEvent to capture system events
vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEvent: mockState.enqueueSystemEvent,
}));

import { dispatchPostCompactionDelegates } from "./delegate-dispatch.js";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("dispatchPostCompactionDelegates error handling (openclaw#203)", () => {
  it("logs warn + enqueues system event when spawnSubagentDirect throws", async () => {
    const sessionKey = "session-post-compact-fail";
    const testError = new Error("registry rejection: chain depth exceeded");

    mockState.spawnSubagentDirect.mockRejectedValueOnce(testError);

    const delegates = [{ task: "rehydrate workspace state after compaction" }];
    const spawnCtx = { agentSessionKey: sessionKey };

    const result = await dispatchPostCompactionDelegates(delegates, sessionKey, spawnCtx);

    // Verify the failure was tracked
    expect(result.failed).toBe(1);
    expect(result.dispatched).toBe(0);

    // Verify warn log was called with the correct anchor
    expect(mockState.warnLog).toHaveBeenCalledOnce();
    const warnCall = mockState.warnLog.mock.calls[0][0];
    expect(warnCall).toContain("[continuation:post-compaction-spawn-failed]");
    expect(warnCall).toContain("registry rejection: chain depth exceeded");
    expect(warnCall).toContain(sessionKey);
    expect(warnCall).toContain("rehydrate workspace state");

    // Verify system event was enqueued
    expect(mockState.enqueueSystemEvent).toHaveBeenCalledOnce();
    const [eventMessage, eventOpts] = mockState.enqueueSystemEvent.mock.calls[0];
    expect(eventMessage).toContain("[continuation] Post-compaction delegate spawn failed");
    expect(eventMessage).toContain("registry rejection: chain depth exceeded");
    expect(eventMessage).toContain("rehydrate workspace state after compaction");
    expect(eventOpts).toEqual({ sessionKey });
  });

  it("logs info on dispatch start regardless of outcome", async () => {
    const sessionKey = "session-post-compact-info";

    mockState.spawnSubagentDirect.mockRejectedValueOnce(new Error("test error"));

    const delegates = [{ task: "test delegate" }];
    await dispatchPostCompactionDelegates(delegates, sessionKey, { agentSessionKey: sessionKey });

    // Verify info log was called with delegate count
    expect(mockState.infoLog).toHaveBeenCalledOnce();
    const infoCall = mockState.infoLog.mock.calls[0][0];
    expect(infoCall).toContain("[continuation:compaction-delegate]");
    expect(infoCall).toContain("Consuming 1 compaction delegate(s)");
    expect(infoCall).toContain(sessionKey);
  });

  it("handles non-Error thrown values gracefully", async () => {
    const sessionKey = "session-non-error";

    // Throw a string instead of an Error object
    mockState.spawnSubagentDirect.mockRejectedValueOnce("lane queue full");

    const delegates = [{ task: "test task" }];
    const result = await dispatchPostCompactionDelegates(delegates, sessionKey, {
      agentSessionKey: sessionKey,
    });

    expect(result.failed).toBe(1);

    // Should still log and enqueue event with the string value
    expect(mockState.warnLog).toHaveBeenCalledOnce();
    expect(mockState.warnLog.mock.calls[0][0]).toContain("lane queue full");

    expect(mockState.enqueueSystemEvent).toHaveBeenCalledOnce();
    expect(mockState.enqueueSystemEvent.mock.calls[0][0]).toContain("lane queue full");
  });

  it("continues dispatching remaining delegates after a failure", async () => {
    const sessionKey = "session-continue-after-fail";

    // First delegate fails, second succeeds
    mockState.spawnSubagentDirect
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValueOnce({ status: "accepted" });

    const delegates = [{ task: "delegate-1" }, { task: "delegate-2" }];
    const result = await dispatchPostCompactionDelegates(delegates, sessionKey, {
      agentSessionKey: sessionKey,
    });

    expect(result.failed).toBe(1);
    expect(result.dispatched).toBe(1);
    expect(mockState.spawnSubagentDirect).toHaveBeenCalledTimes(2);
  });

  it("truncates long task strings in warn log to 80 chars", async () => {
    const sessionKey = "session-truncate";
    const longTask =
      "This is a very long task description that exceeds eighty characters and should be truncated in the log message for readability";

    mockState.spawnSubagentDirect.mockRejectedValueOnce(new Error("spawn failed"));

    await dispatchPostCompactionDelegates([{ task: longTask }], sessionKey, {
      agentSessionKey: sessionKey,
    });

    const warnCall = mockState.warnLog.mock.calls[0][0];
    // The task in the log should be truncated
    expect(warnCall).toContain(longTask.slice(0, 80));
    expect(warnCall).not.toContain(longTask.slice(80));

    // But the system event should contain the full task
    const eventMessage = mockState.enqueueSystemEvent.mock.calls[0][0];
    expect(eventMessage).toContain(longTask);
  });
});

/**
 * Post-compaction lifecycle release tests (openclaw#211)
 *
 * These tests verify the happy-path dispatch behavior and spawn payload shape
 * for the post-compaction continuation lifecycle (RFC §4.4).
 */
describe("dispatchPostCompactionDelegates lifecycle release (openclaw#211)", () => {
  it("dispatches two staged delegates with exactly two spawn calls", async () => {
    const sessionKey = "session-lifecycle-two-delegates";

    mockState.spawnSubagentDirect
      .mockResolvedValueOnce({ status: "accepted" })
      .mockResolvedValueOnce({ status: "accepted" });

    const delegates = [
      { task: "rehydrate workspace state after compaction" },
      { task: "restore file context from previous session" },
    ];
    const spawnCtx = {
      agentSessionKey: sessionKey,
      agentChannel: "test-channel",
      agentAccountId: "test-account",
      agentTo: "test-to",
      agentThreadId: "test-thread",
    };

    const result = await dispatchPostCompactionDelegates(delegates, sessionKey, spawnCtx);

    // AC 1.c: spawnSubagentDirect called exactly twice (one per staged delegate)
    expect(mockState.spawnSubagentDirect).toHaveBeenCalledTimes(2);
    expect(result.dispatched).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("passes silentAnnounce, wakeOnReturn, and drainsContinuationDelegateQueue to each spawn", async () => {
    const sessionKey = "session-lifecycle-flags";

    mockState.spawnSubagentDirect
      .mockResolvedValueOnce({ status: "accepted" })
      .mockResolvedValueOnce({ status: "accepted" });

    const delegates = [{ task: "delegate-1" }, { task: "delegate-2" }];
    const spawnCtx = { agentSessionKey: sessionKey };

    await dispatchPostCompactionDelegates(delegates, sessionKey, spawnCtx);

    // AC 1.d: Each spawn payload has silentAnnounce: true, wakeOnReturn: true, drainsContinuationDelegateQueue: true
    expect(mockState.spawnSubagentDirect).toHaveBeenCalledTimes(2);

    const [firstCallPayload, firstCallCtx] = mockState.spawnSubagentDirect.mock.calls[0];
    expect(firstCallPayload).toMatchObject({
      task: "delegate-1",
      silentAnnounce: true,
      wakeOnReturn: true,
      drainsContinuationDelegateQueue: true,
    });
    expect(firstCallCtx).toMatchObject({ agentSessionKey: sessionKey });

    const [secondCallPayload, secondCallCtx] = mockState.spawnSubagentDirect.mock.calls[1];
    expect(secondCallPayload).toMatchObject({
      task: "delegate-2",
      silentAnnounce: true,
      wakeOnReturn: true,
      drainsContinuationDelegateQueue: true,
    });
    expect(secondCallCtx).toMatchObject({ agentSessionKey: sessionKey });
  });

  it("makes zero spawn calls when no delegates are staged", async () => {
    const sessionKey = "session-lifecycle-empty";

    const result = await dispatchPostCompactionDelegates([], sessionKey, {
      agentSessionKey: sessionKey,
    });

    // AC 3: No staged delegates → no spawn calls
    expect(mockState.spawnSubagentDirect).not.toHaveBeenCalled();
    expect(result.dispatched).toBe(0);
    expect(result.failed).toBe(0);

    // Info log should still fire (with 0 delegates)
    expect(mockState.infoLog).toHaveBeenCalledOnce();
    const infoCall = mockState.infoLog.mock.calls[0][0];
    expect(infoCall).toContain("[continuation:compaction-delegate]");
    expect(infoCall).toContain("Consuming 0 compaction delegate(s)");
  });

  it("passes spawn context through to spawnSubagentDirect", async () => {
    const sessionKey = "session-lifecycle-context";

    mockState.spawnSubagentDirect.mockResolvedValueOnce({ status: "accepted" });

    const delegates = [{ task: "context-test" }];
    const spawnCtx = {
      agentSessionKey: sessionKey,
      agentChannel: "telegram",
      agentAccountId: "account-123",
      agentTo: "+1234567890",
      agentThreadId: 42,
    };

    await dispatchPostCompactionDelegates(delegates, sessionKey, spawnCtx);

    const [, receivedCtx] = mockState.spawnSubagentDirect.mock.calls[0];
    expect(receivedCtx).toEqual(spawnCtx);
  });

  it("returns correct counts when mixing successes and failures", async () => {
    const sessionKey = "session-lifecycle-mixed";

    // First two succeed, third fails
    mockState.spawnSubagentDirect
      .mockResolvedValueOnce({ status: "accepted" })
      .mockResolvedValueOnce({ status: "accepted" })
      .mockRejectedValueOnce(new Error("spawn failed"));

    const delegates = [{ task: "delegate-1" }, { task: "delegate-2" }, { task: "delegate-3" }];

    const result = await dispatchPostCompactionDelegates(delegates, sessionKey, {
      agentSessionKey: sessionKey,
    });

    expect(result.dispatched).toBe(2);
    expect(result.failed).toBe(1);
    expect(mockState.spawnSubagentDirect).toHaveBeenCalledTimes(3);
  });
});
