import { i as formatErrorMessage } from "./errors-Jbvi20TW.js";
import "./text-runtime-CCRXVz_8.js";
import { t as withTimeout } from "./with-timeout-BLO46Tbl.js";
import "./error-runtime-E9_tudSN.js";
import { t as MessagingApiClient } from "./messagingApiClient--0hCz_23.js";
//#region extensions/line/src/probe.ts
async function probeLineBot(channelAccessToken, timeoutMs = 5e3) {
	if (!channelAccessToken?.trim()) return {
		ok: false,
		error: "Channel access token not configured"
	};
	const client = new MessagingApiClient({ channelAccessToken: channelAccessToken.trim() });
	try {
		const profile = await withTimeout(client.getBotInfo(), timeoutMs);
		return {
			ok: true,
			bot: {
				displayName: profile.displayName,
				userId: profile.userId,
				basicId: profile.basicId,
				pictureUrl: profile.pictureUrl
			}
		};
	} catch (err) {
		return {
			ok: false,
			error: formatErrorMessage(err)
		};
	}
}
//#endregion
export { probeLineBot as t };
