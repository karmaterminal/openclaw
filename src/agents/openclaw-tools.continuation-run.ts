// Per-run continuation tool assembly for createOpenClawTools (inventory stub opts + forwarding).
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createOpenClawContinuationTools } from "./openclaw-tools.continuation.js";
import type { OpenClawToolsOptions } from "./openclaw-tools.types.js";
import type { AnyAgentTool } from "./tools/common.js";
import { buildInventoryContinuationToolOpts } from "./tools/continuation-inventory-opts.js";

export function createOpenClawContinuationToolsForRun(params: {
  resolvedConfig?: OpenClawConfig;
  workspaceDir?: string;
  options?: OpenClawToolsOptions;
}): AnyAgentTool[] {
  const { resolvedConfig, workspaceDir, options } = params;
  const inventoryContinuationOpts = options?.beforeToolCallHookContext?.skillCommand
    ? buildInventoryContinuationToolOpts(
        resolvedConfig?.agents?.defaults?.continuation?.enabled === true,
      )
    : {};
  return createOpenClawContinuationTools({
    config: resolvedConfig,
    agentSessionKey: options?.agentSessionKey,
    runSessionKey: options?.runSessionKey,
    sessionId: options?.sessionId,
    runId: options?.runId,
    workspaceDir,
    sandboxRoot: options?.sandboxRoot,
    sandboxFsBridge: options?.sandboxFsBridge,
    sandboxWritable: options?.sandboxWritable,
    drainsContinuationDelegateQueue: options?.drainsContinuationDelegateQueue,
    disableContinuationTools: options?.disableContinuationTools,
    continueWorkOpts: options?.continueWorkOpts ?? inventoryContinuationOpts.continueWorkOpts,
    requestCompactionOpts:
      options?.requestCompactionOpts ?? inventoryContinuationOpts.requestCompactionOpts,
  });
}
