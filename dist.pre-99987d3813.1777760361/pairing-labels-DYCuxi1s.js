import { f as getPairingAdapter } from "./pairing-store-Dn7XE0de.js";
//#region src/pairing/pairing-labels.ts
function resolvePairingIdLabel(channel) {
	return getPairingAdapter(channel)?.idLabel ?? "userId";
}
//#endregion
export { resolvePairingIdLabel as t };
