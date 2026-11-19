import { redactSovereignText } from "../../logging/sovereign-redaction.js";
import { resolveBlockMessage } from "../../plugins/hook-decision-types.js";
import type { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import type {
  PluginHookAgentContext,
  PluginHookBeforeAgentRunEvent,
} from "../../plugins/hook-types.js";

type HookRunner = Pick<
  NonNullable<ReturnType<typeof getGlobalHookRunner>>,
  "hasHooks" | "runBeforeAgentRun"
>;
type AgentRunBlock = { blockedBy: string; message: string };

export async function runBeforeAgentRunGate(
  runner: HookRunner | null | undefined,
  event: PluginHookBeforeAgentRunEvent,
  context: PluginHookAgentContext,
): Promise<AgentRunBlock | undefined> {
  if (!runner?.hasHooks("before_agent_run")) {
    return undefined;
  }
  let result: Awaited<ReturnType<HookRunner["runBeforeAgentRun"]>>;
  try {
    const copy = structuredClone(event);
    // Plugins observe a copy whose sovereign spans are markers (openclaw#1321).
    copy.systemPrompt &&= redactSovereignText(copy.systemPrompt);
    result = await runner.runBeforeAgentRun(copy, context);
  } catch {
    result = {
      pluginId: "before_agent_run",
      decision: { outcome: "block", reason: "before_agent_run hook failed" },
    };
  }
  if (result?.decision.outcome !== "block") {
    return undefined;
  }
  const blockedBy = result.pluginId ?? "unknown";
  return { blockedBy, message: resolveBlockMessage(result.decision, { blockedBy }) };
}

export function buildAgentRunBlockedUserMessage(runId: string, block: AgentRunBlock) {
  const timestamp = Date.now();
  return {
    role: "user" as const,
    content: [{ type: "text" as const, text: block.message }],
    timestamp,
    idempotencyKey: `hook-block:before_agent_run:user:${runId}`,
    __openclaw: { beforeAgentRunBlocked: { blockedBy: block.blockedBy, blockedAt: timestamp } },
  };
}
