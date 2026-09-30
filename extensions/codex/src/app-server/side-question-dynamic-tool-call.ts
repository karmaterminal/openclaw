import {
  emitDynamicToolErrorDiagnostic,
  emitDynamicToolTerminalDiagnostic,
  startDynamicToolDiagnosticExecution,
} from "./dynamic-tool-diagnostics.js";
import { toCodexDynamicToolProtocolResponse } from "./dynamic-tool-execution.js";
import type { CodexDynamicToolRuntimeResponse } from "./dynamic-tool-response-state.js";
import type { CodexDynamicToolCallResponse } from "./protocol.js";
import { resolveCodexToolAbortTerminalReason } from "./tool-abort-terminal-reason.js";

/**
 * Runs one side-question dynamic tool call inside its own diagnostic trace child,
 * tracking the in-flight call until it settles and emitting its terminal diagnostic.
 */
export async function runCodexSideQuestionDynamicToolCall(params: {
  diagnosticContext: Parameters<typeof startDynamicToolDiagnosticExecution>[0];
  toolStartedAt: number;
  activeDynamicToolCalls: Set<Promise<unknown>>;
  signal: AbortSignal;
  execute: () => Promise<CodexDynamicToolRuntimeResponse>;
}): Promise<CodexDynamicToolCallResponse> {
  const { diagnosticContext, toolStartedAt, activeDynamicToolCalls, signal } = params;
  const { trace, execution: toolCall } = startDynamicToolDiagnosticExecution(
    diagnosticContext,
    params.execute,
  );
  activeDynamicToolCalls.add(toolCall);
  try {
    const response = await toolCall;
    emitDynamicToolTerminalDiagnostic({
      ...diagnosticContext,
      trace,
      response,
      durationMs: Math.max(0, Date.now() - toolStartedAt),
    });
    return toCodexDynamicToolProtocolResponse(response);
  } catch (error) {
    emitDynamicToolErrorDiagnostic({
      ...diagnosticContext,
      trace,
      durationMs: Math.max(0, Date.now() - toolStartedAt),
      terminalReason: signal.aborted ? resolveCodexToolAbortTerminalReason(signal) : "failed",
    });
    throw error;
  } finally {
    activeDynamicToolCalls.delete(toolCall);
  }
}
