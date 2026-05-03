import { n as resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir-CWQcmOLf.js";
import { i as createPatchedAccountSetupAdapter } from "./setup-helpers-Ch6SdLT5.js";
import { a as createDelegatedSetupWizardProxy } from "./setup-wizard-proxy-DgN_n5OY.js";
import "./setup-runtime-vTbpB7P_.js";
import "./browser-security-runtime-B5AXFvrX.js";
import path from "node:path";
import fs from "node:fs/promises";
//#region extensions/zalouser/src/qr-temp-file.ts
async function writeQrDataUrlToTempFile(qrDataUrl, profile) {
	const base64 = (qrDataUrl.trim().match(/^data:image\/png;base64,(.+)$/i)?.[1] ?? "").trim();
	if (!base64) return null;
	const safeProfile = profile.replace(/[^a-zA-Z0-9_-]+/g, "-") || "default";
	const filePath = path.join(resolvePreferredOpenClawTmpDir(), `openclaw-zalouser-qr-${safeProfile}.png`);
	await fs.writeFile(filePath, Buffer.from(base64, "base64"));
	return filePath;
}
//#endregion
//#region extensions/zalouser/src/setup-core.ts
const channel = "zalouser";
const zalouserSetupAdapter = createPatchedAccountSetupAdapter({
	channelKey: channel,
	validateInput: () => null,
	buildPatch: () => ({})
});
function createZalouserSetupWizardProxy(loadWizard) {
	return createDelegatedSetupWizardProxy({
		channel,
		loadWizard,
		status: {
			configuredLabel: "logged in",
			unconfiguredLabel: "needs QR login",
			configuredHint: "recommended · logged in",
			unconfiguredHint: "recommended · QR login",
			configuredScore: 1,
			unconfiguredScore: 15
		},
		credentials: [],
		delegatePrepare: true,
		delegateFinalize: true
	});
}
//#endregion
export { zalouserSetupAdapter as n, writeQrDataUrlToTempFile as r, createZalouserSetupWizardProxy as t };
