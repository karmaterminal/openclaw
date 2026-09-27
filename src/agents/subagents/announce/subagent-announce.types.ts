/** Subagent announce flow parameter and outcome types. */
import type { DeliveryContext } from "../../../utils/delivery-context.shared.js";
import type { AgentRunTerminalReplySnapshot } from "../../agent-run-terminal-reply.types.js";
import type { SubagentAnnounceType } from "../../subagent-announce-message.js";
import type { SpawnSubagentMode } from "../spawn/subagent-spawn.types.js";
import type { SubagentRunOutcome } from "../subagent-run-outcome.types.js";
import type { SubagentAnnounceDeliveryResult } from "./subagent-announce-dispatch.js";

export type SubagentAnnounceFlowOutcome =
  | NonNullable<SubagentAnnounceDeliveryResult["disposition"]>
  | "requester_turn_pending";

export type SubagentAnnounceFlowParams = {
  childSessionKey: string;
  childAgentId?: string;
  childRunId: string;
  runTimeoutSeconds?: number;
  requesterSessionKey: string;
  requesterAgentId?: string;
  requesterOrigin?: DeliveryContext;
  requesterDisplayKey: string;
  task: string;
  timeoutMs: number;
  cleanup: "delete" | "keep";
  roundOneReply?: string;
  terminalReply?: AgentRunTerminalReplySnapshot;
  /**
   * Fallback text preserved from the pre-wake run when a wake continuation
   * completes with NO_REPLY despite an earlier final summary already existing.
   */
  fallbackReply?: string;
  waitForCompletion?: boolean;
  startedAt?: number;
  endedAt?: number;
  label?: string;
  outcome?: SubagentRunOutcome;
  announceType?: SubagentAnnounceType;
  expectsCompletionMessage?: boolean;
  completionTarget?: "parent";
  completionRequesterSessionId?: string;
  spawnMode?: SpawnSubagentMode;
  wakeOnDescendantSettle?: boolean;
  /** Deliver only frozen terminal facts; never inspect or mutate the child session. */
  suppressChildSessionEffects?: boolean;
  /** Live owner check for child-session effects after awaited phases. */
  isChildSessionEffectsAllowed?: () => boolean;
  /** Live owner check for requester delivery after awaited phases. */
  isCompletionDeliveryAllowed?: () => boolean;
  isCompletionOwnedByRequesterYield?: () => boolean;
  signal?: AbortSignal;
  bestEffortDeliver?: boolean;
  onDeliveryResult?: (delivery: SubagentAnnounceDeliveryResult) => void | Promise<void>;
  silentAnnounce?: boolean;
  wakeOnReturn?: boolean;
  continuationTargetSessionKey?: string;
  continuationTargetSessionKeys?: string[];
  continuationFanoutMode?: "tree" | "all";
  continuationRecipientAuthorityBinding?: import("../../../config/sessions/session-recipient-authority-types.js").ContinuationRecipientAuthorityBinding;
  persistContinuationRecipientAuthorityBinding?: (
    binding: import("../../../config/sessions/session-recipient-authority-types.js").ContinuationRecipientAuthorityBinding,
  ) => boolean;
  traceparent?: string;
  onBeforeDeleteChildSession?: () => boolean;
  resolveGatewayContext?: import("../../../gateway/server-methods/types.js").GatewayContextResolver;
};
