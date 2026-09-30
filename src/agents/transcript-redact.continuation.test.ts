// Continuation transcript redaction tests cover continue_delegate inline
// attachment snapshots so delegated secrets do not persist in transcripts.

import type { AgentMessage } from "openclaw/plugin-sdk/agent-core";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { redactTranscriptMessage } from "./transcript-redact.js";

// AgentMessage includes custom message types without content; this accessor
// keeps strict union checks local to the redaction fixtures.
function msgContent(msg: AgentMessage): unknown {
  return (msg as unknown as { content: unknown }).content;
}

function cfg(patterns?: string[]): OpenClawConfig {
  return {
    logging: patterns ? { redactPatterns: patterns } : {},
  } satisfies OpenClawConfig;
}

describe("redactTranscriptMessage", () => {
  it("redacts continue_delegate inline snapshots at the canonical transcript boundary", () => {
    const secret = "CANONICAL_TRANSCRIPT_CONTINUATION_ATTACHMENT_SECRET";
    const attachmentName = "CANONICAL_TRANSCRIPT_ATTACHMENT_NAME_MUST_NOT_ECHO.md";
    const msg = {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "delegate-call",
          name: " continue_delegate ",
          partialArgs: {
            task: "carry the partial argument snapshot",
            attachments: [{ name: attachmentName, content: secret }],
          },
          partialJson: JSON.stringify({
            task: "carry the streaming snapshot",
            attachments: [{ name: attachmentName, content: secret }],
          }),
          arguments: {
            task: "carry the snapshot",
            attachments: [{ name: attachmentName, content: secret }],
          },
        },
        {
          type: "toolUse",
          id: "delegate-use",
          name: "continue_delegate",
          input: {
            task: "carry the alternate snapshot",
            attachments: [{ name: attachmentName, content: secret }],
          },
        },
        {
          type: "function_call",
          id: "delegate-function-call",
          name: "continue_delegate",
          arguments: JSON.stringify({
            task: "carry the legacy snapshot",
            attachments: [{ name: attachmentName, content: secret }],
          }),
        },
      ],
    } as unknown as AgentMessage;

    const result = redactTranscriptMessage(msg, cfg());
    const persistedBytes = JSON.stringify(result);
    expect(persistedBytes).not.toContain(secret);
    expect(persistedBytes).not.toContain(attachmentName);
    expect(persistedBytes).toContain("__OPENCLAW_REDACTED__");
    const blocks = msgContent(result) as Array<{
      name: string;
      partialArgs?: unknown;
      partialJson?: string;
    }>;
    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.name)).toEqual([
      "continue_delegate",
      "continue_delegate",
      "continue_delegate",
    ]);
    expect(blocks[0]).not.toHaveProperty("partialArgs");
    expect(blocks[0]).not.toHaveProperty("partialJson");
  });
});
