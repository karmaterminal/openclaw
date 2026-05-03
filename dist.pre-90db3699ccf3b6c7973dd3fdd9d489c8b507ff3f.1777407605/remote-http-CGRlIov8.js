import { g as ssrfPolicyFromHttpBaseUrlAllowedHostname } from "./ssrf-CTA9WgMa.js";
import { n as fetchWithSsrFGuard } from "./fetch-guard-NDEizKJq.js";
//#region src/memory-host-sdk/host/remote-http.ts
const buildRemoteBaseUrlPolicy = ssrfPolicyFromHttpBaseUrlAllowedHostname;
async function withRemoteHttpResponse(params) {
	const { response, release } = await fetchWithSsrFGuard({
		url: params.url,
		fetchImpl: params.fetchImpl,
		init: params.init,
		policy: params.ssrfPolicy,
		auditContext: params.auditContext ?? "memory-remote"
	});
	try {
		return await params.onResponse(response);
	} finally {
		await release();
	}
}
//#endregion
export { withRemoteHttpResponse as n, buildRemoteBaseUrlPolicy as t };
