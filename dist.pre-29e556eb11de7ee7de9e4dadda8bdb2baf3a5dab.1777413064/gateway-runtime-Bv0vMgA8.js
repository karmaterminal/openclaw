import "./client-BbNZvLKI.js";
import "./operator-approvals-client-DyqKr1y_.js";
//#region src/gateway/channel-status-patches.ts
function createConnectedChannelStatusPatch(at = Date.now()) {
	return {
		connected: true,
		lastConnectedAt: at,
		lastEventAt: at
	};
}
function createTransportActivityStatusPatch(at = Date.now()) {
	return { lastTransportActivityAt: at };
}
//#endregion
export { createTransportActivityStatusPatch as n, createConnectedChannelStatusPatch as t };
