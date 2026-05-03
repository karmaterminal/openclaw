import { t as createZalouserPluginBase } from "./shared-Bizzyaij.js";
import { n as zalouserSetupAdapter } from "./setup-core-z6uoA3nR.js";
import { t as zalouserSetupWizard } from "./setup-surface-Dua5hZfh.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
