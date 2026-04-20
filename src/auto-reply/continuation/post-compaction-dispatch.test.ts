// SPDX-License-Identifier: AGPL-3.0
//
// Regression cover for karmaterminal/openclaw#203:
// post-compaction delegate dispatcher must surface spawn failures via a named
// log anchor + a system event. Silent catches are forbidden — the bug class
// fixed in the #639 arc still lived here until #203.

import { describe, expect, it, vi } from "vitest";
import {
  dispatchPostCompactionDelegates,
  type PostCompactionSpawnContext,
} from "./post-compaction-dispatch.js";
import type { PendingContinuationDelegate } from "./types.js";

type LogFn = (message: string, meta?: Record<string, unknown>) => void;

function makeLog(): {
  info: ReturnType<typeof vi.fn<LogFn>>;
  warn: ReturnType<typeof vi.fn<LogFn>>;
} {
  return {
    info: vi.fn<LogFn>(),
    warn: vi.fn<LogFn>(),
  };
}

const SPAWN_CTX: PostCompactionSpawnContext = {
  agentSessionKey: "test-session",
  agentChannel: "test-channel",
};

const DELEGATE: PendingContinuationDelegate = {
  task: "do the post-compaction follow-up",
  mode: "post-compaction",
  silent: true,
  silentWake: true,
  postCompaction: true,
};

describe("dispatchPostCompactionDelegates", () => {
  it("counts a successful spawn", async () => {
    const log = makeLog();
    const enqueueSystemEvent = vi.fn();
    const spawnFn = vi.fn().mockResolvedValue({ status: "spawned" });

    const result = await dispatchPostCompactionDelegates({
      sessionKey: "test-session",
      delegates: [DELEGATE],
      spawnContext: SPAWN_CTX,
      spawnFn,
      log,
      enqueueSystemEvent,
    });

    expect(result).toEqual({ attempted: 1, spawned: 1, failed: 0 });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(spawnFn).toHaveBeenCalledWith(
      {
        task: DELEGATE.task,
        silentAnnounce: true,
        wakeOnReturn: true,
        drainsContinuationDelegateQueue: true,
      },
      SPAWN_CTX,
    );
    expect(log.warn).not.toHaveBeenCalled();
    expect(enqueueSystemEvent).not.toHaveBeenCalled();
  });

  it("emits a named log anchor + system event on spawn failure (regression cover #203)", async () => {
    const log = makeLog();
    const enqueueSystemEvent = vi.fn();
    const spawnFn = vi.fn().mockRejectedValue(new Error("subagent registry full"));

    const result = await dispatchPostCompactionDelegates({
      sessionKey: "test-session",
      delegates: [DELEGATE],
      spawnContext: SPAWN_CTX,
      spawnFn,
      log,
      enqueueSystemEvent,
    });

    expect(result).toEqual({ attempted: 1, spawned: 0, failed: 1 });
    expect(log.warn).toHaveBeenCalledTimes(1);
    const warnArg = log.warn.mock.calls[0][0];
    expect(warnArg).toContain("[continuation:post-compaction-spawn-failed]");
    expect(warnArg).toContain("error=subagent registry full");
    expect(warnArg).toContain("session=test-session");
    expect(warnArg).toContain("task=do the post-compaction follow-up");

    expect(enqueueSystemEvent).toHaveBeenCalledTimes(1);
    const [eventText, eventMeta] = enqueueSystemEvent.mock.calls[0];
    expect(eventText).toContain("[continuation] Post-compaction delegate spawn failed");
    expect(eventText).toContain("subagent registry full");
    expect(eventText).toContain(DELEGATE.task);
    expect(eventMeta).toEqual({ sessionKey: "test-session" });
  });

  it("isolates failures per-delegate (one failure does not abort the loop)", async () => {
    const log = makeLog();
    const enqueueSystemEvent = vi.fn();
    const spawnFn = vi
      .fn()
      .mockResolvedValueOnce({ status: "spawned" })
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ status: "spawned" });

    const delegates: PendingContinuationDelegate[] = [
      { ...DELEGATE, task: "first" },
      { ...DELEGATE, task: "second" },
      { ...DELEGATE, task: "third" },
    ];

    const result = await dispatchPostCompactionDelegates({
      sessionKey: "test-session",
      delegates,
      spawnContext: SPAWN_CTX,
      spawnFn,
      log,
      enqueueSystemEvent,
    });

    expect(result).toEqual({ attempted: 3, spawned: 2, failed: 1 });
    expect(spawnFn).toHaveBeenCalledTimes(3);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(enqueueSystemEvent).toHaveBeenCalledTimes(1);
  });

  it("handles non-Error throwables (string, undefined) without crashing", async () => {
    const log = makeLog();
    const enqueueSystemEvent = vi.fn();
    const spawnFn = vi.fn().mockRejectedValue("string-rejection");

    const result = await dispatchPostCompactionDelegates({
      sessionKey: "test-session",
      delegates: [DELEGATE],
      spawnContext: SPAWN_CTX,
      spawnFn,
      log,
      enqueueSystemEvent,
    });

    expect(result.failed).toBe(1);
    const warnArg = log.warn.mock.calls[0][0];
    expect(warnArg).toContain("error=string-rejection");
  });

  it("returns zero counters for an empty delegate list", async () => {
    const log = makeLog();
    const enqueueSystemEvent = vi.fn();
    const spawnFn = vi.fn();

    const result = await dispatchPostCompactionDelegates({
      sessionKey: "test-session",
      delegates: [],
      spawnContext: SPAWN_CTX,
      spawnFn,
      log,
      enqueueSystemEvent,
    });

    expect(result).toEqual({ attempted: 0, spawned: 0, failed: 0 });
    expect(spawnFn).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
    expect(enqueueSystemEvent).not.toHaveBeenCalled();
  });
});
