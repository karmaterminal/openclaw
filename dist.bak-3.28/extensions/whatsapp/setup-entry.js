import { eL as resolveWhatsAppGroupIntroHint, nL as resolveWhatsAppGroupRequireMention, rL as resolveWhatsAppGroupToolPolicy } from "../../auth-profiles-D5vQ2NEm.js";
import { a as defineSetupPluginEntry } from "../../core-Dj4AGPqv.js";
import { t as whatsappSetupAdapter } from "../../setup-core-DZL9tc26.js";
import { i as whatsappSetupWizardProxy, n as createWhatsAppPluginBase } from "../../shared-Dce0DBzA.js";
import { d as webAuthExists } from "../../auth-store-Bwalh7-1.js";
//#region extensions/whatsapp/src/channel.setup.ts
const whatsappSetupPlugin = { ...createWhatsAppPluginBase({
	groups: {
		resolveRequireMention: resolveWhatsAppGroupRequireMention,
		resolveToolPolicy: resolveWhatsAppGroupToolPolicy,
		resolveGroupIntroHint: resolveWhatsAppGroupIntroHint
	},
	setupWizard: whatsappSetupWizardProxy,
	setup: whatsappSetupAdapter,
	isConfigured: async (account) => await webAuthExists(account.authDir)
}) };
//#endregion
//#region extensions/whatsapp/setup-entry.ts
var setup_entry_default = defineSetupPluginEntry(whatsappSetupPlugin);
//#endregion
export { setup_entry_default as default, whatsappSetupPlugin };
