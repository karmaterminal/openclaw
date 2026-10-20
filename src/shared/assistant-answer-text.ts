import { asOptionalRecord } from "@openclaw/normalization-core/record-coerce";
import {
  normalizeAssistantPhase,
  parseAssistantTextSignature,
  readAssistantTextBlocksForPhase,
} from "./chat-message-content.js";

// Raw final-answer bytes, one item per assistant text block; joined, they are the answer.
function readRawAssistantAnswerItems(message: unknown): string[] {
  const lastAssistant = asOptionalRecord(message);
  if (!lastAssistant) {
    return [];
  }
  const inlineText =
    typeof lastAssistant.text === "string" ? lastAssistant.text : lastAssistant.content;
  if (typeof inlineText === "string") {
    return normalizeAssistantPhase(lastAssistant.phase) === "commentary" ? [] : [inlineText];
  }
  const finalBlocks = readAssistantTextBlocksForPhase(lastAssistant, "final_answer");
  if (finalBlocks.length > 0) {
    return finalBlocks.map((block) => block.text);
  }
  // Signed unphased blocks retain their own answer semantics regardless of the message phase.
  const signedUnphasedParts = readAssistantTextBlocksForPhase({
    content: lastAssistant.content,
  }).filter((block) => parseAssistantTextSignature(block)?.id);
  if (signedUnphasedParts.length > 0) {
    return signedUnphasedParts.map((block) => block.text);
  }
  return readAssistantTextBlocksForPhase(lastAssistant).map((block) => block.text);
}

/** Selects canonical final-answer bytes before channel reply directives are parsed. */
export function resolveRawAssistantAnswerText(message: unknown): string {
  return readRawAssistantAnswerItems(message).join("");
}

/**
 * Selects canonical final-answer text items verbatim, one per assistant text block, so
 * per-item continuation hops keep their bytes. Whitespace-only items are dropped.
 */
export function resolveRawAssistantAnswerParts(message: unknown): string[] {
  return readRawAssistantAnswerItems(message).filter((text) => text.trim());
}
