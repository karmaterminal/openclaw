import { g as GATEWAY_CLIENT_NAMES, h as GATEWAY_CLIENT_MODES } from "./message-channel-BEwkHNOF.js";
import { r as callGateway } from "./call-DzkfJoJS.js";
import { n as withProgress } from "./progress-xo8DGt3V.js";
//#region src/cli/nodes-cli/rpc.runtime.ts
async function callGatewayCliRuntime(method, opts, params, callOpts) {
	return await withProgress({
		label: `Nodes ${method}`,
		indeterminate: true,
		enabled: opts.json !== true
	}, async () => await callGateway({
		url: opts.url,
		token: opts.token,
		method,
		params,
		timeoutMs: callOpts?.transportTimeoutMs ?? Number(opts.timeout ?? 1e4),
		clientName: GATEWAY_CLIENT_NAMES.CLI,
		mode: GATEWAY_CLIENT_MODES.CLI
	}));
}
//#endregion
export { callGatewayCliRuntime };
