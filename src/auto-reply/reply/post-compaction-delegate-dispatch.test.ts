import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnSubagentDirectMock = vi.hoisted(() => vi.fn());
const enqueueSystemEventMock = vi.hoisted(() => vi.fn());
const runtimeLogMock = vi.hoisted(() => vi.fn());

vi.mock("../../agents/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEvent: (...args: unknown[]) => enqueueSystemEventMock(...args),
}));

vi.mock("../../runtime.js", () => ({
  defaultRuntime: {
    log: (...args: unknown[]) => runtimeLogMock(...args),
    error: vi.fn(),
    exit: vi.fn(),
  },
}));

import {
  dispatchPostCompactionDelegate,
  evaluatePostCompactionChainBudget,
} from "./post-compaction-delegate-dispatch.js";

describe("evaluatePostCompactionChainBudget", () => {
  it("allows when chain count is below max and tokens are within cap", () => {
    expect(
      evaluatePostCompactionChainBudget({
        currentChainCount: 2,
        maxChainLength: 10,
        chainTokens: 1_000,
        costCapTokens: 500_000,
      }),
    ).toEqual({ allow: true });
  });

  it("rejects on chain length when count meets max", () => {
    expect(
      evaluatePostCompactionChainBudget({
        currentChainCount: 10,
        maxChainLength: 10,
        chainTokens: 0,
        costCapTokens: 500_000,
      }),
    ).toEqual({ allow: false, reason: "chain-length" });
  });

  it("rejects on cost cap when tokens exceed cap", () => {
    expect(
      evaluatePostCompactionChainBudget({
        currentChainCount: 0,
        maxChainLength: 10,
        chainTokens: 600_000,
        costCapTokens: 500_000,
      }),
    ).toEqual({ allow: false, reason: "cost-cap" });
  });

  it("treats costCapTokens=0 as disabled (no cost-cap rejection)", () => {
    expect(
      evaluatePostCompactionChainBudget({
        currentChainCount: 0,
        maxChainLength: 10,
        chainTokens: 9_000_000,
        costCapTokens: 0,
      }),
    ).toEqual({ allow: true });
  });

  it("prefers chain-length rejection over cost-cap when both apply", () => {
    expect(
      evaluatePostCompactionChainBudget({
        currentChainCount: 10,
        maxChainLength: 10,
        chainTokens: 9_000_000,
        costCapTokens: 500_000,
      }),
    ).toEqual({ allow: false, reason: "chain-length" });
  });
});

describe("dispatchPostCompactionDelegate", () => {
  beforeEach(() => {
    spawnSubagentDirectMock.mockReset();
    enqueueSystemEventMock.mockReset();
    runtimeLogMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const baseDelegate = {
    task: "carry working state",
    createdAt: 1,
    silent: true,
    silentWake: true,
  };
  const baseOriginating = {
    channel: "telegram",
    accountId: "acct-1",
    to: "+15555550100",
    threadId: "thread-1",
  };

  it("dispatches when budget allows and reports next chain count", async () => {
    spawnSubagentDirectMock.mockResolvedValue({
      status: "accepted",
      childSessionKey: "agent:child",
    });

    const outcome = await dispatchPostCompactionDelegate({
      delegate: baseDelegate,
      sessionKey: "agent:main",
      currentChainCount: 1,
      maxChainLength: 10,
      chainTokens: 100,
      costCapTokens: 500_000,
      originatingContext: baseOriginating,
    });

    expect(outcome).toEqual({
      kind: "dispatched",
      nextChainCount: 2,
      childSessionKey: "agent:child",
    });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    const [spawnParams, spawnCtx] = spawnSubagentDirectMock.mock.calls[0];
    expect(spawnParams.task).toContain("[continuation:post-compaction]");
    expect(spawnParams.task).toContain("[continuation:chain-hop:2]");
    expect(spawnParams.task).toContain("carry working state");
    expect(spawnParams.silentAnnounce).toBe(true);
    expect(spawnParams.wakeOnReturn).toBe(true);
    expect(spawnParams.drainsContinuationDelegateQueue).toBe(true);
    expect(spawnCtx).toEqual({
      agentSessionKey: "agent:main",
      agentChannel: "telegram",
      agentAccountId: "acct-1",
      agentTo: "+15555550100",
      agentThreadId: "thread-1",
    });
    const enqueuedEvents = enqueueSystemEventMock.mock.calls.map((c) => c[0]);
    expect(
      enqueuedEvents.some((m) => m.startsWith("[continuation:compaction-delegate-spawned]")),
    ).toBe(true);
  });

  it("rejects on chain-length without spawning", async () => {
    const outcome = await dispatchPostCompactionDelegate({
      delegate: baseDelegate,
      sessionKey: "agent:main",
      currentChainCount: 10,
      maxChainLength: 10,
      chainTokens: 100,
      costCapTokens: 500_000,
      originatingContext: baseOriginating,
    });

    expect(outcome).toEqual({ kind: "rejected-chain-length" });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    const enqueuedEvents = enqueueSystemEventMock.mock.calls.map((c) => c[0]);
    expect(enqueuedEvents).toHaveLength(1);
    expect(enqueuedEvents[0]).toContain("chain length 10 reached");
    expect(enqueuedEvents[0]).toContain("carry working state");
  });

  it("rejects on cost-cap without spawning", async () => {
    const outcome = await dispatchPostCompactionDelegate({
      delegate: baseDelegate,
      sessionKey: "agent:main",
      currentChainCount: 1,
      maxChainLength: 10,
      chainTokens: 600_000,
      costCapTokens: 500_000,
      originatingContext: baseOriginating,
    });

    expect(outcome).toEqual({ kind: "rejected-cost-cap" });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    const enqueuedEvents = enqueueSystemEventMock.mock.calls.map((c) => c[0]);
    expect(enqueuedEvents).toHaveLength(1);
    expect(enqueuedEvents[0]).toContain("cost cap exceeded (600000 > 500000)");
  });

  it("returns rejected-spawn with reStage=true when spawn does not accept", async () => {
    spawnSubagentDirectMock.mockResolvedValue({ status: "forbidden" });

    const outcome = await dispatchPostCompactionDelegate({
      delegate: baseDelegate,
      sessionKey: "agent:main",
      currentChainCount: 1,
      maxChainLength: 10,
      chainTokens: 100,
      costCapTokens: 500_000,
      originatingContext: baseOriginating,
    });

    expect(outcome).toEqual({ kind: "rejected-spawn", status: "forbidden", reStage: true });
    expect(
      enqueueSystemEventMock.mock.calls.some((c) =>
        String(c[0]).startsWith("[continuation:compaction-delegate-spawned]"),
      ),
    ).toBe(false);
  });

  it("returns error with reStage=true when spawn throws", async () => {
    const boom = new Error("spawn boom");
    spawnSubagentDirectMock.mockRejectedValue(boom);

    const outcome = await dispatchPostCompactionDelegate({
      delegate: baseDelegate,
      sessionKey: "agent:main",
      currentChainCount: 1,
      maxChainLength: 10,
      chainTokens: 100,
      costCapTokens: 500_000,
      originatingContext: baseOriginating,
    });

    expect(outcome).toEqual({ kind: "error", error: boom, reStage: true });
  });

  it("derives silentAnnounce/wakeOnReturn from delegate flags (legacy default = true)", async () => {
    spawnSubagentDirectMock.mockResolvedValue({ status: "accepted" });

    await dispatchPostCompactionDelegate({
      delegate: { task: "legacy", createdAt: 1 },
      sessionKey: "agent:main",
      currentChainCount: 0,
      maxChainLength: 10,
      chainTokens: 0,
      costCapTokens: 500_000,
      originatingContext: baseOriginating,
    });

    const [spawnParams] = spawnSubagentDirectMock.mock.calls[0];
    expect(spawnParams.silentAnnounce).toBe(true);
    expect(spawnParams.wakeOnReturn).toBe(true);
  });

  it("omits silentAnnounce when delegate is non-silent", async () => {
    spawnSubagentDirectMock.mockResolvedValue({ status: "accepted" });

    await dispatchPostCompactionDelegate({
      delegate: { task: "loud", createdAt: 1, silent: false, silentWake: false },
      sessionKey: "agent:main",
      currentChainCount: 0,
      maxChainLength: 10,
      chainTokens: 0,
      costCapTokens: 500_000,
      originatingContext: baseOriginating,
    });

    const [spawnParams] = spawnSubagentDirectMock.mock.calls[0];
    expect(spawnParams.silentAnnounce).toBeUndefined();
    expect(spawnParams.wakeOnReturn).toBeUndefined();
  });
});
