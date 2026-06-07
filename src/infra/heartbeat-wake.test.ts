// Exercises heartbeat wake coalescing, retries, and skip handling.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearContinuationWakeDispatching,
  hasContinuationWakeDispatching,
  markContinuationWakeDispatching,
  resetContinuationStateForTests,
} from "../auto-reply/continuation/state.js";
import {
  HEARTBEAT_SKIP_CRON_IN_PROGRESS,
  HEARTBEAT_SKIP_LANES_BUSY,
  HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT,
  type HeartbeatBatchWake,
  hasHeartbeatWakeHandler,
  hasPendingHeartbeatWake,
  hasPendingHeartbeatWakeForSession,
  requestHeartbeat,
  requestHeartbeatNow,
  resetHeartbeatWakeStateForTests,
  setHeartbeatBatchDispatchHook,
  setHeartbeatWakeHandler,
} from "./heartbeat-wake.js";

describe("heartbeat-wake", () => {
  type WakeRequest = Parameters<typeof requestHeartbeat>[0];
  function wake(reason: string, opts: Partial<WakeRequest> = {}): WakeRequest {
    const source =
      opts.source ??
      (reason === "interval"
        ? "interval"
        : reason === "manual"
          ? "manual"
          : reason === "retry"
            ? "retry"
            : reason === "exec-event"
              ? "exec-event"
              : reason.startsWith("cron:")
                ? "cron"
                : reason.startsWith("hook:")
                  ? "hook"
                  : "other");
    const intent =
      opts.intent ??
      (reason === "interval" ? "scheduled" : reason === "manual" ? "manual" : "event");
    return { source, intent, reason, ...opts };
  }

  function setRetryOnceHeartbeatHandler() {
    const handler = vi
      .fn()
      .mockResolvedValueOnce({ status: "skipped", reason: HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT })
      .mockResolvedValueOnce({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);
    return handler;
  }

  function expectWakeCall(handler: ReturnType<typeof vi.fn>, index: number, request: WakeRequest) {
    const [actualRequest] = handler.mock.calls[index] ?? [];
    expect(actualRequest).toEqual(request);
  }

  async function expectRetryAfterDefaultDelay(params: {
    handler: ReturnType<typeof vi.fn>;
    initialReason: string;
    expectedRetryReason: string;
  }) {
    setHeartbeatWakeHandler(
      params.handler as unknown as Parameters<typeof setHeartbeatWakeHandler>[0],
    );
    requestHeartbeat(wake(params.initialReason, { coalesceMs: 0 }));

    await vi.advanceTimersByTimeAsync(1);
    expect(params.handler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(params.handler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(params.handler).toHaveBeenCalledTimes(2);
    expectWakeCall(params.handler, 1, wake(params.expectedRetryReason));
  }

  beforeEach(() => {
    resetHeartbeatWakeStateForTests();
  });

  afterEach(() => {
    resetHeartbeatWakeStateForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("coalesces multiple wake requests into one run", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "skipped", reason: "disabled" });
    setHeartbeatWakeHandler(handler);

    requestHeartbeat(wake("interval", { coalesceMs: 200 }));
    requestHeartbeat(wake("exec-event", { coalesceMs: 200 }));
    requestHeartbeat(wake("retry", { coalesceMs: 200 }));

    expect(hasPendingHeartbeatWake()).toBe(true);

    await vi.advanceTimersByTimeAsync(199);
    expect(handler).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(wake("exec-event"));
    expect(hasPendingHeartbeatWake()).toBe(false);
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

  it("retries requests-in-flight after the default retry delay", async () => {
    vi.useFakeTimers();
    const handler = vi
      .fn()
      .mockResolvedValueOnce({ status: "skipped", reason: HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT })
      .mockResolvedValueOnce({ status: "ran", durationMs: 1 });
    await expectRetryAfterDefaultDelay({
      handler,
      initialReason: "interval",
      expectedRetryReason: "interval",
    });
  });

  it.each([HEARTBEAT_SKIP_CRON_IN_PROGRESS, HEARTBEAT_SKIP_LANES_BUSY])(
    "retries %s after the default retry delay",
    async (reason) => {
      vi.useFakeTimers();
      const handler = vi
        .fn()
        .mockResolvedValueOnce({ status: "skipped", reason })
        .mockResolvedValueOnce({ status: "ran", durationMs: 1 });
      await expectRetryAfterDefaultDelay({
        handler,
        initialReason: "interval",
        expectedRetryReason: "interval",
      });
    },
  );

  it("keeps retry cooldown even when a sooner request arrives", async () => {
    vi.useFakeTimers();
    const handler = setRetryOnceHeartbeatHandler();

    requestHeartbeat(wake("interval", { coalesceMs: 0 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(handler).toHaveBeenCalledTimes(1);

    // Retry is now waiting for 1000ms. This should not preempt cooldown.
    requestHeartbeat(wake("hook:wake", { coalesceMs: 0 }));
    await vi.advanceTimersByTimeAsync(998);
    expect(handler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(handler).toHaveBeenCalledTimes(2);
    expectWakeCall(handler, 1, wake("hook:wake"));
  });

  it("retries thrown handler errors after the default retry delay", async () => {
    vi.useFakeTimers();
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: "skipped", reason: "disabled" });
    await expectRetryAfterDefaultDelay({
      handler,
      initialReason: "exec-event",
      expectedRetryReason: "exec-event",
    });
  });

  it("stale disposer does not clear a newer handler", async () => {
    vi.useFakeTimers();
    const handlerA = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    const handlerB = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });

    // Runner A registers its handler
    const disposeA = setHeartbeatWakeHandler(handlerA);

    // Runner B registers its handler (replaces A)
    const disposeB = setHeartbeatWakeHandler(handlerB);

    // Runner A's stale cleanup runs — should NOT clear handlerB
    disposeA();
    expect(hasHeartbeatWakeHandler()).toBe(true);

    // handlerB should still work
    requestHeartbeat(wake("interval", { coalesceMs: 0 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(handlerA).not.toHaveBeenCalled();

    // Runner B's dispose should work
    disposeB();
    expect(hasHeartbeatWakeHandler()).toBe(false);
  });

  it("preempts existing timer when a sooner schedule is requested", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);

    // Schedule for 5 seconds from now
    requestHeartbeat(wake("slow", { coalesceMs: 5000 }));

    // Schedule for 100ms from now — should preempt the 5s timer
    requestHeartbeat(wake("fast", { coalesceMs: 100 }));

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(1);
    // The reason should be "fast" since it was set last
    expect(handler).toHaveBeenCalledWith(wake("fast"));
  });

  it("keeps existing timer when later schedule is requested", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);

    // Schedule for 100ms from now
    requestHeartbeat(wake("fast", { coalesceMs: 100 }));

    // Schedule for 5 seconds from now — should NOT preempt
    requestHeartbeat(wake("slow", { coalesceMs: 5000 }));

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("clamps oversized coalesce delays instead of firing immediately", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);

    requestHeartbeat(wake("slow", { coalesceMs: Number.MAX_SAFE_INTEGER }));

    await vi.advanceTimersByTimeAsync(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not downgrade a higher-priority pending reason", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);

    requestHeartbeat(wake("exec-event", { coalesceMs: 100 }));
    requestHeartbeat(wake("retry", { coalesceMs: 100 }));

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(wake("exec-event"));
  });

  it("resets running/scheduled flags when new handler is registered", async () => {
    vi.useFakeTimers();

    // Simulate a handler that's mid-execution when SIGUSR1 fires.
    // We do this by having the handler hang forever (never resolve).
    let resolveHang: () => void;
    const hangPromise = new Promise<void>((r) => {
      resolveHang = r;
    });
    const handlerA = vi
      .fn()
      .mockReturnValue(hangPromise.then(() => ({ status: "ran" as const, durationMs: 1 })));
    setHeartbeatWakeHandler(handlerA);

    // Trigger the handler — it starts running but never finishes
    requestHeartbeat(wake("interval", { coalesceMs: 0 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(handlerA).toHaveBeenCalledTimes(1);

    // Now simulate SIGUSR1: register a new handler while handlerA is still running.
    // Without the fix, `running` would stay true and handlerB would never fire.
    const handlerB = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handlerB);

    // handlerB should be able to fire (running was reset)
    requestHeartbeat(wake("interval", { coalesceMs: 0 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(handlerB).toHaveBeenCalledTimes(1);

    // Clean up the hanging promise
    resolveHang!();
    await Promise.resolve();
  });

  it("clears stale retry cooldown when a new handler is registered", async () => {
    vi.useFakeTimers();
    const handlerA = vi
      .fn()
      .mockResolvedValue({ status: "skipped", reason: HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT });
    setHeartbeatWakeHandler(handlerA);

    requestHeartbeat(wake("interval", { coalesceMs: 0 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(handlerA).toHaveBeenCalledTimes(1);

    // Simulate SIGUSR1 startup with a fresh wake handler.
    const handlerB = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handlerB);

    requestHeartbeat(wake("manual", { coalesceMs: 0 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledWith(wake("manual"));
  });

  it("drains pending wake once a handler is registered", async () => {
    vi.useFakeTimers();

    requestHeartbeat(wake("manual", { coalesceMs: 0 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(hasPendingHeartbeatWake()).toBe(true);

    const handler = vi.fn().mockResolvedValue({ status: "skipped", reason: "disabled" });
    setHeartbeatWakeHandler(handler);

    await vi.advanceTimersByTimeAsync(249);
    expect(handler).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(wake("manual"));
    expect(hasPendingHeartbeatWake()).toBe(false);
  });

  it("forwards wake target fields and preserves them across retries", async () => {
    vi.useFakeTimers();
    const handler = setRetryOnceHeartbeatHandler();

    requestHeartbeat({
      source: "cron",
      intent: "immediate",
      reason: "cron:job-1",
      agentId: "ops",
      sessionKey: "agent:ops:guildchat:channel:alerts",
      heartbeat: { target: "last" },
      coalesceMs: 0,
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expectWakeCall(handler, 0, {
      source: "cron",
      intent: "immediate",
      reason: "cron:job-1",
      agentId: "ops",
      sessionKey: "agent:ops:guildchat:channel:alerts",
      heartbeat: { target: "last" },
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(handler).toHaveBeenCalledTimes(2);
    expectWakeCall(handler, 1, {
      source: "cron",
      intent: "immediate",
      reason: "cron:job-1",
      agentId: "ops",
      sessionKey: "agent:ops:guildchat:channel:alerts",
      heartbeat: { target: "last" },
    });
  });

  it("preserves heartbeat override when same-target wakes coalesce", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);

    requestHeartbeat({
      source: "manual",
      intent: "manual",
      reason: "manual",
      agentId: "ops",
      sessionKey: "agent:ops:guildchat:channel:alerts",
      heartbeat: { target: "last" },
      coalesceMs: 100,
    });
    requestHeartbeat({
      source: "manual",
      intent: "manual",
      reason: "manual",
      agentId: "ops",
      sessionKey: "agent:ops:guildchat:channel:alerts",
      coalesceMs: 100,
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      source: "manual",
      intent: "manual",
      reason: "manual",
      agentId: "ops",
      sessionKey: "agent:ops:guildchat:channel:alerts",
      heartbeat: { target: "last" },
    });
  });

  it("executes distinct targeted wakes queued in the same coalescing window", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    setHeartbeatWakeHandler(handler);

    requestHeartbeat({
      source: "cron",
      intent: "event",
      reason: "cron:job-a",
      agentId: "ops",
      sessionKey: "agent:ops:guildchat:channel:alerts",
      coalesceMs: 100,
    });
    requestHeartbeat({
      source: "cron",
      intent: "event",
      reason: "cron:job-b",
      agentId: "main",
      sessionKey: "agent:main:forum:group:-1001",
      coalesceMs: 100,
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(handler).toHaveBeenCalledTimes(2);
    const handledRequests = handler.mock.calls
      .map((call) => call[0])
      .toSorted((left, right) => left.reason.localeCompare(right.reason));
    expect(handledRequests).toEqual([
      {
        source: "cron",
        intent: "event",
        reason: "cron:job-a",
        agentId: "ops",
        sessionKey: "agent:ops:guildchat:channel:alerts",
      },
      {
        source: "cron",
        intent: "event",
        reason: "cron:job-b",
        agentId: "main",
        sessionKey: "agent:main:forum:group:-1001",
      },
    ]);
  });

  it("reports a pending heartbeat wake targeting a specific session (#952)", () => {
    vi.useFakeTimers();
    setHeartbeatWakeHandler(vi.fn().mockResolvedValue({ status: "skipped", reason: "disabled" }));

    const childSessionKey = "agent:main:subagent:child";
    expect(hasPendingHeartbeatWakeForSession(childSessionKey)).toBe(false);

    requestHeartbeatNow({
      reason: "continuation",
      agentId: "main",
      sessionKey: childSessionKey,
      coalesceMs: 200,
    });

    expect(hasPendingHeartbeatWakeForSession(childSessionKey)).toBe(true);
    // A different session's wake must not be confused for this child's.
    expect(hasPendingHeartbeatWakeForSession("agent:main:subagent:other")).toBe(false);
  });

  it("a continuation wake handler's dispatching marker spans the pendingWakes.clear→active gap (#952)", async () => {
    vi.useFakeTimers();
    resetContinuationStateForTests();
    const childSessionKey = "agent:main:subagent:child";

    // Mirror heartbeat-runner's wakeHandler contract: set the dispatching marker
    // as the FIRST synchronous statement (before any await) and clear in finally.
    // The dispatcher invokes active(wakeOpts) synchronously right after
    // pendingWakes.clear(), so the marker is already live by the time the handler
    // body runs — exactly when a continuation-defer recheck poll could observe
    // state. This drives the REAL dispatcher (not a manufactured overlap).
    let gapSignals: { queued: boolean; dispatching: boolean } | undefined;
    setHeartbeatWakeHandler(async (opts) => {
      const key = opts.sessionKey ?? "";
      markContinuationWakeDispatching(key);
      try {
        await Promise.resolve();
        // pendingWakes was already cleared by the dispatcher, yet the marker
        // keeps the continuation pending — closing the all-false race window.
        gapSignals = {
          queued: hasPendingHeartbeatWakeForSession(childSessionKey),
          dispatching: hasContinuationWakeDispatching(childSessionKey),
        };
        return { status: "ran", durationMs: 0 };
      } finally {
        clearContinuationWakeDispatching(key);
      }
    });

    requestHeartbeatNow({
      reason: "continuation",
      agentId: "main",
      sessionKey: childSessionKey,
      coalesceMs: 0,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(gapSignals).toEqual({ queued: false, dispatching: true });
    // The marker is released once the handler returns.
    expect(hasContinuationWakeDispatching(childSessionKey)).toBe(false);
    resetContinuationStateForTests();
  });

  it("releases batch-marked continuation marks for wakes whose handler never runs when an earlier wake throws (#952)", async () => {
    vi.useFakeTimers();
    resetContinuationStateForTests();
    const firstSessionKey = "agent:main:subagent:first";
    const continuationSessionKey = "agent:main:subagent:second";

    // Register the batch-dispatch hook exactly as heartbeat-runner does: mark
    // every continuation wake at dequeue, and return a release that clears marks
    // for wakes the batch loop never reached. The dispatcher calls this release
    // in its finally with the wakes whose handler ran.
    setHeartbeatBatchDispatchHook((batch) => {
      const marked: Array<{ wake: HeartbeatBatchWake; sessionKey: string }> = [];
      for (const batchWake of batch) {
        if (batchWake.reason !== "continuation") {
          continue;
        }
        const sessionKey = batchWake.sessionKey ?? "";
        if (!sessionKey) {
          continue;
        }
        markContinuationWakeDispatching(sessionKey);
        marked.push({ wake: batchWake, sessionKey });
      }
      return (handled) => {
        for (const entry of marked) {
          if (!handled.has(entry.wake)) {
            clearContinuationWakeDispatching(entry.sessionKey);
          }
        }
      };
    });

    // The first wake's handler rejects → the dispatcher's catch re-queues the
    // batch and the position-2 continuation wake's handler is never invoked this
    // round, so its mark cannot be cleared by a handler finally.
    let markerWhileFirstHandlerRan: boolean | undefined;
    setHeartbeatWakeHandler(async (opts) => {
      if (opts.sessionKey === firstSessionKey) {
        markerWhileFirstHandlerRan = hasContinuationWakeDispatching(continuationSessionKey);
        throw new Error("boom");
      }
      return { status: "ran", durationMs: 0 };
    });

    requestHeartbeat({
      source: "manual",
      intent: "manual",
      reason: "manual",
      agentId: "main",
      sessionKey: firstSessionKey,
      coalesceMs: 0,
    });
    requestHeartbeat({
      source: "other",
      intent: "immediate",
      reason: "continuation",
      agentId: "main",
      sessionKey: continuationSessionKey,
      coalesceMs: 0,
    });
    await vi.advanceTimersByTimeAsync(1);

    // The continuation wake was marked at dequeue (live while the first handler
    // ran), and although its own handler never ran, the per-batch release cleared
    // it — no leaked marker pinning the child session for the leak-guard window.
    expect(markerWhileFirstHandlerRan).toBe(true);
    expect(hasContinuationWakeDispatching(continuationSessionKey)).toBe(false);

    resetContinuationStateForTests();
  });
});
