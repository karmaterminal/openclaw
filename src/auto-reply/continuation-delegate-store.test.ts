import { afterEach, describe, expect, it } from "vitest";
import {
  clearAllPendingDelegates,
  clearAllPostCompactionDelegates,
  clearPendingDelegates,
  consumePendingDelegates,
  consumePostCompactionDelegates,
  enqueuePendingDelegate,
  getPendingDelegateCount,
  getStagedPostCompactionCount,
  getTotalPendingDelegateCount,
  peekPendingDelegates,
  stagePostCompactionDelegate,
} from "./continuation-delegate-store.js";

describe("continuation-delegate-store", () => {
  afterEach(() => {
    clearAllPendingDelegates();
    clearAllPostCompactionDelegates();
  });

  const SESSION_A = "agent:main:test:a";
  const SESSION_B = "agent:main:test:b";

  function makeDelegate(task: string) {
    return {
      task,
      delayMs: 15_000,
      mode: "normal" as const,
      chainHop: 0,
      enqueuedAt: Date.now(),
    };
  }

  it("enqueues and consumes delegates", () => {
    enqueuePendingDelegate(SESSION_A, makeDelegate("task 1"));
    enqueuePendingDelegate(SESSION_A, makeDelegate("task 2"));

    expect(getPendingDelegateCount(SESSION_A)).toBe(2);

    const consumed = consumePendingDelegates(SESSION_A);
    expect(consumed).toHaveLength(2);
    expect(consumed[0].task).toBe("task 1");
    expect(consumed[1].task).toBe("task 2");

    // Store should be empty after consume
    expect(getPendingDelegateCount(SESSION_A)).toBe(0);
    expect(consumePendingDelegates(SESSION_A)).toHaveLength(0);
  });

  it("isolates delegates by session key", () => {
    enqueuePendingDelegate(SESSION_A, makeDelegate("task A"));
    enqueuePendingDelegate(SESSION_B, makeDelegate("task B"));

    expect(getPendingDelegateCount(SESSION_A)).toBe(1);
    expect(getPendingDelegateCount(SESSION_B)).toBe(1);
    expect(getTotalPendingDelegateCount()).toBe(2);

    const consumedA = consumePendingDelegates(SESSION_A);
    expect(consumedA).toHaveLength(1);
    expect(consumedA[0].task).toBe("task A");

    // B is untouched
    expect(getPendingDelegateCount(SESSION_B)).toBe(1);
  });

  it("peek does not drain the store", () => {
    enqueuePendingDelegate(SESSION_A, makeDelegate("peek test"));

    const peeked = peekPendingDelegates(SESSION_A);
    expect(peeked).toHaveLength(1);
    expect(peeked[0].task).toBe("peek test");

    // Still there
    expect(getPendingDelegateCount(SESSION_A)).toBe(1);
  });

  it("clearPendingDelegates removes only the targeted session", () => {
    enqueuePendingDelegate(SESSION_A, makeDelegate("clear A"));
    enqueuePendingDelegate(SESSION_B, makeDelegate("keep B"));

    clearPendingDelegates(SESSION_A);

    expect(getPendingDelegateCount(SESSION_A)).toBe(0);
    expect(getPendingDelegateCount(SESSION_B)).toBe(1);
  });

  it("clearAllPendingDelegates empties the entire store", () => {
    enqueuePendingDelegate(SESSION_A, makeDelegate("a"));
    enqueuePendingDelegate(SESSION_B, makeDelegate("b"));

    clearAllPendingDelegates();

    expect(getTotalPendingDelegateCount()).toBe(0);
  });

  it("returns the count after enqueue", () => {
    const count1 = enqueuePendingDelegate(SESSION_A, makeDelegate("one"));
    const count2 = enqueuePendingDelegate(SESSION_A, makeDelegate("two"));
    const count3 = enqueuePendingDelegate(SESSION_A, makeDelegate("three"));

    expect(count1).toBe(1);
    expect(count2).toBe(2);
    expect(count3).toBe(3);
  });

  it("returns empty array for unknown session", () => {
    expect(consumePendingDelegates("unknown:session")).toHaveLength(0);
    expect(peekPendingDelegates("unknown:session")).toHaveLength(0);
    expect(getPendingDelegateCount("unknown:session")).toBe(0);
  });

  it("preserves delegate metadata", () => {
    const delegate = {
      task: "check CI",
      delayMs: 60_000,
      mode: "silent-wake" as const,
      chainHop: 3,
      enqueuedAt: 1700000000000,
    };
    enqueuePendingDelegate(SESSION_A, delegate);

    const consumed = consumePendingDelegates(SESSION_A);
    expect(consumed[0]).toEqual(delegate);
  });
});

describe("post-compaction delegate staging", () => {
  afterEach(() => {
    clearAllPostCompactionDelegates();
  });

  const SESSION = "agent:main:test:compaction";

  function makeCompactionDelegate(task: string) {
    return {
      task,
      delayMs: 0,
      mode: "post-compaction" as const,
      chainHop: 0,
      enqueuedAt: Date.now(),
    };
  }

  it("stages and consumes post-compaction delegates", () => {
    stagePostCompactionDelegate(SESSION, makeCompactionDelegate("evacuate state"));
    stagePostCompactionDelegate(SESSION, makeCompactionDelegate("resume work"));

    expect(getStagedPostCompactionCount(SESSION)).toBe(2);

    const consumed = consumePostCompactionDelegates(SESSION);
    expect(consumed).toHaveLength(2);
    expect(consumed[0].task).toBe("evacuate state");
    expect(consumed[1].task).toBe("resume work");

    // Consumed — count should be 0
    expect(getStagedPostCompactionCount(SESSION)).toBe(0);
  });

  it("returns empty array for session with no staged delegates", () => {
    expect(consumePostCompactionDelegates("no:such:session")).toHaveLength(0);
    expect(getStagedPostCompactionCount("no:such:session")).toBe(0);
  });

  it("returns staging count", () => {
    const count1 = stagePostCompactionDelegate(SESSION, makeCompactionDelegate("a"));
    const count2 = stagePostCompactionDelegate(SESSION, makeCompactionDelegate("b"));

    expect(count1).toBe(1);
    expect(count2).toBe(2);
  });

  it("isolates staged delegates by session", () => {
    const SESSION_X = "agent:main:test:x";
    const SESSION_Y = "agent:main:test:y";

    stagePostCompactionDelegate(SESSION_X, makeCompactionDelegate("x-work"));
    stagePostCompactionDelegate(SESSION_Y, makeCompactionDelegate("y-work"));

    const consumedX = consumePostCompactionDelegates(SESSION_X);
    expect(consumedX).toHaveLength(1);
    expect(consumedX[0].task).toBe("x-work");

    // Y untouched
    expect(getStagedPostCompactionCount(SESSION_Y)).toBe(1);
  });

  it("clearAllPostCompactionDelegates empties all sessions", () => {
    stagePostCompactionDelegate(SESSION, makeCompactionDelegate("a"));
    stagePostCompactionDelegate("other:session", makeCompactionDelegate("b"));

    clearAllPostCompactionDelegates();

    expect(getStagedPostCompactionCount(SESSION)).toBe(0);
    expect(getStagedPostCompactionCount("other:session")).toBe(0);
  });
});
