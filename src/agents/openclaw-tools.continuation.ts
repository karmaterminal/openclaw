import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { OpenClawToolsOptions } from "./openclaw-tools.types.js";
import type { AnyAgentTool } from "./tools/common.js";
import { createContinueDelegateTool } from "./tools/continue-delegate-tool.js";
import { createContinueWorkTool } from "./tools/continue-work-tool.js";
import { createRequestCompactionTool } from "./tools/request-compaction-tool.js";

const log = createSubsystemLogger("agents/openclaw-tools");

type OpenClawContinuationToolOptions = Pick<
  OpenClawToolsOptions,
  | "drainsContinuationDelegateQueue"
  | "disableContinuationTools"
  | "continueWorkOpts"
  | "requestCompactionOpts"
>;

export function createOpenClawContinuationTools(
  options: OpenClawContinuationToolOptions & {
    config?: OpenClawConfig;
    agentSessionKey?: string;
    runSessionKey?: string;
    sessionId?: string;
    runId?: string;
  },
): AnyAgentTool[] {
  const enabled =
    options.disableContinuationTools !== true &&
    options.config?.agents?.defaults?.continuation?.enabled === true;
  if (!enabled) {
    return [];
  }

  const liveSessionKey = options.runSessionKey ?? options.agentSessionKey;
  const tools: AnyAgentTool[] = [];
  if (options.continueWorkOpts) {
    tools.push(
      createContinueWorkTool({
        agentSessionKey: options.agentSessionKey,
        ...options.continueWorkOpts,
      }),
    );
  }
  if (options.drainsContinuationDelegateQueue !== false) {
    tools.push(
      createContinueDelegateTool({ agentSessionKey: liveSessionKey, runId: options.runId }),
    );
  }
  if (options.requestCompactionOpts) {
    tools.push(
      createRequestCompactionTool({
        agentSessionKey: options.agentSessionKey,
        sessionId: options.sessionId,
        runId: options.runId,
        ...options.requestCompactionOpts,
      }),
    );
  }

  if (!options.continueWorkOpts && !options.requestCompactionOpts) {
    log.warn(
      "continuation.enabled=true but neither continueWorkOpts nor requestCompactionOpts " +
        "were supplied — only continue_delegate will register. If this is a live runner, it " +
        "must supply both callbacks for the full continuation tool set (likely a config/wiring " +
        "gap). If this is an inventory/catalog/dispatch build, register the tools via stub " +
        "callbacks (buildInventoryContinuationToolOpts) so the catalog reflects the full surface " +
        "and this warning is satisfied honestly rather than suppressed.",
      {
        agentSessionKey: options.agentSessionKey,
        runSessionKey: options.runSessionKey,
        drainsContinuationDelegateQueue: options.drainsContinuationDelegateQueue,
      },
    );
  }
  return tools;
}
