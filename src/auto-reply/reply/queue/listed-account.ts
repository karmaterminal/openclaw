import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { isSenderInOwnerAllowFromList } from "../../command-auth.js";
import type { FollowupRun } from "./types.js";

// Frond (karmaterminal, #1564): channels whose plugins set account provenance (senderAccountVerified)
// from verified platform account metadata. Every other channel is unsupported, so its owner's room
// message stays ambient: Feishu and Mattermost, whose bot flags were not reviewed as provenance, and
// the channels with no such signal, among them iMessage, IRC, LINE, Microsoft Teams, Signal, SMS and
// WhatsApp. A plugin outside this set gains nothing by setting the fact.
const OWNER_ACCOUNT_PROVENANCE_CHANNELS: ReadonlySet<string> = new Set([
  "discord",
  "slack",
  "telegram",
]);

// Frond (karmaterminal, #1564): queue policy for this cut, not a criterion for whose words count. The
// configured owner's unaddressed room message, posted from the owner's own account, is not ambient
// chatter. The owner's accounts are the sender ids in messages.groupChat.ownerQueueProtectionAccounts,
// which is unset (nobody protected) by default and never derived from command authority:
// commands.ownerAllowFrom, the owner bit, operator.admin scope and operator profiles grant nothing
// here. The channel must also have verified that the account itself posted it, not a bot or app
// account, webhook, relay or proxy speaking for it; absent or ambiguous provenance is not protected.
// Agent and Gateway traffic stays bounded by ordinary ambient discard and the cap on purpose: Gateway
// error storms have flooded rooms. A designated agent lane would need its own authenticated,
// storm-safe contract (loop and rate limits, a circuit breaker); it is not part of this policy.
export function isListedOwnerAccount(
  config: OpenClawConfig,
  sender: { channel?: string; accountId?: string; senderId?: string; senderE164?: string },
  accountVerified: boolean | undefined,
): boolean {
  return (
    accountVerified === true &&
    OWNER_ACCOUNT_PROVENANCE_CHANNELS.has(sender.channel ?? "") &&
    isSenderInOwnerAllowFromList(
      config,
      sender,
      // Always a list: the matcher reads commands.ownerAllowFrom when given none.
      config.messages?.groupChat?.ownerQueueProtectionAccounts ?? [],
    )
  );
}

/** Frond (karmaterminal, #1564): a room event a listed account posted as itself. */
export function isListedAccountRoomEvent(run: FollowupRun): boolean {
  const execution = run.run;
  return (
    run.currentInboundEventKind === "room_event" &&
    isListedOwnerAccount(
      execution.config,
      {
        channel: execution.messageProvider,
        accountId: execution.agentAccountId,
        senderId: execution.senderId,
        senderE164: execution.senderE164,
      },
      execution.senderAccountVerified,
    )
  );
}
