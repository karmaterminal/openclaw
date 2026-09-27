// Background media generation trace-context tests cover continuation traceparent
// propagation from task admission into requester completion delivery.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions/types.js";
import {
  runWithDiagnosticTraceContext,
  type DiagnosticTraceContext,
} from "../../infra/diagnostic-trace-context.js";
import { resetGeneratedMediaTaskActivityForTests } from "../../tasks/task-runtime.test-helpers.js";

const subagentAnnounceDeliveryMocks = vi.hoisted(() => ({
  deliverSubagentAnnouncement: vi.fn(),
  loadRequesterSessionEntry: vi.fn<() => { entry: Partial<SessionEntry> | undefined }>(() => ({
    entry: undefined,
  })),
}));
const detachedTaskRuntimeMocks = vi.hoisted(() => ({
  completeTaskRunByRunId: vi.fn(),
  createRunningTaskRun: vi.fn(() => ({ taskId: "task-pinned-route" })),
  failTaskRunByRunId: vi.fn(),
  recordTaskRunProgressByRunId: vi.fn(),
}));
const taskRegistryDeliveryRuntimeMocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
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

vi.mock("../subagents/announce/subagent-announce-delivery.js", () => subagentAnnounceDeliveryMocks);
vi.mock("../../config/sessions/session-accessor.js", async () => ({
  ...(await vi.importActual<typeof import("../../config/sessions/session-accessor.js")>(
    "../../config/sessions/session-accessor.js",
  )),
  loadSessionEntry: sessionMocks.loadSessionEntry,
  loadSessionEntryReadOnly: sessionMocks.loadSessionEntry,
}));
vi.mock("../../tasks/detached-task-runtime.js", () => detachedTaskRuntimeMocks);
vi.mock("../../tasks/task-registry-delivery-runtime.js", () => taskRegistryDeliveryRuntimeMocks);
vi.mock("../../tasks/cron-run-continuation-cleanup.js", () => cronContinuationCleanupMocks);

import { createMediaGenerationTaskLifecycle } from "./media-generate-background-shared.js";

beforeEach(() => {
  resetGeneratedMediaTaskActivityForTests();
  subagentAnnounceDeliveryMocks.deliverSubagentAnnouncement.mockReset();
  subagentAnnounceDeliveryMocks.loadRequesterSessionEntry.mockReset();
  subagentAnnounceDeliveryMocks.loadRequesterSessionEntry.mockReturnValue({ entry: undefined });
  detachedTaskRuntimeMocks.createRunningTaskRun.mockClear();
  detachedTaskRuntimeMocks.completeTaskRunByRunId.mockClear();
  detachedTaskRuntimeMocks.failTaskRunByRunId.mockClear();
  detachedTaskRuntimeMocks.recordTaskRunProgressByRunId.mockClear();
  taskRegistryDeliveryRuntimeMocks.sendMessage.mockReset();
  cronContinuationCleanupMocks.removeCronRunContinuationSessionIfIdle.mockClear();
  sessionMocks.loadSessionEntry.mockReset().mockReturnValue(undefined);
});

function createImageMediaLifecycle() {
  return createMediaGenerationTaskLifecycle({
    toolName: "image_generate",
    taskKind: "image_generation",
    label: "Image generation",
    queuedProgressSummary: "Queued image generation",
    generatedLabel: "image",
    failureProgressSummary: "Image generation failed",
    eventSource: "image_generation",
    announceType: "image generation task",
    completionLabel: "image",
  });
}

describe("createMediaGenerationTaskLifecycle", () => {
  it("carries trusted continuation context from task admission into completion delivery", async () => {
    subagentAnnounceDeliveryMocks.deliverSubagentAnnouncement.mockResolvedValueOnce({
      delivered: true,
    });
    const lifecycle = createImageMediaLifecycle();
    const handle = runWithDiagnosticTraceContext(ACTIVE_TRACE_CONTEXT, () =>
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

  it("keeps the stable ancestor traceparent when the active scope has a parent span", () => {
    const lifecycle = createImageMediaLifecycle();

    const handle = runWithDiagnosticTraceContext(
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
