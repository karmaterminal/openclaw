import type { AssistantMessage } from "openclaw/plugin-sdk/llm";
import { createCompactionHandlers } from "./agent-session-loop-resource-loader.test-support.js";

export function createStaleThinkingContent(): AssistantMessage["content"] {
  return [
    { type: "thinking", thinking: "old think", thinkingSignature: "stale-thinking" },
    { type: "thinking", thinking: "old think", signature: "stale-signature" },
    { type: "thinking", thinking: "old think", thought_signature: "stale-thought" },
    { type: "redacted_thinking", data: "stale-redacted" },
    { type: "text", text: "retained answer" },
  ] as unknown as AssistantMessage["content"];
}

export function createResultHandlers(
  summary: string,
  firstKeptEntryId?: string,
  onPreparation?: (preparation: { latestUnresolvedUserRequest?: string }) => void,
) {
  const handlers = createCompactionHandlers();
  handlers.set("session_before_compact", [
    async (event: unknown) => {
      const preparation = (
        event as {
          preparation: {
            firstKeptEntryId: string;
            latestUnresolvedUserRequest?: string;
            tokensBefore: number;
          };
        }
      ).preparation;
      onPreparation?.(preparation);
      return {
        compaction: {
          summary,
          firstKeptEntryId: firstKeptEntryId ?? preparation.firstKeptEntryId,
          tokensBefore: preparation.tokensBefore,
        },
      };
    },
  ]);
  return handlers;
}
