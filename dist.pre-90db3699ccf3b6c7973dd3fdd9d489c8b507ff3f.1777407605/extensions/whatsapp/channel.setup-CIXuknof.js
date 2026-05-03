import { n as resolveWhatsAppGroupToolPolicy, r as resolveWhatsAppGroupIntroHint, t as resolveWhatsAppGroupRequireMention } from "./group-policy-CaP7ZA2D.js";
import { m as readWebAuthState } from "./auth-store-lH9AsQ9n.js";
import { r as whatsappSetupWizardProxy, t as createWhatsAppPluginBase } from "./shared-CTFIZuPI.js";
import { t as whatsappSetupAdapter } from "./setup-core-DIh4vswR.js";
import { t as detectWhatsAppLegacyStateMigrations } from "./state-migrations-CXPfGjKn.js";
//#region extensions/whatsapp/src/channel.setup.ts
const whatsappSetupPlugin = {
	...createWhatsAppPluginBase({
		groups: {
			resolveRequireMention: resolveWhatsAppGroupRequireMention,
			resolveToolPolicy: resolveWhatsAppGroupToolPolicy,
			resolveGroupIntroHint: resolveWhatsAppGroupIntroHint
		},
		setupWizard: whatsappSetupWizardProxy,
		setup: whatsappSetupAdapter,
		isConfigured: async (account) => await readWebAuthState(account.authDir) === "linked"
	}),
	lifecycle: { detectLegacyStateMigrations: ({ oauthDir }) => detectWhatsAppLegacyStateMigrations({ oauthDir }) }
};
//#endregion
export { whatsappSetupPlugin as t };
