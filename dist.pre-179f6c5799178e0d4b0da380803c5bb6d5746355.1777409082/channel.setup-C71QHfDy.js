import { t as createZalouserPluginBase } from "./shared-YZXLENhy.js";
import { n as zalouserSetupAdapter } from "./setup-core-CGagbIST.js";
import { t as zalouserSetupWizard } from "./setup-surface-dWTwcN16.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
