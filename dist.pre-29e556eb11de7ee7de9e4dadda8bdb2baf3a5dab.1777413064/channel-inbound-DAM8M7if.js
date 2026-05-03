import { c as normalizeOptionalString } from "./string-coerce-C1IzJjqi.js";
import { t as hasControlCommand } from "./command-detection-BYHSYyUa.js";
import { n as resolveInboundDebounceMs, t as createInboundDebouncer } from "./inbound-debounce-D1NxHcy4.js";
import "./mentions-uwZ9eLDX.js";
import "./direct-dm-BAugAuRM.js";
import "./session-envelope-DGAeDCck.js";
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
