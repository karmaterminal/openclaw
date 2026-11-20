import type { StreamFn } from "openclaw/plugin-sdk/agent-core";
import type { ProviderWrapStreamFnContext } from "openclaw/plugin-sdk/plugin-entry";
import {
  applyAnthropicEphemeralCacheControlMarkers,
  projectCopilotRequestFacts,
  wrapProviderPayloadHook,
} from "openclaw/plugin-sdk/provider-stream-shared";
import {
  asOptionalObjectRecord,
  asPositiveSafeInteger,
} from "openclaw/plugin-sdk/string-coerce-runtime";
import { sanitizeCopilotReplayResponsePayload } from "./connection-bound-ids.js";
import { COPILOT_MAX_PROMPT_IMAGES_PARAM } from "./model-metadata.js";
import { stripCopilotAssistantThinkingMessages } from "./replay-policy.js";
import { buildCopilotRuntimeHeaders } from "./runtime-identity.js";

type CopilotAnthropicToolBlock = {
  record: Record<string, unknown>;
  idKey: "id" | "tool_use_id";
  rawId: string;
};

function normalizeCopilotAnthropicToolIds(messages: unknown[]): void {
  const blocks: CopilotAnthropicToolBlock[] = [];
  for (const message of messages) {
    const content = asOptionalObjectRecord(message)?.content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      const record = asOptionalObjectRecord(block);
      if (!record) {
        continue;
      }
      const idKey =
        record.type === "tool_use" ? "id" : record.type === "tool_result" ? "tool_use_id" : null;
      const rawId = idKey ? record[idKey] : undefined;
      if (idKey && typeof rawId === "string") {
        blocks.push({ record, idKey, rawId });
      }
    }
  }

  // Reserve valid IDs globally so an earlier invalid call cannot steal the ID
  // of a later native call; replaying this payload patch must also be stable.
  const validId = /^[a-zA-Z0-9_-]{1,64}$/;
  const reserved = new Set(
    blocks
      .filter((block) => block.idKey === "id" && validId.test(block.rawId))
      .map((block) => block.rawId),
  );
  const used = new Set(reserved);
  const claimedValid = new Set<string>();
  const pendingByRawId = new Map<string, string[]>();
  const lastResolvedByRawId = new Map<string, string>();

  const allocate = (rawId: string): string => {
    if (validId.test(rawId) && !claimedValid.has(rawId)) {
      claimedValid.add(rawId);
      return rawId;
    }

    const base = rawId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "tool";
    if (!used.has(base)) {
      used.add(base);
      return base;
    }

    for (let occurrence = 2; ; occurrence += 1) {
      const suffix = `_${occurrence}`;
      const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
  };

  for (const block of blocks) {
    if (block.idKey === "id") {
      const wireId = allocate(block.rawId);
      const pending = pendingByRawId.get(block.rawId);
      if (pending) {
        pending.push(wireId);
      } else {
        pendingByRawId.set(block.rawId, [wireId]);
      }
      block.record.id = wireId;
      continue;
    }

    // Upstream projection can collapse distinct raw calls to the same string;
    // consume occurrences in order so each result answers its own tool call.
    const pending = pendingByRawId.get(block.rawId);
    const wireId =
      pending?.shift() ?? lastResolvedByRawId.get(block.rawId) ?? allocate(block.rawId);
    if (pending?.length === 0) {
      pendingByRawId.delete(block.rawId);
    }
    lastResolvedByRawId.set(block.rawId, wireId);
    block.record.tool_use_id = wireId;
  }
}

function patchCopilotAnthropicPayload(payload: unknown): void {
  const record = asOptionalObjectRecord(payload);
  if (!record) {
    return;
  }
  if (Array.isArray(record.messages)) {
    const messages = stripCopilotAssistantThinkingMessages(record.messages);
    record.messages = messages;
    normalizeCopilotAnthropicToolIds(messages);
  }
  applyAnthropicEphemeralCacheControlMarkers(record);
}

// Image part type on each Copilot wire, and the text part that can stand in its place.
const COPILOT_IMAGE_TEXT_TYPES = new Map([
  ["input_image", "input_text"], // Responses message content and function_call_output output
  ["image_url", "text"], // Chat Completions
  ["image", "text"], // Anthropic Messages, including tool_result content
]);

// Copilot lists a per-model cap on images in one prompt, and replay re-sends every
// earlier image. Keep the newest images (the last in wire order) so the current picture
// always reaches the model, and put a fixed notice in place of each earlier one so the
// model knows how many it did not see. Text turns leave the request bytes as they were;
// a new image displaces the oldest kept one, so the prompt cache rewrites from there (#1565).
function capCopilotPromptImages(payload: unknown, maxImages: number): void {
  const record = asOptionalObjectRecord(payload);
  const items = Array.isArray(record?.input) ? record.input : record?.messages;
  if (!Array.isArray(items)) {
    return;
  }
  const notice =
    maxImages === 1
      ? "[image omitted: this model accepts at most 1 image per prompt, so only the newest image is shown]"
      : `[image omitted: this model accepts at most ${maxImages} images per prompt, so only the newest ${maxImages} images are shown]`;
  // The first walk counts the images; the second replaces all but the last maxImages.
  let omitted = 0;
  let seen = 0;
  const capParts = (owner: Record<string, unknown>, key: string): void => {
    const parts = owner[key];
    if (!Array.isArray(parts)) {
      return;
    }
    let capped: unknown[] | undefined;
    parts.forEach((part, index) => {
      const block = asOptionalObjectRecord(part);
      if (block?.type === "tool_result") {
        capParts(block, "content");
        return;
      }
      const textType =
        typeof block?.type === "string" ? COPILOT_IMAGE_TEXT_TYPES.get(block.type) : undefined;
      if (textType && ++seen <= omitted) {
        // Anthropic places cache breakpoints before payload hooks; keep one on its stand-in.
        const cacheControl = block?.cache_control;
        (capped ??= [...parts])[index] = {
          type: textType,
          text: notice,
          ...(cacheControl === undefined ? {} : { cache_control: cacheControl }),
        };
      }
    });
    if (capped) {
      owner[key] = capped;
    }
  };
  const walk = (): void => {
    seen = 0;
    for (const item of items) {
      const message = asOptionalObjectRecord(item);
      if (message) {
        capParts(message, "content");
        capParts(message, "output");
      }
    }
  };
  walk();
  omitted = seen - maxImages;
  if (omitted > 0) {
    walk();
  }
}

/** Direct completions skip the agent wrapper but still need Copilot's request identity. */
export function wrapCopilotSimpleCompletionStream(
  ctx: ProviderWrapStreamFnContext,
): StreamFn | undefined {
  const stream = ctx.streamFn;
  if (!stream) {
    return undefined;
  }
  return (model, context, options) =>
    stream(model, context, {
      ...options,
      headers: buildCopilotRuntimeHeaders({
        config: ctx.config,
        headers: { ...model.headers, ...options?.headers },
      }),
    });
}

export function wrapCopilotProviderStream(ctx: ProviderWrapStreamFnContext): StreamFn | undefined {
  const stream = ctx.streamFn;
  if (!stream) {
    return undefined;
  }
  return (model, context, options) => {
    if (
      model.provider !== "github-copilot" ||
      !["anthropic-messages", "openai-responses", "openai-completions"].includes(model.api)
    ) {
      return stream(model, context, options);
    }
    const facts = projectCopilotRequestFacts(context.messages, "nested");
    const anthropic = model.api === "anthropic-messages";
    const originalOnPayload = options?.onPayload;
    const patchApiPayload = anthropic
      ? patchCopilotAnthropicPayload
      : model.api === "openai-responses"
        ? sanitizeCopilotReplayResponsePayload
        : undefined;
    const maxImages = asPositiveSafeInteger(model.params?.[COPILOT_MAX_PROMPT_IMAGES_PARAM]);
    const patchPayload =
      maxImages === undefined
        ? patchApiPayload
        : (payload: unknown) => {
            capCopilotPromptImages(payload, maxImages);
            patchApiPayload?.(payload);
          };
    return stream(model, context, {
      ...options,
      headers: buildCopilotRuntimeHeaders({
        config: ctx.config,
        headers: {
          ...model.headers,
          "x-initiator": facts.initiator,
          ...(facts.hasImages ? { "Copilot-Vision-Request": "true" } : {}),
          ...options?.headers,
        },
      }),
      ...(patchPayload
        ? {
            onPayload: wrapProviderPayloadHook(
              (payload, payloadModel) =>
                originalOnPayload?.(payload, anthropic ? model : payloadModel),
              (payload, result) => {
                patchPayload(result === undefined ? payload : result);
                return result;
              },
              (payload) => patchPayload(payload),
            ),
          }
        : {}),
    });
  };
}
