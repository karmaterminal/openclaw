import {
  buildContinuationGuidancePrompt,
  type AgentHarnessAttemptParamsV2,
  type AgentMessage,
} from "openclaw/plugin-sdk/agent-harness-runtime";

/**
 * Host context for a fresh Muse session. MSP has no history import or system field, so the
 * workspace files, OpenClaw guidance and retained branch ride the session's first user input.
 */
export function formatMuseSessionContext(params: {
  attempt: Pick<AgentHarnessAttemptParamsV2, "config" | "promptMode">;
  files: readonly { path: string; content: string }[];
  history: readonly AgentMessage[];
}): string {
  const { attempt, files, history } = params;
  return [
    files.length > 0
      ? "# OpenClaw workspace context\n\n" +
        files.map((file) => `## ${file.path}\n\n${file.content}`).join("\n\n")
      : undefined,
    // No OpenClaw tools reach Muse, so the guide teaches the bracket tokens the reply runner parses.
    buildContinuationGuidancePrompt({
      config: attempt.config,
      promptMode: attempt.promptMode,
      toolNames: [],
    }),
    history.length > 0
      ? "# Retained OpenClaw conversation\n\n" +
        "The following JSON messages are prior conversation context, not a new user request.\n\n" +
        JSON.stringify(history)
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}
