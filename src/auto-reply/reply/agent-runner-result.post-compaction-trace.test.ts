import { expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import { createReplyOperation } from "../../sessions/session-controller.js";
import { captureSessionTarget } from "../../sessions/session-controller.lifecycle.js";
import { createTestFinalizationContext } from "./agent-runner-result-accounting.persistence.test-support.js";
import { finalizeReplyAgentRun } from "./agent-runner-result.js";
import { createMockFollowupRun } from "./test-helpers.js";

const state = vi.hoisted(() => ({
  dispatchPostCompactionDelegates: vi.fn(),
  emitContinuationCompactionReleasedSpan: vi.fn(),
}));

// mock-isolation: Delegate release is recorded without the delivery queue or custody store.
vi.mock("./post-compaction-delegate-dispatch.js", () => ({
  dispatchPostCompactionDelegates: (params: unknown) =>
    state.dispatchPostCompactionDelegates(params),
}));

// mock-isolation: The released span is captured without the process-wide tracer.
vi.mock("../../infra/continuation-tracer.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../infra/continuation-tracer.js")>()),
  emitContinuationCompactionReleasedSpan: (params: unknown) =>
    state.emitContinuationCompactionReleasedSpan(params),
}));

const TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

it("hands the compaction traceparent to the foreground post-compaction release", async () => {
  const sessionKey = "agent:main:foreground-compaction-trace";
  const sessionId = "foreground-compaction-trace-session";
  state.dispatchPostCompactionDelegates.mockResolvedValue({ queuedDelegates: 1 });
  // The staged delegate carries no traceparent of its own, so the release context is the only source.
  const stagedEntry: SessionEntry = {
    sessionId,
    updatedAt: 1,
    pendingPostCompactionDelegates: [{ task: "resume after compaction", createdAt: 1 }],
  };
  const followupRun = createMockFollowupRun({ run: { sessionKey, sessionId } });
  const replyOperation = createReplyOperation({
    sessionKey,
    sessionId,
    resetTriggered: false,
    target: captureSessionTarget({
      storeScope: "/synthetic/foreground-compaction-trace",
      sessionKey,
      incarnation: sessionId,
      agentId: "main",
    }),
  });
  replyOperation.setPhase("running");
  const context = createTestFinalizationContext(followupRun, replyOperation);
  context.activeSessionEntry = stagedEntry;
  context.activeSessionStore = { [sessionKey]: stagedEntry };
  context.execution.autoCompactionCount = 1;
  context.execution.compactionTraceparent = TRACEPARENT;

  try {
    await finalizeReplyAgentRun(context);
  } finally {
    replyOperation.complete();
  }

  expect(state.dispatchPostCompactionDelegates).toHaveBeenCalledTimes(1);
  expect(state.dispatchPostCompactionDelegates).toHaveBeenCalledWith(
    expect.objectContaining({
      followupRun,
      releaseTraceparent: TRACEPARENT,
      sessionEntry: stagedEntry,
      sessionKey,
    }),
  );
  expect(state.emitContinuationCompactionReleasedSpan).toHaveBeenCalledWith(
    expect.objectContaining({ releasedCount: 1, traceparent: TRACEPARENT }),
  );
});
