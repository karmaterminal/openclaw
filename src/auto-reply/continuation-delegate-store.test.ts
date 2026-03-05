import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueueCompactionDelegate,
  consumeCompactionDelegates,
  compactionDelegateCount,
  enqueuePendingDelegate,
  consumePendingDelegates,
  pendingDelegateCount,
} from "./continuation-delegate-store.js";

describe("continuation-delegate-store", () => {
  // Clear state between tests by consuming any leftover delegates
  beforeEach(() => {
    consumePendingDelegates("test-session");
    consumePendingDelegates("other-session");
    consumeCompactionDelegates("test-session");
    consumeCompactionDelegates("other-session");
  });

  it("returns empty array when no delegates pending", () => {
    expect(consumePendingDelegates("test-session")).toEqual([]);
  });

  it("enqueues and consumes a single delegate", () => {
    enqueuePendingDelegate("test-session", {
      task: "summarize the RFC",
      delayMs: 30000,
      silent: false,
      silentWake: false,
    });

    const delegates = consumePendingDelegates("test-session");
    expect(delegates).toHaveLength(1);
    expect(delegates[0].task).toBe("summarize the RFC");
    expect(delegates[0].delayMs).toBe(30000);
  });

  it("consumes removes delegates from store", () => {
    enqueuePendingDelegate("test-session", { task: "task 1" });

    const first = consumePendingDelegates("test-session");
    expect(first).toHaveLength(1);

    const second = consumePendingDelegates("test-session");
    expect(second).toEqual([]);
  });

  it("supports multiple delegates per session (multi-arrow fan-out)", () => {
    enqueuePendingDelegate("test-session", { task: "arrow 1", delayMs: 10000 });
    enqueuePendingDelegate("test-session", { task: "arrow 2", delayMs: 20000, silent: true });
    enqueuePendingDelegate("test-session", {
      task: "arrow 3",
      delayMs: 30000,
      silentWake: true,
    });

    const delegates = consumePendingDelegates("test-session");
    expect(delegates).toHaveLength(3);
    expect(delegates[0].task).toBe("arrow 1");
    expect(delegates[1].task).toBe("arrow 2");
    expect(delegates[1].silent).toBe(true);
    expect(delegates[2].task).toBe("arrow 3");
    expect(delegates[2].silentWake).toBe(true);
  });

  it("isolates delegates by session key", () => {
    enqueuePendingDelegate("test-session", { task: "session A task" });
    enqueuePendingDelegate("other-session", { task: "session B task" });

    const a = consumePendingDelegates("test-session");
    const b = consumePendingDelegates("other-session");

    expect(a).toHaveLength(1);
    expect(a[0].task).toBe("session A task");
    expect(b).toHaveLength(1);
    expect(b[0].task).toBe("session B task");
  });

  it("pendingDelegateCount reflects current queue depth", () => {
    expect(pendingDelegateCount("test-session")).toBe(0);

    enqueuePendingDelegate("test-session", { task: "task 1" });
    expect(pendingDelegateCount("test-session")).toBe(1);

    enqueuePendingDelegate("test-session", { task: "task 2" });
    expect(pendingDelegateCount("test-session")).toBe(2);

    consumePendingDelegates("test-session");
    expect(pendingDelegateCount("test-session")).toBe(0);
  });

  it("handles delegates with no optional fields", () => {
    enqueuePendingDelegate("test-session", { task: "minimal task" });

    const delegates = consumePendingDelegates("test-session");
    expect(delegates).toHaveLength(1);
    expect(delegates[0]).toEqual({ task: "minimal task" });
  });

  it("handles zero delay (immediate dispatch)", () => {
    enqueuePendingDelegate("test-session", { task: "immediate", delayMs: 0 });

    const delegates = consumePendingDelegates("test-session");
    expect(delegates[0].delayMs).toBe(0);
  });
});

describe("compaction-delegate-store", () => {
  beforeEach(() => {
    consumeCompactionDelegates("test-session");
    consumeCompactionDelegates("other-session");
  });

  it("returns empty array when no compaction delegates pending", () => {
    expect(consumeCompactionDelegates("test-session")).toEqual([]);
  });

  it("enqueues and consumes a compaction delegate", () => {
    enqueueCompactionDelegate("test-session", {
      task: "carry working state past compaction",
      silent: true,
      silentWake: true,
    });

    const delegates = consumeCompactionDelegates("test-session");
    expect(delegates).toHaveLength(1);
    expect(delegates[0].task).toBe("carry working state past compaction");
    expect(delegates[0].silentWake).toBe(true);
  });

  it("consumes removes compaction delegates from store", () => {
    enqueueCompactionDelegate("test-session", { task: "task 1" });

    const first = consumeCompactionDelegates("test-session");
    expect(first).toHaveLength(1);

    const second = consumeCompactionDelegates("test-session");
    expect(second).toEqual([]);
  });

  it("supports multiple compaction delegates per session", () => {
    enqueueCompactionDelegate("test-session", { task: "shard 1" });
    enqueueCompactionDelegate("test-session", { task: "shard 2" });
    enqueueCompactionDelegate("test-session", { task: "shard 3" });

    const delegates = consumeCompactionDelegates("test-session");
    expect(delegates).toHaveLength(3);
    expect(delegates.map((d) => d.task)).toEqual(["shard 1", "shard 2", "shard 3"]);
  });

  it("isolates compaction delegates by session key", () => {
    enqueueCompactionDelegate("test-session", { task: "session A" });
    enqueueCompactionDelegate("other-session", { task: "session B" });

    expect(consumeCompactionDelegates("test-session")).toHaveLength(1);
    expect(consumeCompactionDelegates("other-session")).toHaveLength(1);
  });

  it("compaction delegates are separate from immediate delegates", () => {
    enqueuePendingDelegate("test-session", { task: "immediate task" });
    enqueueCompactionDelegate("test-session", { task: "compaction task" });

    expect(pendingDelegateCount("test-session")).toBe(1);
    expect(compactionDelegateCount("test-session")).toBe(1);

    const immediate = consumePendingDelegates("test-session");
    expect(immediate).toHaveLength(1);
    expect(immediate[0].task).toBe("immediate task");

    const compaction = consumeCompactionDelegates("test-session");
    expect(compaction).toHaveLength(1);
    expect(compaction[0].task).toBe("compaction task");
  });

  it("compactionDelegateCount reflects current queue depth", () => {
    expect(compactionDelegateCount("test-session")).toBe(0);

    enqueueCompactionDelegate("test-session", { task: "task 1" });
    expect(compactionDelegateCount("test-session")).toBe(1);

    enqueueCompactionDelegate("test-session", { task: "task 2" });
    expect(compactionDelegateCount("test-session")).toBe(2);

    consumeCompactionDelegates("test-session");
    expect(compactionDelegateCount("test-session")).toBe(0);
  });
});
