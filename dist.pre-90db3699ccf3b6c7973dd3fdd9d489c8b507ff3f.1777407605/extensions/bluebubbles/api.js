import { T as isAllowedBlueBubblesSender, l as collectBlueBubblesStatusIssues } from "../../probe-DRo7yFtk.js";
import { a as bluebubblesConfigAdapter, c as bluebubblesReload, i as bluebubblesCapabilities, l as describeBlueBubblesAccount, n as blueBubblesSetupWizard, o as bluebubblesConfigSchema, r as blueBubblesSetupAdapter, s as bluebubblesMeta, t as bluebubblesPlugin } from "../../channel-C-WIwEG5.js";
import { n as createBlueBubblesConversationBindingManager, t as __testing } from "../../conversation-bindings-0JIZHjVV.js";
import { a as resolveBlueBubblesConversationIdFromTarget, i as normalizeBlueBubblesAcpConversationId, o as resolveBlueBubblesInboundConversationId, r as matchBlueBubblesAcpConversation } from "../../webhook-shared-C9UUVeRk.js";
import { n as resolveBlueBubblesGroupToolPolicy, t as resolveBlueBubblesGroupRequireMention } from "../../group-policy-PDog0Sa6.js";
//#region extensions/bluebubbles/src/channel.setup.ts
const bluebubblesSetupPlugin = {
	id: "bluebubbles",
	meta: {
		...bluebubblesMeta,
		aliases: [...bluebubblesMeta.aliases],
		preferOver: [...bluebubblesMeta.preferOver]
	},
	capabilities: bluebubblesCapabilities,
	reload: bluebubblesReload,
	configSchema: bluebubblesConfigSchema,
	setupWizard: blueBubblesSetupWizard,
	config: {
		...bluebubblesConfigAdapter,
		isConfigured: (account) => account.configured,
		describeAccount: (account) => describeBlueBubblesAccount(account)
	},
	setup: blueBubblesSetupAdapter
};
//#endregion
export { __testing, bluebubblesPlugin, bluebubblesSetupPlugin, collectBlueBubblesStatusIssues, createBlueBubblesConversationBindingManager, isAllowedBlueBubblesSender, matchBlueBubblesAcpConversation, normalizeBlueBubblesAcpConversationId, resolveBlueBubblesConversationIdFromTarget, resolveBlueBubblesGroupRequireMention, resolveBlueBubblesGroupToolPolicy, resolveBlueBubblesInboundConversationId };
