import {
  emitDynamicToolErrorDiagnostic,
  emitDynamicToolStartedDiagnostic,
  emitDynamicToolTerminalDiagnostic,
} from "./dynamic-tool-diagnostics.js";
import { toCodexDynamicToolProtocolResponse } from "./dynamic-tool-execution.js";
import type { CodexDynamicToolRuntimeResponse } from "./dynamic-tool-response-state.js";
import type { CodexDynamicToolCallResponse } from "./protocol.js";
import { resolveCodexToolAbortTerminalReason } from "./tool-abort-terminal-reason.js";

/**
 * Runs one side-question dynamic tool call, tracking it until it settles and
 * emitting its started and terminal diagnostics.
 */
export async function runCodexSideQuestionDynamicToolCall(params: {
  diagnosticContext: Parameters<typeof emitDynamicToolStartedDiagnostic>[0];
  toolStartedAt: number;
  activeDynamicToolCalls: Set<Promise<unknown>>;
  signal: AbortSignal;
  execute: () => Promise<CodexDynamicToolRuntimeResponse>;
}): Promise<CodexDynamicToolCallResponse> {
  const { diagnosticContext, toolStartedAt, activeDynamicToolCalls, signal } = params;
  emitDynamicToolStartedDiagnostic(diagnosticContext);
  const toolCall = params.execute();
  activeDynamicToolCalls.add(toolCall);
  try {
    const response = await toolCall;
    emitDynamicToolTerminalDiagnostic({
      ...diagnosticContext,
      response,
      durationMs: Math.max(0, Date.now() - toolStartedAt),
    });
    return toCodexDynamicToolProtocolResponse(response);
  } catch (error) {
    emitDynamicToolErrorDiagnostic({
      ...diagnosticContext,
      durationMs: Math.max(0, Date.now() - toolStartedAt),
      terminalReason: signal.aborted ? resolveCodexToolAbortTerminalReason(signal) : "failed",
    });
    throw error;
  } finally {
    activeDynamicToolCalls.delete(toolCall);
  }
}
