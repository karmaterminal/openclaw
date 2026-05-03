import { t as GatewayClient } from "../client-BzXrq-Vi.js";
import { n as withOperatorApprovalsGatewayClient, t as createOperatorApprovalsGatewayClient } from "../operator-approvals-client-BLZOwDhy.js";
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
export { GatewayClient, createConnectedChannelStatusPatch, createOperatorApprovalsGatewayClient, createTransportActivityStatusPatch, withOperatorApprovalsGatewayClient };
