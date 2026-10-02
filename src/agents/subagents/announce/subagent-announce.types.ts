/** Subagent announce flow parameter and outcome types. */
import type { DeliveryContext } from "../../../utils/delivery-context.shared.js";
import type { AgentRunTerminalReplySnapshot } from "../../agent-run-terminal-reply.types.js";
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
  startedAt?: number;
  endedAt?: number;
  label?: string;
  outcome?: SubagentRunOutcome;
  expectsCompletionMessage?: boolean;
  completionTarget?: "parent";
  completionRequesterSessionId?: string;
  completionRequesterLifecycleRevision?: string;
  spawnMode?: SpawnSubagentMode;
  wakeOnDescendantSettle?: boolean;
  /** Deliver only frozen terminal facts; never inspect or mutate the child session. */
  suppressChildSessionEffects?: boolean;
  /** Refresh database currency before child-session reads or effects. */
  prepareChildSessionEffects?: () => Promise<boolean>;
  /** Synchronous host-owner check immediately before child-session effects. */
  isChildSessionEffectsAllowed?: () => boolean;
  /** Live owner check for requester delivery after awaited phases. */
  isCompletionDeliveryAllowed?: () => boolean;
  isCompletionOwnedByRequesterYield?: () => boolean;
  signal?: AbortSignal;
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
  onBeforeDeleteChildSession?: () => boolean | Promise<boolean>;
  resolveGatewayContext?: import("../../../gateway/server-methods/types.js").GatewayContextResolver;
};
