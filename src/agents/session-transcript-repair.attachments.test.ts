import { it, expect } from "vitest";
import { sanitizeToolCallInputs } from "./session-transcript-repair.js";
import { castAgentMessages } from "./test-helpers/agent-message-fixtures.js";

const thinking = {
  type: "thinking",
  thinking: "Replay completed work.",
  thinkingSignature: "signed-fixture",
};
const attachments = [{ name: "payload.txt", content: "TRANSCRIPT_ATTACHMENT_CONTENT" }];
const spawn = (id: string, input: object) => ({
  type: "toolUse",
  id,
  name: "sessions_spawn",
  input,
});
const toolResult = (toolCallId: string, toolName = "sessions_spawn") => ({
  role: "toolResult",
  toolCallId,
  toolName,
  content: [{ type: "text", text: "Completed" }],
  timestamp: 0,
});
const sanitize = (
  input: ReturnType<typeof castAgentMessages>,
  allowedToolNames = ["sessions_spawn"],
) => sanitizeToolCallInputs(input, { allowedToolNames, allowProviderOwnedThinkingReplay: true });

it("scans 1000 signed tool calls once for attachment presence", () => {
  let attachmentReads = 0;
  const calls = Array.from({ length: 1000 }, (_, index) => {
    const value = index === 999 ? attachments : [];
    return spawn(`call_${index}`, {
      task: `Recorded task ${index}`,
      get attachments() {
        attachmentReads += 1;
        return value;
      },
    });
  });
  const content = [thinking, ...calls];
  const assistant = { role: "assistant", content, timestamp: 0 };
  const input = castAgentMessages([
    assistant,
    ...calls.map(({ id, name }) => toolResult(id, name)),
  ]);
  const before = JSON.stringify(input);
  attachmentReads = 0;
  const out = sanitize(input);
  expect(attachmentReads).toBe(1000);
  expect(out).toBe(input);
  expect(out).toStrictEqual(JSON.parse(before));
  expect(out[0]).toBe(assistant);
  expect(assistant.content).toBe(content);
  expect(assistant.content[0]).toBe(thinking);
  expect(JSON.stringify(input)).toBe(before);
});

it("drops the whole signed attachment turn when the read sibling has no result", () => {
  const assistant = {
    role: "assistant",
    content: [
      thinking,
      spawn("call_spawn", { task: "Inspect attachment", attachments }),
      { type: "toolCall", id: "call_read", name: "read", arguments: { path: "README.md" } },
    ],
  };
  const result = toolResult("call_spawn");
  const input = castAgentMessages([assistant, result]);
  const before = JSON.stringify(input);
  const out = sanitize(input, ["sessions_spawn", "read"]);
  expect(out).toStrictEqual([result]);
  expect(out[0]).toBe(result);
  expect(JSON.stringify(input)).toBe(before);
});

describe("sanitizeToolCallInputs redacts continue_delegate snapshots", () => {
  it("redacts attachment names and content while preserving replay-safe metadata", () => {
    const argumentsSecret = "CONTINUE_ARGUMENTS_SECRET";
    const inputSecret = "CONTINUE_INPUT_SECRET";
    const argumentsName = "CONTINUE_ARGUMENTS_NAME_MUST_NOT_ECHO.md";
    const inputName = "CONTINUE_INPUT_NAME_MUST_NOT_ECHO.txt";
    const input = castAgentMessages([
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call_continue_arguments",
            name: " continue_delegate ",
            arguments: {
              task: "use the argument snapshot",
              attachments: [
                {
                  name: argumentsName,
                  content: argumentsSecret,
                  encoding: "utf8",
                  mimeType: "text/markdown",
                },
              ],
            },
          },
          {
            type: "toolUse",
            id: "call_continue_input",
            name: "continue_delegate",
            input: {
              task: "use the input snapshot",
              attachments: [{ name: inputName, content: inputSecret }],
            },
          },
        ],
      },
    ]);

    const serialized = JSON.stringify(sanitizeToolCallInputs(input));
    expect(serialized).not.toContain(argumentsSecret);
    expect(serialized).not.toContain(inputSecret);
    expect(serialized).not.toContain(argumentsName);
    expect(serialized).not.toContain(inputName);
    expect(serialized).toContain('"content":"__OPENCLAW_REDACTED__"');
    expect(serialized).toContain('"mimeType":"text/markdown"');
    expect(serialized).toContain("use the input snapshot");
  });

  it("replaces malformed members and drops unknown attachment fields", () => {
    const primitiveSecret = "CONTINUE_PRIMITIVE_SECRET";
    const unknownFieldSecret = "CONTINUE_UNKNOWN_FIELD_SECRET";
    const input = castAgentMessages([
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call_continue_malformed",
            name: "continue_delegate",
            arguments: {
              task: "reject malformed snapshot metadata",
              attachments: [
                primitiveSecret,
                {
                  name: "brief.md",
                  content: "CONTINUE_CONTENT_SECRET",
                  encoding: "utf8",
                  mimeType: "text/markdown",
                  extra: unknownFieldSecret,
                },
              ],
            },
          },
        ],
      },
    ]);

    const out = sanitizeToolCallInputs(input);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain(primitiveSecret);
    expect(serialized).not.toContain(unknownFieldSecret);
    expect(serialized).not.toContain("CONTINUE_CONTENT_SECRET");
    expect(serialized).not.toContain('"extra"');
    expect(serialized).toContain('"content":"__OPENCLAW_REDACTED__"');
    expect(serialized).not.toContain('"name":"brief.md"');
    expect(serialized).toContain('"encoding":"utf8"');
    expect(serialized).toContain('"mimeType":"text/markdown"');
  });

  it("removes malformed non-array attachments without retaining nested content", () => {
    const secret = "CONTINUE_NON_ARRAY_SECRET";
    const input = castAgentMessages([
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call_continue_non_array",
            name: "continue_delegate",
            arguments: {
              task: "reject a malformed attachment collection",
              attachments: { content: secret, nested: { content: secret } },
            },
          },
        ],
      },
    ]);

    const serialized = JSON.stringify(sanitizeToolCallInputs(input));
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('"attachments"');
    expect(serialized).toContain("reject a malformed attachment collection");
  });

  it("projects attachAs to its closed mount-hint shape", () => {
    const secret = "CONTINUE_ATTACH_AS_SECRET";
    const input = castAgentMessages([
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call_continue_attach_as",
            name: "continue_delegate",
            arguments: {
              task: "use a mounted snapshot",
              attachments: [{ name: "brief.md", content: "CONTINUE_CONTENT_SECRET" }],
              attachAs: {
                mountPath: "handoff",
                unknown: secret,
              },
            },
          },
        ],
      },
    ]);

    const out = sanitizeToolCallInputs(input);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("CONTINUE_CONTENT_SECRET");
    expect(serialized).not.toContain('"unknown"');
    expect(serialized).toContain('"attachAs":{"mountPath":"handoff"}');
  });

  it("removes mount hints when no attachment snapshot exists", () => {
    const secret = "CONTINUE_UNUSED_ATTACH_AS_SECRET";
    const input = castAgentMessages([
      {
        role: "assistant",
        content: [
          {
            type: "toolUse",
            id: "call_continue_unused_attach_as",
            name: "continue_delegate",
            input: {
              task: "continue without a snapshot",
              attach_as: {
                mount_path: "unused",
                unknown: secret,
              },
            },
          },
        ],
      },
    ]);

    const serialized = JSON.stringify(sanitizeToolCallInputs(input));
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('"attach_as":');
    expect(serialized).toContain("continue without a snapshot");
  });

  it("drops a signed-thinking turn when non-array attachments require sanitization", () => {
    const secret = "CONTINUE_SIGNED_NON_ARRAY_SECRET";
    const input = castAgentMessages([
      {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "Use the malformed continuation snapshot.",
            thinkingSignature: "sig_continue_delegate_malformed",
          },
          {
            type: "toolUse",
            id: "call_continue_signed_non_array",
            name: "continue_delegate",
            input: {
              task: "reject a signed malformed attachment collection",
              attachments: { content: secret },
            },
          },
        ],
      },
    ]);

    const out = sanitizeToolCallInputs(input, {
      allowedToolNames: ["continue_delegate"],
      allowProviderOwnedThinkingReplay: true,
    });

    expect(out).toEqual([]);
    expect(JSON.stringify(out)).not.toContain(secret);
  });

  it("drops a signed-thinking turn when attachAs contains unknown fields", () => {
    const secret = "CONTINUE_SIGNED_ATTACH_AS_SECRET";
    const input = castAgentMessages([
      {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "Use the mounted continuation snapshot.",
            thinkingSignature: "sig_continue_delegate_attach_as",
          },
          {
            type: "toolUse",
            id: "call_continue_signed_attach_as",
            name: "continue_delegate",
            input: {
              task: "reject signed unknown mount metadata",
              attachments: [
                {
                  content: "__OPENCLAW_REDACTED__",
                  name: "brief.md",
                },
              ],
              attachAs: {
                mountPath: "handoff",
                unknown: secret,
              },
            },
          },
        ],
      },
    ]);

    const out = sanitizeToolCallInputs(input, {
      allowedToolNames: ["continue_delegate"],
      allowProviderOwnedThinkingReplay: true,
    });

    expect(out).toEqual([]);
    expect(JSON.stringify(out)).not.toContain(secret);
  });

  it("preserves an already-redacted signed-thinking turn byte-for-byte", () => {
    const input = castAgentMessages([
      {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "Use the already-sanitized continuation snapshot.",
            thinkingSignature: "sig_continue_delegate",
          },
          {
            type: "toolUse",
            id: "call_continue_redacted",
            name: "continue_delegate",
            input: {
              task: "use the sanitized snapshot",
              attachments: [
                {
                  content: "__OPENCLAW_REDACTED__",
                  name: "brief.md",
                  encoding: "utf8",
                  mimeType: "text/markdown",
                },
              ],
              attachAs: { mountPath: "handoff" },
            },
          },
        ],
      },
    ]);

    const repaired = sanitizeToolCallInputs(input);
    const repairedBytes = JSON.stringify(repaired);
    expect(repaired).not.toBe(input);
    expect(repairedBytes).not.toContain('"name":"brief.md"');
    expect(repairedBytes).toContain('"content":"__OPENCLAW_REDACTED__"');

    const out = sanitizeToolCallInputs(input, {
      allowedToolNames: ["continue_delegate"],
      allowProviderOwnedThinkingReplay: true,
    });

    expect(out).toBe(input);
  });
});
