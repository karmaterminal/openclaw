// Exercises trusted continuation wake routing and parent-run forwarding.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetGatewayWorkAdmission } from "../process/gateway-work-admission.js";
import {
  hasTrustedContinuationHeartbeatWake,
  markTrustedContinuationHeartbeatWake,
  requestHeartbeatRaw,
  requestHeartbeatNow,
  setHeartbeatWakeHandler as setRuntimeHeartbeatWakeHandler,
} from "./heartbeat-wake.js";

describe("heartbeat-wake continuation routing", () => {
  type HeartbeatWakeHandler = Parameters<typeof setRuntimeHeartbeatWakeHandler>[0];
  type WakeRequest = Parameters<typeof requestHeartbeatRaw>[0];
  let currentHandlerDisposer: (() => void) | undefined;

  // Internal trust markers are non-enumerable, so these tests use the raw entry point.
  const requestHeartbeat = requestHeartbeatRaw;

  function setHeartbeatWakeHandler(handler: HeartbeatWakeHandler): void {
    currentHandlerDisposer?.();
    currentHandlerDisposer = setRuntimeHeartbeatWakeHandler(handler);
  }

  function wake(reason: string, opts: Partial<WakeRequest> = {}): WakeRequest {
    const source = opts.source ?? (reason === "exec-event" ? "exec-event" : "other");
    const intent = opts.intent ?? "event";
    return { source, intent, reason, ...opts };
  }

  function trustedWake(reason: string, opts: Partial<WakeRequest> = {}): WakeRequest {
    return markTrustedContinuationHeartbeatWake(wake(reason, opts));
  }

  beforeEach(() => {
    resetGatewayWorkAdmission();
  });

  afterEach(async () => {
    resetGatewayWorkAdmission();
    if (vi.isFakeTimers()) {
      currentHandlerDisposer?.();
      currentHandlerDisposer = setRuntimeHeartbeatWakeHandler(async () => ({
        status: "skipped",
        reason: "disabled",
      }));
      await vi.runAllTimersAsync();
    }
    currentHandlerDisposer?.();
    currentHandlerDisposer = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps trusted and untrusted same-priority wakes distinct when trusted arrives first", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);

    requestHeartbeat(
      trustedWake("delegate-return", {
        agentId: "main",
        sessionKey: "agent:main:subagent:queue",
        coalesceMs: 100,
      }),
    );
    requestHeartbeat(
      wake("exec-event", {
        agentId: "main",
        sessionKey: "agent:main:subagent:queue",
        coalesceMs: 100,
      }),
    );

    await vi.advanceTimersByTimeAsync(100);

    expect(handler).toHaveBeenCalledTimes(2);
    const handled = handler.mock.calls
      .map(([request]) => ({
        reason: request.reason,
        trustedContinuationRouting: hasTrustedContinuationHeartbeatWake(request),
      }))
      .toSorted((left, right) => `${left.reason}`.localeCompare(`${right.reason}`));
    expect(handled).toEqual([
      { reason: "delegate-return", trustedContinuationRouting: true },
      { reason: "exec-event", trustedContinuationRouting: false },
    ]);
  });

  it("keeps trusted and untrusted same-priority wakes distinct when untrusted arrives first", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);

    requestHeartbeat(
      wake("exec-event", {
        agentId: "main",
        sessionKey: "agent:main:subagent:queue",
        coalesceMs: 100,
      }),
    );
    requestHeartbeat(
      trustedWake("delegate-return", {
        agentId: "main",
        sessionKey: "agent:main:subagent:queue",
        coalesceMs: 100,
      }),
    );

    await vi.advanceTimersByTimeAsync(100);

    expect(handler).toHaveBeenCalledTimes(2);
    const handled = handler.mock.calls
      .map(([request]) => ({
        reason: request.reason,
        trustedContinuationRouting: hasTrustedContinuationHeartbeatWake(request),
      }))
      .toSorted((left, right) => `${left.reason}`.localeCompare(`${right.reason}`));
    expect(handled).toEqual([
      { reason: "delegate-return", trustedContinuationRouting: true },
      { reason: "exec-event", trustedContinuationRouting: false },
    ]);
  });

  it("does not let later higher-priority untrusted wakes erase trusted continuation wakes", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);

    requestHeartbeat(
      trustedWake("delegate-return", {
        source: "other",
        intent: "event",
        agentId: "main",
        sessionKey: "agent:main:subagent:queue",
        coalesceMs: 100,
      }),
    );
    requestHeartbeat(
      wake("manual", {
        source: "manual",
        intent: "manual",
        agentId: "main",
        sessionKey: "agent:main:subagent:queue",
        coalesceMs: 100,
      }),
    );

    await vi.advanceTimersByTimeAsync(100);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(
      handler.mock.calls.some(
        ([request]) =>
          request.reason === "delegate-return" && hasTrustedContinuationHeartbeatWake(request),
      ),
    ).toBe(true);
    expect(
      handler.mock.calls.some(
        ([request]) => request.reason === "manual" && !hasTrustedContinuationHeartbeatWake(request),
      ),
    ).toBe(true);
  });

  it("does not let later higher-priority trusted wakes absorb untrusted wake reasons", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);

    requestHeartbeat(
      wake("exec-event", {
        source: "exec-event",
        intent: "event",
        agentId: "main",
        sessionKey: "agent:main:subagent:queue",
        coalesceMs: 100,
      }),
    );
    requestHeartbeat(
      trustedWake("delegate-return", {
        source: "manual",
        intent: "immediate",
        agentId: "main",
        sessionKey: "agent:main:subagent:queue",
        coalesceMs: 100,
      }),
    );

    await vi.advanceTimersByTimeAsync(100);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(
      handler.mock.calls.some(
        ([request]) =>
          request.reason === "exec-event" && !hasTrustedContinuationHeartbeatWake(request),
      ),
    ).toBe(true);
    expect(
      handler.mock.calls.some(
        ([request]) =>
          request.reason === "delegate-return" && hasTrustedContinuationHeartbeatWake(request),
      ),
    ).toBe(true);
  });

  it("preserves parent run id on wake delivery", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);

    requestHeartbeatNow({ reason: "continuation", parentRunId: "run-parent", coalesceMs: 0 });
    await vi.advanceTimersByTimeAsync(1);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "continuation",
        parentRunId: "run-parent",
      }),
    );
  });

  it("clears parent run id when a later same-target wake coalesces without one", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);

    requestHeartbeatNow({ reason: "continuation", parentRunId: "run-parent", coalesceMs: 200 });
    requestHeartbeatNow({ reason: "continuation", coalesceMs: 200 });
    await vi.advanceTimersByTimeAsync(200);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "continuation",
      }),
    );
    expect(handler.mock.calls[0]?.[0]).not.toHaveProperty("parentRunId");
  });
});
