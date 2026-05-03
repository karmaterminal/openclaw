import { t as createZalouserPluginBase } from "./shared-DmmOoRtn.js";
import { n as zalouserSetupAdapter } from "./setup-core-DJ-1bN16.js";
import { t as zalouserSetupWizard } from "./setup-surface-BZVnYYDa.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
