import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContinuationCustodyTestState } from "../../auto-reply/continuation/custody/custody.test-support.js";
import { consumeStagedPostCompactionDelegates } from "../../auto-reply/continuation/delegate-store-post-compaction.js";
import { consumePendingDelegates } from "../../auto-reply/continuation/delegate-store.js";
import {
  resetContinueDelegateTurnAdmissionForTests,
  resetContinueDelegateTurnBudget,
} from "../../auto-reply/continuation/delegate-turn-admission.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import { createContinueDelegateTool } from "./continue-delegate-tool.js";

// One-shot override for the next durable delegate write; every other write
// reaches the real custody store.
const durableWrite = vi.hoisted(() => ({
  next: undefined as (() => Promise<never>) | undefined,
}));

vi.mock("../../auto-reply/continuation/delegate-store.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../auto-reply/continuation/delegate-store.js")>();
  return {
    ...actual,
    enqueuePendingDelegate: async (
      ...args: Parameters<typeof actual.enqueuePendingDelegate>
    ): ReturnType<typeof actual.enqueuePendingDelegate> => {
      const override = durableWrite.next;
      durableWrite.next = undefined;
      return override ? await override() : await actual.enqueuePendingDelegate(...args);
    },
  };
});

// maxDelegatesPerTurn admission under parallel tool batches: the slot is
// reserved before the durable write and released only within its own turn.
describe("continue_delegate per-turn admission", () => {
  useContinuationCustodyTestState();

  beforeEach(() => {
    durableWrite.next = undefined;
    resetContinueDelegateTurnAdmissionForTests();
    clearRuntimeConfigSnapshot();
  });

  afterEach(() => {
    resetContinueDelegateTurnAdmissionForTests();
    clearRuntimeConfigSnapshot();
  });

  async function executeTool(
    tool: ReturnType<typeof createContinueDelegateTool>,
    index: number,
    args: Record<string, unknown>,
  ) {
    return (await tool.execute(`call-${index}`, args))?.details as Record<string, unknown>;
  }

  it.each([
    ["queued", "normal", async () => await consumePendingDelegates("test-session")],
    [
      "queued-for-compaction",
      "post-compaction",
      async () => await consumeStagedPostCompactionDelegates("test-session"),
    ],
  ] as const)(
    "admits exactly maxDelegatesPerTurn parallel %s calls",
    async (_label, mode, readDurable) => {
      setRuntimeConfigSnapshot({
        agents: { defaults: { continuation: { maxDelegatesPerTurn: 2 } } },
      });
      // Agent-loop batches run tool calls in parallel, so every call checks the
      // cap before any durable write settles.
      const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });

      const results = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          executeTool(tool, index, { task: `parallel delegate ${index}`, mode }),
        ),
      );

      const admitted = results.filter((result) => result.status !== "rejected");
      const rejected = results.filter((result) => result.status === "rejected");
      expect(admitted).toHaveLength(2);
      expect(
        admitted.map((result) => Number(result.delegateIndex)).toSorted((a, b) => a - b),
      ).toEqual([1, 2]);
      expect(rejected).toHaveLength(3);
      for (const result of rejected) {
        expect(result).toMatchObject({
          guard: "maxDelegatesPerTurn",
          delegatesThisTurn: 2,
          limit: 2,
          reason: "would exceed maxDelegatesPerTurn cap (2/2 already scheduled this turn)",
        });
      }
      expect(await readDurable()).toHaveLength(2);
    },
  );

  it("releases a reserved per-turn slot when durable acceptance fails", async () => {
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 1 } } },
    });
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });
    durableWrite.next = async () => {
      throw new Error("durable write failed");
    };

    await expect(tool.execute("call-denied", { task: "not accepted" })).rejects.toThrow(
      "durable write failed",
    );

    await expect(executeTool(tool, 1, { task: "after failure" })).resolves.toMatchObject({
      status: "scheduled",
      delegateIndex: 1,
      delegatesThisTurn: 1,
    });
    expect(await consumePendingDelegates("test-session")).toEqual([
      expect.objectContaining({ task: "after failure" }),
    ]);
  });

  it("does not let a slot released after a turn reset free the next turn's budget", async () => {
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { maxDelegatesPerTurn: 1 } } },
    });
    let failWrite: (() => void) | undefined;
    let markWriteEntered: () => void = () => {};
    const writeEntered = new Promise<void>((resolve) => {
      markWriteEntered = resolve;
    });
    const tool = createContinueDelegateTool({ agentSessionKey: "test-session" });
    durableWrite.next = () =>
      new Promise<never>((_, reject) => {
        failWrite = () => reject(new Error("durable write failed"));
        markWriteEntered();
      });

    const stale = tool.execute("call-stale", { task: "previous-turn delegate" });
    await writeEntered;
    resetContinueDelegateTurnBudget("test-session");
    await expect(executeTool(tool, 1, { task: "next turn" })).resolves.toMatchObject({
      status: "scheduled",
      delegatesThisTurn: 1,
    });

    failWrite?.();
    await expect(stale).rejects.toThrow();
    await expect(executeTool(tool, 2, { task: "next turn overflow" })).resolves.toMatchObject({
      status: "rejected",
      delegatesThisTurn: 1,
      limit: 1,
    });
  });
});
