import { asOptionalRecord } from "@openclaw/normalization-core/record-coerce";
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import {
  extractAssistantTextForPhase,
  parseAssistantTextSignature,
  readAssistantTextBlocksForPhase,
} from "./chat-message-content.js";
import {
  sanitizeAssistantFinalAnswerText,
  sanitizeAssistantVisibleText,
} from "./text/assistant-visible-text.js";

function isAssistantTextContentBlockType(value: unknown): boolean {
  return value === "text" || value === "input_text" || value === "output_text";
}

// Keeps an item's original bytes when sanitizing only trimmed its surrounding
// whitespace, so per-item continuation hops are delivered verbatim.
function preserveItemWhitespace(sanitize: (text: string) => string): (text: string) => string {
  return (text) => {
    const sanitized = sanitize(text);
    if (!sanitized) {
      return "";
    }
    const sanitizedIndex = text.indexOf(sanitized);
    return sanitizedIndex >= 0 &&
      text.slice(0, sanitizedIndex).trim().length === 0 &&
      text.slice(sanitizedIndex + sanitized.length).trim().length === 0
      ? text
      : sanitized;
  };
}

/** Selects canonical final-answer bytes before channel reply directives are parsed. */
export function resolveRawAssistantAnswerText(message: unknown): string {
  return normalizeOptionalString(resolveRawAssistantAnswerParts(message).join("\n")) ?? "";
}

/** Selects canonical final-answer text items, one per assistant text block when available. */
export function resolveRawAssistantAnswerParts(
  message: unknown,
  options: { preserveItemWhitespace?: boolean } = {},
): string[] {
  const lastAssistant = asOptionalRecord(message);
  if (!lastAssistant) {
    return [];
  }
  const sanitizeFinalAnswerText = options.preserveItemWhitespace
    ? preserveItemWhitespace(sanitizeAssistantFinalAnswerText)
    : sanitizeAssistantFinalAnswerText;
  const finalAnswerText = extractAssistantTextForPhase(lastAssistant, {
    phase: "final_answer",
    sanitizeText: sanitizeFinalAnswerText,
  });
  if (finalAnswerText) {
    // Inline message text wins over content blocks in extractAssistantTextForPhase.
    const finalAnswerParts =
      typeof lastAssistant.text === "string"
        ? []
        : readAssistantTextBlocksForPhase(lastAssistant, "final_answer")
            .map((block) => sanitizeFinalAnswerText(block.text))
            .filter((text) => text.trim());
    return finalAnswerParts.length ? finalAnswerParts : [finalAnswerText];
  }
  if (Array.isArray(lastAssistant.content)) {
    const hasExplicitPhasedTextBlock = lastAssistant.content.some((block) => {
      const record = asOptionalRecord(block);
      return (
        record !== undefined &&
        isAssistantTextContentBlockType(record.type) &&
        Boolean(parseAssistantTextSignature(record)?.phase)
      );
    });
    if (!hasExplicitPhasedTextBlock) {
      const signedUnphasedParts = lastAssistant.content
        .map((block) => {
          const record = asOptionalRecord(block);
          if (!record) {
            return null;
          }
          const signature = parseAssistantTextSignature(record);
          if (
            !isAssistantTextContentBlockType(record.type) ||
            typeof record.text !== "string" ||
            !signature?.id ||
            signature.phase
          ) {
            return null;
          }
          const text = sanitizeFinalAnswerText(record.text);
          return text.trim() ? text : null;
        })
        .filter((value): value is string => typeof value === "string");
      if (signedUnphasedParts.length) {
        return signedUnphasedParts;
      }
    }
  }
  const visibleText = extractAssistantTextForPhase(lastAssistant, {
    sanitizeText: options.preserveItemWhitespace
      ? preserveItemWhitespace(sanitizeAssistantVisibleText)
      : sanitizeAssistantVisibleText,
  });
  return visibleText ? [visibleText] : [];
}
