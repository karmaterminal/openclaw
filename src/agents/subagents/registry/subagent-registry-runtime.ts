export {
  adoptPausedSubagentRunForFollowUp,
  replaceSubagentRunAfterSteerCore as replaceSubagentRunAfterSteer,
} from "./subagent-registry.js";

export async function getLazySubagentRunByRunId(runId: string) {
  return (await import("./subagent-registry.js")).getSubagentRunByRunId(runId);
}

export async function recordLazySubagentSteerDispatch(
  params: Parameters<
    typeof import("./subagent-registry.js").recordAcceptedSubagentSteerDispatch
  >[0],
) {
  return (await import("./subagent-registry.js")).recordAcceptedSubagentSteerDispatch(params);
}

export async function clearLazySubagentSteerRestart(
  ...args: Parameters<typeof import("./subagent-registry.js").clearSubagentRunSteerRestart>
) {
  return (await import("./subagent-registry.js")).clearSubagentRunSteerRestart(...args);
}
