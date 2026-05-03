import { c as normalizeOptionalString } from "./string-coerce-C1IzJjqi.js";
import { t as hasControlCommand } from "./command-detection-BGns1hGQ.js";
import { n as resolveInboundDebounceMs, t as createInboundDebouncer } from "./inbound-debounce-CDs77Bt6.js";
import "./mentions-BHH2Bzns.js";
import "./direct-dm-CbCX0P49.js";
import "./session-envelope-DEzAABRA.js";
//#region src/channels/inbound-debounce-policy.ts
function shouldDebounceTextInbound(params) {
	if (params.allowDebounce === false) return false;
	if (params.hasMedia) return false;
	const text = normalizeOptionalString(params.text) ?? "";
	if (!text) return false;
	return !hasControlCommand(text, params.cfg, params.commandOptions);
}
function createChannelInboundDebouncer(params) {
	const debounceMs = resolveInboundDebounceMs({
		cfg: params.cfg,
		channel: params.channel,
		overrideMs: params.debounceMsOverride
	});
	const { cfg: _cfg, channel: _channel, debounceMsOverride: _override, ...rest } = params;
	return {
		debounceMs,
		debouncer: createInboundDebouncer({
			debounceMs,
			...rest
		})
	};
}
//#endregion
export { shouldDebounceTextInbound as n, createChannelInboundDebouncer as t };
