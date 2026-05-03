import { u as resolveStorePath } from "./paths-BCOWYnec.js";
import { n as readSessionUpdatedAt, r as recordSessionMetaFromInbound, s as updateLastRoute } from "./store-APN60wqF.js";
import "./sessions-DTfZDTku.js";
import { l as saveMediaBuffer } from "./store-Bfd4_fWY.js";
import { r as fetchRemoteMedia } from "./fetch-CA2opuGY.js";
import { n as resolveChannelGroupRequireMention, t as resolveChannelGroupPolicy } from "./group-policy-DA9wWg4s.js";
import { a as chunkText, c as resolveTextChunkLimit, i as chunkMarkdownTextWithMode, o as chunkTextWithMode, r as chunkMarkdownText, s as resolveChunkMode, t as chunkByNewline } from "./chunk-CeexuxRc.js";
import { t as loadChannelOutboundAdapter } from "./load-BRDNxGJz.js";
import { i as resolveAgentRoute, t as buildAgentSessionKey } from "./resolve-route-BpYvXWGP.js";
import { i as resolveHumanDelayConfig, r as resolveEffectiveMessagesConfig } from "./identity-Cojf61YG.js";
import { t as finalizeInboundContext } from "./inbound-context-C2oNi_yO.js";
import { t as convertMarkdownTables } from "./tables-CPkhMZE0.js";
import { i as shouldComputeCommandAuthorized, r as isControlCommandMessage, t as hasControlCommand } from "./command-detection-BTBHOigx.js";
import { p as shouldHandleTextCommands } from "./commands-registry-eOWtYpGJ.js";
import { a as createReplyDispatcherWithTyping, c as withReplyDispatcher, o as dispatchReplyFromConfig, s as settleReplyDispatcher } from "./dispatch-xmeBvXJj.js";
import { i as matchesMentionWithExplicit, n as buildMentionRegexes, r as matchesMentionPatterns } from "./mentions-DXCq8bbC.js";
import { a as resolveEnvelopeFormatOptions, r as formatInboundEnvelope, t as formatAgentEnvelope } from "./envelope-D9gs_PV2.js";
import { n as resolveInboundDebounceMs, t as createInboundDebouncer } from "./inbound-debounce-CfOoIcPl.js";
import { t as dispatchReplyWithBufferedBlockDispatcher } from "./provider-dispatcher-DZbvsx8o.js";
import { i as shouldAckReaction, n as removeAckReactionAfterReply, r as removeAckReactionHandleAfterReply, t as createAckReactionHandle } from "./ack-reactions-Dmt0b-c0.js";
import { t as resolveCommandAuthorizedFromAuthorizers } from "./command-gating-D0bjkO2U.js";
import { n as resolveInboundMentionDecision, t as implicitMentionKindWhen } from "./mention-gating-v6MlcsVc.js";
import { n as setChannelConversationBindingMaxAgeBySessionKey, t as setChannelConversationBindingIdleTimeoutBySessionKey } from "./conversation-bindings-C27VsLIa.js";
import { t as recordInboundSession } from "./session-D3GwCPwf.js";
import { a as buildChannelTurnContext, i as runResolvedChannelTurn, n as runChannelTurn, r as runPreparedChannelTurn, t as dispatchAssembledChannelTurn } from "./kernel-BOZ2liCy.js";
import { t as resolveMarkdownTableMode } from "./markdown-tables-CG9zD8yy.js";
import { n as recordChannelActivity, t as getChannelActivity } from "./channel-activity-k7zA9rsc.js";
import { t as buildPairingReply } from "./pairing-messages-DMr4TRR5.js";
import { a as readChannelAllowFromStore, d as upsertChannelPairingRequest } from "./pairing-store-Dn7XE0de.js";
import { t as createChannelRuntimeContextRegistry } from "./channel-runtime-contexts-nNr9IUQB.js";
//#region src/plugins/runtime/runtime-channel.ts
function createRuntimeChannel() {
	return {
		text: {
			chunkByNewline,
			chunkMarkdownText,
			chunkMarkdownTextWithMode,
			chunkText,
			chunkTextWithMode,
			resolveChunkMode,
			resolveTextChunkLimit,
			hasControlCommand,
			resolveMarkdownTableMode,
			convertMarkdownTables
		},
		reply: {
			dispatchReplyWithBufferedBlockDispatcher,
			createReplyDispatcherWithTyping,
			resolveEffectiveMessagesConfig,
			resolveHumanDelayConfig,
			dispatchReplyFromConfig,
			withReplyDispatcher,
			settleReplyDispatcher,
			finalizeInboundContext,
			formatAgentEnvelope,
			/** @deprecated Prefer `BodyForAgent` + structured user-context blocks (do not build plaintext envelopes for prompts). */
			formatInboundEnvelope,
			resolveEnvelopeFormatOptions
		},
		routing: {
			buildAgentSessionKey,
			resolveAgentRoute
		},
		pairing: {
			buildPairingReply,
			readAllowFromStore: ({ channel, accountId, env }) => readChannelAllowFromStore(channel, env, accountId),
			upsertPairingRequest: ({ channel, id, accountId, meta, env, pairingAdapter }) => upsertChannelPairingRequest({
				channel,
				id,
				accountId,
				meta,
				env,
				pairingAdapter
			})
		},
		media: {
			fetchRemoteMedia,
			saveMediaBuffer
		},
		activity: {
			record: recordChannelActivity,
			get: getChannelActivity
		},
		session: {
			resolveStorePath,
			readSessionUpdatedAt,
			recordSessionMetaFromInbound,
			recordInboundSession,
			updateLastRoute
		},
		mentions: {
			buildMentionRegexes,
			matchesMentionPatterns,
			matchesMentionWithExplicit,
			implicitMentionKindWhen,
			resolveInboundMentionDecision
		},
		reactions: {
			createAckReactionHandle,
			shouldAckReaction,
			removeAckReactionAfterReply,
			removeAckReactionHandleAfterReply
		},
		groups: {
			resolveGroupPolicy: resolveChannelGroupPolicy,
			resolveRequireMention: resolveChannelGroupRequireMention
		},
		debounce: {
			createInboundDebouncer,
			resolveInboundDebounceMs
		},
		commands: {
			resolveCommandAuthorizedFromAuthorizers,
			isControlCommandMessage,
			shouldComputeCommandAuthorized,
			shouldHandleTextCommands
		},
		outbound: { loadAdapter: loadChannelOutboundAdapter },
		turn: {
			run: runChannelTurn,
			runResolved: runResolvedChannelTurn,
			buildContext: buildChannelTurnContext,
			runPrepared: runPreparedChannelTurn,
			dispatchAssembled: dispatchAssembledChannelTurn
		},
		threadBindings: {
			setIdleTimeoutBySessionKey: ({ channelId, targetSessionKey, accountId, idleTimeoutMs }) => setChannelConversationBindingIdleTimeoutBySessionKey({
				channelId,
				targetSessionKey,
				accountId,
				idleTimeoutMs
			}),
			setMaxAgeBySessionKey: ({ channelId, targetSessionKey, accountId, maxAgeMs }) => setChannelConversationBindingMaxAgeBySessionKey({
				channelId,
				targetSessionKey,
				accountId,
				maxAgeMs
			})
		},
		runtimeContexts: createChannelRuntimeContextRegistry()
	};
}
//#endregion
export { createRuntimeChannel as t };
