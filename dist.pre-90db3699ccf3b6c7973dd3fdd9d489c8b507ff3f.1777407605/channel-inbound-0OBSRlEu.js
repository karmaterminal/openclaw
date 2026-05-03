import { c as normalizeOptionalString } from "./string-coerce-CjxCKZ6B.js";
import { t as hasControlCommand } from "./command-detection-Bvmzs6L5.js";
import { n as resolveInboundDebounceMs, t as createInboundDebouncer } from "./inbound-debounce-DyGUB5Y8.js";
import "./mentions-C4SCO0eQ.js";
import "./direct-dm-Dk5TRXZO.js";
import "./session-envelope-TcviguuT.js";
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
