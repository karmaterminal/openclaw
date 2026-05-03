import { t as createZalouserPluginBase } from "./shared-D_K34oIP.js";
import { n as zalouserSetupAdapter } from "./setup-core-DCMYLddQ.js";
import { t as zalouserSetupWizard } from "./setup-surface-DJupFqi-.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
