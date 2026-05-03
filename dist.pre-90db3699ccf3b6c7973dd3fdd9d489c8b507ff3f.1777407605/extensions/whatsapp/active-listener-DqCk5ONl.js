import { p as resolveDefaultWhatsAppAccountId } from "./text-runtime-pSZYjiCV.js";
import { t as getRegisteredWhatsAppConnectionController } from "./connection-controller-registry-kxS24Rzm.js";
//#region extensions/whatsapp/src/active-listener.ts
function resolveWebAccountId(params) {
	return (params.accountId ?? "").trim() || resolveDefaultWhatsAppAccountId(params.cfg);
}
function getActiveWebListener(accountId) {
	return getRegisteredWhatsAppConnectionController(accountId)?.getActiveListener() ?? null;
}
//#endregion
export { resolveWebAccountId as n, getActiveWebListener as t };
