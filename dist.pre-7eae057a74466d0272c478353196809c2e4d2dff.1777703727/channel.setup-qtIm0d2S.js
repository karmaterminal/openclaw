import { t as createZalouserPluginBase } from "./shared-Dt97UA3F.js";
import { n as zalouserSetupAdapter } from "./setup-core-M4Kd4OvF.js";
import { t as zalouserSetupWizard } from "./setup-surface-DryrwbCo.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
