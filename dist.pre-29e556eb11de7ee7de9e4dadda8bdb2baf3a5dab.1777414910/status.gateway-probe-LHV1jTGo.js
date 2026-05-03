import { t as pickGatewaySelfPresence } from "./gateway-presence-Q5J93i_i.js";
import { t as resolveGatewayProbeTarget } from "./probe-target-CT9rdB6D.js";
import { r as resolveGatewayProbeAuthSafeWithSecretInputs } from "./probe-auth-B0A8hGjE.js";
//#region src/commands/status.gateway-probe.ts
async function resolveGatewayProbeAuthResolution(cfg) {
	return resolveGatewayProbeAuthSafeWithSecretInputs({
		cfg,
		mode: resolveGatewayProbeTarget(cfg).mode,
		env: process.env
	});
}
async function resolveGatewayProbeAuth(cfg) {
	return (await resolveGatewayProbeAuthResolution(cfg)).auth;
}
//#endregion
export { pickGatewaySelfPresence, resolveGatewayProbeAuth, resolveGatewayProbeAuthResolution };
