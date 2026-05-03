import { t as createZalouserPluginBase } from "./shared-D3nJA7CU.js";
import { n as zalouserSetupAdapter } from "./setup-core-DiIEmKzM.js";
import { t as zalouserSetupWizard } from "./setup-surface-CsE9rKEP.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
