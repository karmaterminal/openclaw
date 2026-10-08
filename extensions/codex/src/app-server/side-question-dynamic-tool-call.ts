import { createCodexDynamicToolDiagnostics } from "./dynamic-tool-diagnostics.js";
import { toCodexDynamicToolProtocolResponse } from "./dynamic-tool-execution.js";
import type { CodexDynamicToolRuntimeResponse } from "./dynamic-tool-response-state.js";
import type { CodexDynamicToolCallResponse } from "./protocol.js";
import { resolveCodexToolAbortTerminalReason } from "./tool-abort-terminal-reason.js";

/**
 * Runs one side-question dynamic tool call, tracking it until it settles and
 * emitting its started and terminal diagnostics.
 */
export async function runCodexSideQuestionDynamicToolCall(params: {
  diagnosticContext: Parameters<typeof createCodexDynamicToolDiagnostics>[0];
  toolStartedAt: number;
  activeDynamicToolCalls: Set<Promise<unknown>>;
  signal: AbortSignal;
  execute: () => Promise<CodexDynamicToolRuntimeResponse>;
}): Promise<CodexDynamicToolCallResponse> {
  const { diagnosticContext, toolStartedAt, activeDynamicToolCalls, signal } = params;
  const diagnostics = createCodexDynamicToolDiagnostics(diagnosticContext);
  diagnostics.started();
  const toolCall = params.execute();
  activeDynamicToolCalls.add(toolCall);
  try {
    const response = await toolCall;
    diagnostics.terminal(response, Math.max(0, Date.now() - toolStartedAt));
    return toCodexDynamicToolProtocolResponse(response);
  } catch (error) {
    diagnostics.error(
      Math.max(0, Date.now() - toolStartedAt),
      signal.aborted ? resolveCodexToolAbortTerminalReason(signal) : "failed",
    );
    throw error;
  } finally {
    activeDynamicToolCalls.delete(toolCall);
  }
}
