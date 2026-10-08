import {
  createDiagnosticTraceContextFromActiveScope,
  emitTrustedDiagnosticEvent,
  freezeDiagnosticTraceContext,
  runWithDiagnosticTraceContext,
  type DiagnosticTraceContext,
} from "openclaw/plugin-sdk/diagnostic-runtime";
import type { CodexDynamicToolRuntimeResponse } from "./dynamic-tool-response-state.js";
import type { CodexDynamicToolCallParams } from "./protocol.js";

type DynamicToolDiagnosticContext = {
  call: CodexDynamicToolCallParams;
  agentId?: string | undefined;
  runId?: string | undefined;
  sessionId?: string | undefined;
  sessionKey?: string | undefined;
  trace?: DiagnosticTraceContext | undefined;
};

function diagnosticToolIdentity(params: DynamicToolDiagnosticContext) {
  return {
    agentId: params.agentId,
    runId: params.runId,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    trace: params.trace,
    toolName: params.call.tool,
    toolCallId: params.call.callId,
  };
}

export function createCodexDynamicToolDiagnostics(params: DynamicToolDiagnosticContext) {
  // A started execution's trace child is shared by its terminal events.
  let trace = params.trace;
  const identity = () => diagnosticToolIdentity({ ...params, trace });
  const started = () => {
    emitTrustedDiagnosticEvent({
      type: "tool.execution.started",
      ...identity(),
    });
  };
  const error = (
    durationMs: number,
    terminalReason: "failed" | "cancelled" | "timed_out" = "failed",
  ) => {
    emitTrustedDiagnosticEvent({
      type: "tool.execution.error",
      ...identity(),
      durationMs,
      errorCategory: "codex_dynamic_tool_error",
      terminalReason,
    });
  };
  return {
    started,
    /** Starts one diagnostic child and installs it around the dynamic handler. */
    startExecution<T>(execute: () => T) {
      trace = freezeDiagnosticTraceContext(createDiagnosticTraceContextFromActiveScope());
      started();
      return { trace, execution: runWithDiagnosticTraceContext(trace, execute) };
    },
    error,
    terminal(response: CodexDynamicToolRuntimeResponse, durationMs: number) {
      const type = response.diagnosticTerminalType ?? (response.success ? "completed" : "error");
      if (type === "completed") {
        emitTrustedDiagnosticEvent({
          type: "tool.execution.completed",
          ...identity(),
          durationMs,
        });
      } else if (type === "blocked") {
        emitTrustedDiagnosticEvent({
          type: "tool.execution.blocked",
          ...identity(),
          deniedReason: "plugin-before-tool-call",
          reason: "Tool call blocked",
        });
      } else {
        error(durationMs, response.diagnosticTerminalReason ?? "failed");
      }
    },
  };
}
