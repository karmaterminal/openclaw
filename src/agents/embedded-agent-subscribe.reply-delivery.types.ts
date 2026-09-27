// Option and retry-record shapes for embedded-agent block reply delivery.
import type { BlockReplyPayload } from "./embedded-agent-payloads.js";

export type BlockReplyDeliveryOptions = {
  assistantMessageIndex?: number;
  pendingToolMedia?: BlockReplyPayload | null;
  autoDeliveryMediaUrls?: string[];
  retryable?: boolean;
};

export type FailedBlockReply = {
  payload: BlockReplyPayload;
  options?: BlockReplyDeliveryOptions;
  onDelivered?: () => void;
  deliveryGeneration: number;
  deliveryKey: string;
  deliverySequence: number;
};

export type EmitBlockReplyOptions = {
  assistantMessageIndex?: number;
  blockSourceText?: string;
  blockSourceRange?: readonly [start: number, end: number];
  /** Completion provenance; survives the presentation-change clear. */
  blockCoverageSourceText?: string;
  consumePendingToolMedia?: boolean;
  onDelivered?: () => void;
  retryable?: boolean;
};
