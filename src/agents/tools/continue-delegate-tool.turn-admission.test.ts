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

// maxDelegatesPerTurn admission under parallel tool batches: the slot is
// reserved before the durable write and released only within its own turn.
describe("continue_delegate per-turn admission", () => {
  useContinuationCustodyTestState();

  beforeEach(() => {
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
      agents: {
        defaults: { continuation: { maxDelegatesPerTurn: 1, crossSessionTargeting: "enabled" } },
      },
    });
    const tool = createContinueDelegateTool({
      agentSessionKey: "test-session",
      prepareArtifactPolicy: vi.fn(async () => {
        throw new Error("policy denied");
      }),
    });

    await expect(
      tool.execute("call-denied", {
        task: "managed report return",
        targetSessionKey: "agent:main:target",
        returnOptions: { artifacts: "required" },
        recipientContext: { purpose: "Compare results." },
      }),
    ).rejects.toThrow("artifact-capable continuation dispatch could not be authorized.");

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
    let failPolicy: (() => void) | undefined;
    let markPolicyEntered: () => void = () => {};
    const policyEntered = new Promise<void>((resolve) => {
      markPolicyEntered = resolve;
    });
    const tool = createContinueDelegateTool({
      agentSessionKey: "test-session",
      prepareArtifactPolicy: vi.fn(
        () =>
          new Promise<void>((_, reject) => {
            failPolicy = () => reject(new Error("policy denied"));
            markPolicyEntered();
          }),
      ),
    });

    const stale = tool.execute("call-stale", {
      task: "previous-turn managed return",
      returnOptions: { artifacts: "optional" },
    });
    await policyEntered;
    resetContinueDelegateTurnBudget("test-session");
    await expect(executeTool(tool, 1, { task: "next turn" })).resolves.toMatchObject({
      status: "scheduled",
      delegatesThisTurn: 1,
    });

    failPolicy?.();
    await expect(stale).rejects.toThrow();
    await expect(executeTool(tool, 2, { task: "next turn overflow" })).resolves.toMatchObject({
      status: "rejected",
      delegatesThisTurn: 1,
      limit: 1,
    });
  });
});
