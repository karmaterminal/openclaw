import { t as createZalouserPluginBase } from "./shared-iCzb3glf.js";
import { n as zalouserSetupAdapter } from "./setup-core-CkiKftLW.js";
import { t as zalouserSetupWizard } from "./setup-surface-DnYEa-34.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
