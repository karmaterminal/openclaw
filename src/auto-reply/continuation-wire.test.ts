import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTINUATION_DEFAULTS } from "./continuation-config.js";
import {
  clearAllPendingDelegates,
  clearAllPostCompactionDelegates,
  enqueuePendingDelegate,
} from "./continuation-delegate-store.js";
import { clearAllContinuationTimers } from "./continuation-scheduler.js";
import {
  cancelDelegateTimers,
  processContinuationPostResponse,
  type ContinuationPostResponseParams,
} from "./continuation-wire.js";

describe("continuation-wire", () => {
  afterEach(() => {
    clearAllPendingDelegates();
    clearAllPostCompactionDelegates();
    clearAllContinuationTimers();
    vi.restoreAllMocks();
  });

  const SESSION = "agent:main:test:wire";
  const ENABLED_CONFIG = { ...CONTINUATION_DEFAULTS, enabled: true };

  function makeParams(
    overrides?: Partial<ContinuationPostResponseParams>,
  ): ContinuationPostResponseParams {
    return {
      sessionKey: SESSION,
      continuationConfig: ENABLED_CONFIG,
      finalText: undefined,
      chainDepth: 0,
      chainTokens: 0,
      ...overrides,
    };
  }

  // ---------- Disabled gate ----------

  describe("when continuation is disabled", () => {
    it("returns text unchanged and no continuation", () => {
      const result = processContinuationPostResponse(
        makeParams({
          continuationConfig: { enabled: false },
          finalText: "Reply text\n\nCONTINUE_WORK",
        }),
      );

      expect(result.displayText).toBe("Reply text\n\nCONTINUE_WORK");
      expect(result.continuationScheduled).toBe(false);
      expect(result.signal).toBeUndefined();
      expect(result.consumedDelegates).toHaveLength(0);
    });
  });

  // ---------- Token-fallback: CONTINUE_WORK ----------

  describe("token-fallback: CONTINUE_WORK", () => {
    it("parses and strips CONTINUE_WORK, schedules continuation", () => {
      const result = processContinuationPostResponse(
        makeParams({ finalText: "Reply text\n\nCONTINUE_WORK" }),
      );

      expect(result.displayText).toBe("Reply text");
      expect(result.continuationScheduled).toBe(true);
      expect(result.signal).toEqual({ kind: "work", delaySeconds: undefined });
    });

    it("parses CONTINUE_WORK:30 with delay", () => {
      const result = processContinuationPostResponse(
        makeParams({ finalText: "Done. CONTINUE_WORK:30" }),
      );

      expect(result.displayText).toBe("Done.");
      expect(result.continuationScheduled).toBe(true);
      expect(result.signal).toEqual({ kind: "work", delaySeconds: 30 });
    });

    it("returns undefined displayText when entire message is CONTINUE_WORK", () => {
      const result = processContinuationPostResponse(makeParams({ finalText: "CONTINUE_WORK" }));

      expect(result.displayText).toBeUndefined();
      expect(result.continuationScheduled).toBe(true);
    });
  });

  // ---------- Token-fallback: [[CONTINUE_DELEGATE:]] ----------

  describe("token-fallback: [[CONTINUE_DELEGATE:]]", () => {
    it("parses and strips delegate bracket syntax", () => {
      const result = processContinuationPostResponse(
        makeParams({
          finalText: "Summary.\n\n[[CONTINUE_DELEGATE: check CI status]]",
        }),
      );

      expect(result.displayText).toBe("Summary.");
      expect(result.continuationScheduled).toBe(true);
      expect(result.signal).toEqual({
        kind: "delegate",
        task: "check CI status",
        delaySeconds: undefined,
      });
      expect(result.consumedDelegates).toHaveLength(1);
      expect(result.consumedDelegates[0].task).toBe("check CI status");
      expect(result.consumedDelegates[0].mode).toBe("normal");
    });

    it("parses delegate with +Ns delay suffix", () => {
      const result = processContinuationPostResponse(
        makeParams({
          finalText: "Review done.\n\n[[CONTINUE_DELEGATE: verify tests +10s]]",
        }),
      );

      expect(result.signal).toEqual({
        kind: "delegate",
        task: "verify tests",
        delaySeconds: 10,
      });
      expect(result.consumedDelegates[0].delayMs).toBe(10_000);
    });
  });

  // ---------- Tool-path priority over token-fallback ----------

  describe("tool-path priority", () => {
    it("tool-path delegates suppress token-fallback signal parsing", () => {
      // Enqueue a tool-path delegate before processing
      enqueuePendingDelegate(SESSION, {
        task: "tool-path task",
        delayMs: 15_000,
        mode: "silent-wake",
        chainHop: 0,
        enqueuedAt: Date.now(),
      });

      const result = processContinuationPostResponse(
        makeParams({ finalText: "Reply.\n\nCONTINUE_WORK" }),
      );

      // Token fallback signal is still parsed (for stripping)
      expect(result.signal).toEqual({ kind: "work", delaySeconds: undefined });
      // But the consumed delegates come from tool-path, not token-fallback
      expect(result.consumedDelegates).toHaveLength(1);
      expect(result.consumedDelegates[0].task).toBe("tool-path task");
      expect(result.consumedDelegates[0].mode).toBe("silent-wake");
      expect(result.continuationScheduled).toBe(true);
    });
  });

  // ---------- Delegate categorization ----------

  describe("delegate categorization", () => {
    it("categorizes immediate delegates (delayMs=0)", () => {
      enqueuePendingDelegate(SESSION, {
        task: "immediate work",
        delayMs: 0,
        mode: "normal",
        chainHop: 0,
        enqueuedAt: Date.now(),
      });

      const result = processContinuationPostResponse(makeParams());

      expect(result.immediateSpawns).toHaveLength(1);
      expect(result.immediateSpawns[0].task).toBe("immediate work");
      expect(result.delayedTimers).toHaveLength(0);
      expect(result.postCompactionStaged).toHaveLength(0);
    });

    it("categorizes delayed delegates and arms timers", () => {
      const spawnCallback = vi.fn();

      enqueuePendingDelegate(SESSION, {
        task: "delayed work",
        delayMs: 60_000,
        mode: "normal",
        chainHop: 0,
        enqueuedAt: Date.now(),
      });

      const result = processContinuationPostResponse(
        makeParams({ onDelegateSpawn: spawnCallback }),
      );

      expect(result.immediateSpawns).toHaveLength(0);
      expect(result.delayedTimers).toHaveLength(1);
      expect(result.delayedTimers[0].delegate.task).toBe("delayed work");
      expect(result.delayedTimers[0].dueAt).toBeGreaterThan(Date.now());
      expect(result.postCompactionStaged).toHaveLength(0);

      // Clean up timer
      cancelDelegateTimers(result.delayedTimers);
    });

    it("categorizes post-compaction delegates as staged", () => {
      enqueuePendingDelegate(SESSION, {
        task: "post-compaction resume",
        delayMs: 0,
        mode: "post-compaction",
        chainHop: 0,
        enqueuedAt: Date.now(),
      });

      const result = processContinuationPostResponse(makeParams());

      expect(result.immediateSpawns).toHaveLength(0);
      expect(result.delayedTimers).toHaveLength(0);
      expect(result.postCompactionStaged).toHaveLength(1);
      expect(result.postCompactionStaged[0].task).toBe("post-compaction resume");
    });

    it("handles mixed delegate modes in one turn", () => {
      const spawnCallback = vi.fn();

      enqueuePendingDelegate(SESSION, {
        task: "immediate",
        delayMs: 0,
        mode: "normal",
        chainHop: 0,
        enqueuedAt: Date.now(),
      });
      enqueuePendingDelegate(SESSION, {
        task: "delayed",
        delayMs: 30_000,
        mode: "silent-wake",
        chainHop: 0,
        enqueuedAt: Date.now(),
      });
      enqueuePendingDelegate(SESSION, {
        task: "staged",
        delayMs: 0,
        mode: "post-compaction",
        chainHop: 0,
        enqueuedAt: Date.now(),
      });

      const result = processContinuationPostResponse(
        makeParams({ onDelegateSpawn: spawnCallback }),
      );

      expect(result.immediateSpawns).toHaveLength(1);
      expect(result.immediateSpawns[0].task).toBe("immediate");
      expect(result.delayedTimers).toHaveLength(1);
      expect(result.delayedTimers[0].delegate.task).toBe("delayed");
      expect(result.postCompactionStaged).toHaveLength(1);
      expect(result.postCompactionStaged[0].task).toBe("staged");
      expect(result.consumedDelegates).toHaveLength(3);
      expect(result.continuationScheduled).toBe(true);

      cancelDelegateTimers(result.delayedTimers);
    });
  });

  // ---------- Delayed timer fires onDelegateSpawn ----------

  describe("delayed delegate timer callback", () => {
    it("fires onDelegateSpawn with captured delegate payload", async () => {
      vi.useFakeTimers();
      const spawnCallback = vi.fn();

      enqueuePendingDelegate(SESSION, {
        task: "check CI",
        delayMs: 10_000,
        mode: "silent-wake",
        chainHop: 2,
        enqueuedAt: Date.now(),
      });

      const result = processContinuationPostResponse(
        makeParams({ onDelegateSpawn: spawnCallback }),
      );

      expect(result.delayedTimers).toHaveLength(1);
      expect(spawnCallback).not.toHaveBeenCalled();

      // Advance time past the delay
      vi.advanceTimersByTime(11_000);

      expect(spawnCallback).toHaveBeenCalledOnce();
      expect(spawnCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          task: "check CI",
          mode: "silent-wake",
          chainHop: 2,
        }),
      );

      vi.useRealTimers();
    });

    it("clamps delegate delay to configured bounds", () => {
      vi.useFakeTimers();
      const spawnCallback = vi.fn();

      // Delay below minDelayMs — should be clamped up
      enqueuePendingDelegate(SESSION, {
        task: "too fast",
        delayMs: 1_000, // below 5000 min
        mode: "normal",
        chainHop: 0,
        enqueuedAt: Date.now(),
      });

      const result = processContinuationPostResponse(
        makeParams({ onDelegateSpawn: spawnCallback }),
      );

      // Timer should be clamped to minDelayMs (5000)
      expect(result.delayedTimers).toHaveLength(1);

      // At 2s: not yet fired
      vi.advanceTimersByTime(2_000);
      expect(spawnCallback).not.toHaveBeenCalled();

      // At 6s: should have fired (clamped to 5s)
      vi.advanceTimersByTime(4_000);
      expect(spawnCallback).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });
  });

  // ---------- Chain depth guard at categorization ----------

  describe("chain depth guard on delegates", () => {
    it("rejects delegates when chain depth is exhausted", () => {
      enqueuePendingDelegate(SESSION, {
        task: "should be rejected",
        delayMs: 0,
        mode: "normal",
        chainHop: 0,
        enqueuedAt: Date.now(),
      });

      const result = processContinuationPostResponse(
        makeParams({ chainDepth: CONTINUATION_DEFAULTS.maxChainLength }),
      );

      // Delegate is consumed but not categorized as immediate/delayed
      expect(result.consumedDelegates).toHaveLength(1);
      expect(result.immediateSpawns).toHaveLength(0);
      expect(result.delayedTimers).toHaveLength(0);
    });

    it("post-compaction delegates bypass chain depth guard", () => {
      enqueuePendingDelegate(SESSION, {
        task: "compaction work",
        delayMs: 0,
        mode: "post-compaction",
        chainHop: 0,
        enqueuedAt: Date.now(),
      });

      const result = processContinuationPostResponse(
        makeParams({ chainDepth: CONTINUATION_DEFAULTS.maxChainLength }),
      );

      // Post-compaction delegates are staged regardless of chain depth
      expect(result.postCompactionStaged).toHaveLength(1);
      expect(result.postCompactionStaged[0].task).toBe("compaction work");
    });
  });

  // ---------- Tool/token parity ----------

  describe("tool/token parity", () => {
    it("token-path CONTINUE_WORK uses same scheduler as tool-path", () => {
      // Token path
      const tokenResult = processContinuationPostResponse(
        makeParams({
          sessionKey: "session:token",
          finalText: "Reply CONTINUE_WORK:30",
        }),
      );

      // Both should schedule continuation
      expect(tokenResult.continuationScheduled).toBe(true);
      expect(tokenResult.signal?.kind).toBe("work");

      clearAllContinuationTimers();
    });

    it("token-path delegate uses same store+categorization as tool-path", () => {
      const spawnCallback = vi.fn();

      const result = processContinuationPostResponse(
        makeParams({
          finalText: "Summary.\n\n[[CONTINUE_DELEGATE: check CI +10s]]",
          onDelegateSpawn: spawnCallback,
        }),
      );

      // Token-path delegate should be consumed and categorized like tool-path
      expect(result.consumedDelegates).toHaveLength(1);
      expect(result.consumedDelegates[0].task).toBe("check CI");
      expect(result.consumedDelegates[0].delayMs).toBe(10_000);
      // Delayed delegate → armed timer
      expect(result.delayedTimers).toHaveLength(1);
      expect(result.delayedTimers[0].delegate.task).toBe("check CI");

      cancelDelegateTimers(result.delayedTimers);
    });
  });

  // ---------- No-op cases ----------

  describe("no-op cases", () => {
    it("returns unchanged text when no signal is present", () => {
      const result = processContinuationPostResponse(
        makeParams({ finalText: "Just a normal reply." }),
      );

      expect(result.displayText).toBe("Just a normal reply.");
      expect(result.continuationScheduled).toBe(false);
      expect(result.signal).toBeUndefined();
    });

    it("handles undefined finalText", () => {
      const result = processContinuationPostResponse(makeParams({ finalText: undefined }));

      expect(result.displayText).toBeUndefined();
      expect(result.continuationScheduled).toBe(false);
    });

    it("handles empty finalText", () => {
      const result = processContinuationPostResponse(makeParams({ finalText: "" }));

      expect(result.displayText).toBe("");
      expect(result.continuationScheduled).toBe(false);
    });
  });

  // ---------- cancelDelegateTimers ----------

  describe("cancelDelegateTimers", () => {
    it("cancels all armed timers", () => {
      vi.useFakeTimers();
      const spawnCallback = vi.fn();

      enqueuePendingDelegate(SESSION, {
        task: "will cancel",
        delayMs: 30_000,
        mode: "normal",
        chainHop: 0,
        enqueuedAt: Date.now(),
      });

      const result = processContinuationPostResponse(
        makeParams({ onDelegateSpawn: spawnCallback }),
      );

      cancelDelegateTimers(result.delayedTimers);

      // Advance past the delay — callback should NOT fire
      vi.advanceTimersByTime(60_000);
      expect(spawnCallback).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
