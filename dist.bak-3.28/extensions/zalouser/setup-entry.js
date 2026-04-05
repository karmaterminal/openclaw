import { a as defineSetupPluginEntry } from "../../core-Dj4AGPqv.js";
import { n as zalouserSetupAdapter, t as zalouserSetupWizard } from "../../setup-surface-md8OEfcq.js";
import { t as createZalouserPluginBase } from "../../shared-7T-wJJs1.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
//#region extensions/zalouser/setup-entry.ts
var setup_entry_default = defineSetupPluginEntry(zalouserSetupPlugin);
//#endregion
export { setup_entry_default as default, zalouserSetupPlugin };
