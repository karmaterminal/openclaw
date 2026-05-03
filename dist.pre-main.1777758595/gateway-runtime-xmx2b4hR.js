import "./net-D2ag99RA.js";
import "./auth-CxszTMg5.js";
import "./client-CtrkocR-.js";
import "./protocol-CPVH8nrf.js";
import "./operator-approvals-client-fyciWKeP.js";
import "./gateway-rpc-O7AJpLTx.js";
import "./node-command-policy-B6J6PJYX.js";
import "./nodes.helpers-CaPgJk2q.js";
import "./startup-auth-Cm40zypB.js";
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
