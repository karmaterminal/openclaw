import { t as createZalouserPluginBase } from "./shared-Bu9ZU-3G.js";
import { n as zalouserSetupAdapter } from "./setup-core-eEykMtEO.js";
import { t as zalouserSetupWizard } from "./setup-surface-CbHEc78G.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
