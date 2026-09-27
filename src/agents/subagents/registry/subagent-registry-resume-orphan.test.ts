import { expect, it, vi } from "vitest";
import { createSubagentRunRecord } from "../../subagent-test-fixtures.test-helpers.js";
import { handleOrphanedSubagentResume } from "./subagent-registry-resume-orphan.js";

function createHarness(params?: { terminal?: boolean; retainedRequiredDelivery?: boolean }) {
  const now = Date.now();
  const retainedRequiredDelivery = params?.retainedRequiredDelivery === true;
  const entry = createSubagentRunRecord({
    runId: "run-orphan",
    childSessionKey: "agent:main:subagent:orphan",
    task: "finish orphan ownership",
    cleanup: "keep",
    expectsCompletionMessage: retainedRequiredDelivery,
    completion: { required: retainedRequiredDelivery },
    delivery: retainedRequiredDelivery
      ? {
          status: "pending",
          payload: {
            requesterSessionKey: "agent:main:main",
            requesterDisplayKey: "main",
            childSessionKey: "agent:main:subagent:orphan",
            childRunId: "run-orphan",
            task: "finish orphan ownership",
          },
        }
      : { status: "not_required" },
    createdAt: now - 100,
    startedAt: now - 50,
    ...(params?.terminal ? { endedAt: now } : {}),
  });
  const complete = vi.fn(async () => {});
  const handled = handleOrphanedSubagentResume({
    runId: entry.runId,
    entry,
    source: "restore",
    complete,
    warn: vi.fn(),
  });
  return { complete, entry, handled };
}

it("completes a running quiet orphan instead of pruning its ownership", async () => {
  const harness = createHarness();

  expect(harness.handled).toBe(true);
  await vi.waitFor(() =>
    expect(harness.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: harness.entry.runId,
        endedAt: expect.any(Number),
        outcome: {
          status: "error",
          error: "subagent run orphaned: missing-session-entry",
        },
      }),
      "orphan-resume",
    ),
  );
});

it("settles a partially terminal orphan through canonical completion", async () => {
  const harness = createHarness({ terminal: true });

  expect(harness.handled).toBe(true);
  await vi.waitFor(() => expect(harness.complete).toHaveBeenCalledOnce());
  expect(harness.complete).toHaveBeenCalledWith(
    expect.objectContaining({ endedAt: harness.entry.execution.endedAt }),
    "orphan-resume",
  );
});

it("preserves a retained required completion delivery after its child session is gone", () => {
  const harness = createHarness({ terminal: true, retainedRequiredDelivery: true });

  expect(harness.handled).toBe(false);
  expect(harness.complete).not.toHaveBeenCalled();
});
