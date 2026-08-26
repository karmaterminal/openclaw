import { afterEach, describe, expect, it, vi } from "vitest";
import {
  onInternalDiagnosticEvent,
  resetDiagnosticEventsForTest,
  waitForDiagnosticEventsDrained,
  type DiagnosticEventPayload,
} from "../infra/diagnostic-events.js";
import { wrapToolWithBeforeToolCallHook } from "./agent-tools.before-tool-call.wrapper.js";
import type { AnyAgentTool } from "./tools/common.js";

afterEach(() => {
  resetDiagnosticEventsForTest();
});

describe("before-tool-call observability context", () => {
  it("projects the run context onto typed-tool lifecycle events", async () => {
    const events: DiagnosticEventPayload[] = [];
    const stop = onInternalDiagnosticEvent((event, metadata) => {
      if (metadata.trusted && event.type.startsWith("tool.execution.")) {
        events.push(event);
      }
    });
    const diagnosticContext = {
      proof: {
        runId: "0123456789abcdef",
        rowId: "R-OBS-CONT-PROVENANCE",
        candidateSha: "a".repeat(40),
        harnessRef: "b".repeat(40),
      },
    } as const;
    const sourceTool = {
      name: "continue_work",
      label: "Continuation",
      description: "test",
      parameters: { type: "object", properties: {} },
      execute: vi.fn(async () => ({
        content: [{ type: "text" as const, text: "scheduled" }],
        details: {},
      })),
    } satisfies AnyAgentTool;
    const tool = wrapToolWithBeforeToolCallHook(sourceTool, {
      agentId: "main",
      sessionKey: "agent:main:main",
      sessionId: "session-observed",
      runId: "run-observed",
      diagnosticContext,
    });

    await tool.execute?.("call-observed", {});
    await waitForDiagnosticEventsDrained();
    stop();

    expect(events.map((event) => event.type)).toEqual([
      "tool.execution.started",
      "tool.execution.completed",
    ]);
    for (const event of events) {
      expect(event).toMatchObject({
        runId: "run-observed",
        sessionId: "session-observed",
      });
      expect(event.telemetry).toMatchObject({
        "openclaw.proof.run_id": diagnosticContext.proof.runId,
        "openclaw.proof.row_id": diagnosticContext.proof.rowId,
        "openclaw.proof.synthetic": true,
      });
    }
  });
});
