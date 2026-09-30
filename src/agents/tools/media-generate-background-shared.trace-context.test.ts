// Background media generation trace-context tests cover continuation traceparent
// propagation from task admission into requester completion delivery.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions/types.js";
import {
  runWithDiagnosticTraceContext,
  type DiagnosticTraceContext,
} from "../../infra/diagnostic-trace-context.js";
import { resetGeneratedMediaTaskActivityForTests } from "../media-generation-activity.test-support.js";

const subagentAnnounceDeliveryMocks = vi.hoisted(() => ({
  deliverSubagentAnnouncement: vi.fn(),
}));
const cronContinuationCleanupMocks = vi.hoisted(() => ({
  removeCronRunContinuationSessionIfIdle: vi.fn(async () => {}),
}));
const sessionMocks = vi.hoisted(() => ({
  loadSessionEntry: vi.fn<() => SessionEntry | undefined>(() => undefined),
}));
const ACTIVE_TRACE_CONTEXT: DiagnosticTraceContext = {
  traceId: "0af7651916cd43dd8448eb211c80319c",
  spanId: "b7ad6b7169203331",
  traceFlags: "01",
};
const ACTIVE_TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

// Upstream removed the Tasks runtime (6652f7eac8); media admission now records its
// own operation and reads the requester through the session worker.
vi.mock("../subagents/announce/subagent-announce-delivery.js", () => subagentAnnounceDeliveryMocks);
vi.mock("../../config/sessions/session-entry-read-runtime.js", () => ({
  withSessionEntryReadOnlyInWorker: async (
    _scope: unknown,
    assertCurrent: () => void,
    consume: (read: { ok: true; value: SessionEntry | undefined }) => Promise<unknown>,
  ) => {
    assertCurrent();
    return consume({ ok: true, value: sessionMocks.loadSessionEntry() });
  },
}));
vi.mock("../../cron/run-continuation-cleanup.js", () => cronContinuationCleanupMocks);

import { createMediaGenerationTaskLifecycle } from "./media-generate-background-shared.js";

beforeEach(() => {
  resetGeneratedMediaTaskActivityForTests();
  subagentAnnounceDeliveryMocks.deliverSubagentAnnouncement.mockReset();
  cronContinuationCleanupMocks.removeCronRunContinuationSessionIfIdle.mockClear();
  // Completion delivery binds to the requester session admitted with the task.
  sessionMocks.loadSessionEntry
    .mockReset()
    .mockReturnValue({ sessionId: "media-requester", updatedAt: 1 });
});

function createImageMediaLifecycle() {
  return createMediaGenerationTaskLifecycle("image");
}

describe("createMediaGenerationTaskLifecycle", () => {
  it("carries trusted continuation context from task admission into completion delivery", async () => {
    subagentAnnounceDeliveryMocks.deliverSubagentAnnouncement.mockResolvedValueOnce({
      delivered: true,
    });
    const lifecycle = createImageMediaLifecycle();
    const handle = await runWithDiagnosticTraceContext(ACTIVE_TRACE_CONTEXT, () =>
      lifecycle.createTaskRun({
        sessionKey: "agent:main:discord:channel:123",
        prompt: "traced proof image",
      }),
    );

    await lifecycle.wakeTaskCompletion({
      handle,
      status: "ok",
      statusLabel: "completed successfully",
      result: "generated",
    });

    expect(subagentAnnounceDeliveryMocks.deliverSubagentAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({
        continuationTriggerOverride: "work-wake",
        traceparent: ACTIVE_TRACEPARENT,
      }),
    );
  });

  it("keeps the stable ancestor traceparent when the active scope has a parent span", async () => {
    const lifecycle = createImageMediaLifecycle();

    const handle = await runWithDiagnosticTraceContext(
      {
        ...ACTIVE_TRACE_CONTEXT,
        spanId: "2222222222222222",
        parentSpanId: ACTIVE_TRACE_CONTEXT.spanId,
      },
      () =>
        lifecycle.createTaskRun({
          sessionKey: "agent:main:discord:channel:123",
          prompt: "ancestor-anchored proof image",
        }),
    );

    expect(handle?.traceparent).toBe(ACTIVE_TRACEPARENT);
  });
});
