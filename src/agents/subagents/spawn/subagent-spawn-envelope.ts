import { isAcpRuntimeSpawnAvailable } from "../../../acp/runtime/availability.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { listRegisteredPluginAgentPromptGuidance } from "../../../plugins/command-registry-state.js";
import type { DeliveryContext } from "../../../utils/delivery-context.types.js";
import type { SpawnSubagentMode } from "./subagent-spawn.types.js";
import {
  buildSubagentSpawnEnvelope,
  type SubagentCompletionMode,
} from "./subagent-system-prompt.js";

const STRUCTURED_OUTPUT_INSTRUCTION =
  'Call structured_output with {"result": <your final result>} until one payload is accepted, with at most one retry after a rejected attempt. The result value must match the requested JSON Schema. Do not call structured_output again after acceptance.';

type PreparedSubagentSpawnEnvelope = {
  completionMode: SubagentCompletionMode;
  envelope: ReturnType<typeof buildSubagentSpawnEnvelope>;
  childSystemPrompt: string;
};

export function prepareSubagentSpawnEnvelope(params: {
  cfg: OpenClawConfig;
  collect: boolean;
  requestThreadBinding: boolean;
  spawnMode: SpawnSubagentMode;
  hasBoundThreadDeliveryOrigin: boolean;
  expectsCompletionMessage: boolean;
  completionTarget?: "parent";
  soleCollectorChild: boolean;
  task: string;
  requesterSessionKey?: string;
  requesterOrigin?: DeliveryContext;
  childSessionKey: string;
  label?: string;
  childRuntimeSandboxed: boolean;
  childDepth: number;
  maxSpawnDepth: number;
  /** Withhold session keys: they name the agent and identify the run. */
  blind?: boolean;
  drainsContinuationDelegateQueue: boolean;
  outputSchema?: Record<string, unknown>;
  /** The subagent profile's instructions follow the envelope, before the output contract. */
  systemPrompt: (base: string) => string;
}): PreparedSubagentSpawnEnvelope {
  let completionMode: SubagentCompletionMode = "quiet";
  if (params.collect) {
    completionMode = "collector";
  } else if (
    params.requestThreadBinding &&
    params.spawnMode === "session" &&
    params.hasBoundThreadDeliveryOrigin
  ) {
    completionMode = "thread-direct";
  } else if (params.expectsCompletionMessage) {
    completionMode = "announce";
  }

  const continuationEnabled = params.cfg.agents?.defaults?.continuation?.enabled === true;
  const toolNames: string[] = [];
  if (continuationEnabled) {
    toolNames.push("continue_work");
  }
  if (
    params.drainsContinuationDelegateQueue &&
    params.childDepth < params.maxSpawnDepth &&
    !params.cfg.tools?.subagents?.tools?.deny?.includes("continue_delegate")
  ) {
    toolNames.push("continue_delegate");
  }

  const envelope = buildSubagentSpawnEnvelope({
    completionMode,
    completionTarget: params.completionTarget,
    soleCollectorChild: params.soleCollectorChild,
    spawnMode: params.spawnMode,
    task: params.task,
    requesterSessionKey: params.requesterSessionKey,
    requesterOrigin: params.requesterOrigin,
    childSessionKey: params.childSessionKey,
    label: params.label,
    childDepth: params.childDepth,
    maxSpawnDepth: params.maxSpawnDepth,
    blind: params.blind,
    acpEnabled: isAcpRuntimeSpawnAvailable({
      config: params.cfg,
      sandboxed: params.childRuntimeSandboxed,
    }),
    nativeCommandGuidanceLines: listRegisteredPluginAgentPromptGuidance({ surface: "subagent" }),
    toolNames,
    continuationEnabled,
  });
  const profiledSystemPrompt = params.systemPrompt(envelope.systemPrompt);
  const childSystemPrompt = params.outputSchema
    ? `${profiledSystemPrompt}\n\n${STRUCTURED_OUTPUT_INSTRUCTION}`
    : profiledSystemPrompt;

  return { completionMode, envelope, childSystemPrompt };
}
