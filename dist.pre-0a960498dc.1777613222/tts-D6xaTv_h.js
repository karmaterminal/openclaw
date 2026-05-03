import { g as ssrfPolicyFromHttpBaseUrlAllowedHostname } from "./ssrf-Bg0Ww888.js";
import { n as fetchWithSsrFGuard } from "./fetch-guard-5Cmu0jDX.js";
import { i as assertOkOrThrowProviderError } from "./provider-http-errors-CU4Q5zhM.js";
import "./ssrf-runtime-C0QYuNB-.js";
import { a as requireInRange, i as normalizeSeed, n as normalizeApplyTextNormalization, r as normalizeLanguageCode } from "./directives-Dgzf-Urk.js";
import "./provider-http-DN4Xp0cK.js";
import "./speech-BBtakiz4.js";
import { n as isValidElevenLabsVoiceId, r as normalizeElevenLabsBaseUrl } from "./shared-CKw4Y_zy.js";
//#region extensions/elevenlabs/tts.ts
function assertElevenLabsVoiceSettings(settings) {
	requireInRange(settings.stability, 0, 1, "stability");
	requireInRange(settings.similarityBoost, 0, 1, "similarityBoost");
	requireInRange(settings.style, 0, 1, "style");
	requireInRange(settings.speed, .5, 2, "speed");
}
async function elevenLabsTTS(params) {
	const { text, apiKey, baseUrl, voiceId, modelId, outputFormat, seed, applyTextNormalization, languageCode, latencyTier, voiceSettings, timeoutMs } = params;
	if (!isValidElevenLabsVoiceId(voiceId)) throw new Error("Invalid voiceId format");
	assertElevenLabsVoiceSettings(voiceSettings);
	const normalizedLanguage = normalizeLanguageCode(languageCode);
	const normalizedNormalization = normalizeApplyTextNormalization(applyTextNormalization);
	const normalizedSeed = normalizeSeed(seed);
	const normalizedBaseUrl = normalizeElevenLabsBaseUrl(baseUrl);
	const url = new URL(`${normalizedBaseUrl}/v1/text-to-speech/${voiceId}`);
	if (outputFormat) url.searchParams.set("output_format", outputFormat);
	const { response, release } = await fetchWithSsrFGuard({
		url: url.toString(),
		init: {
			method: "POST",
			headers: {
				"xi-api-key": apiKey,
				"Content-Type": "application/json",
				Accept: "audio/mpeg"
			},
			body: JSON.stringify({
				text,
				model_id: modelId,
				seed: normalizedSeed,
				apply_text_normalization: normalizedNormalization,
				language_code: normalizedLanguage,
				latency_optimization_level: latencyTier,
				voice_settings: {
					stability: voiceSettings.stability,
					similarity_boost: voiceSettings.similarityBoost,
					style: voiceSettings.style,
					use_speaker_boost: voiceSettings.useSpeakerBoost,
					speed: voiceSettings.speed
				}
			})
		},
		timeoutMs,
		policy: ssrfPolicyFromHttpBaseUrlAllowedHostname(normalizedBaseUrl),
		auditContext: "elevenlabs.tts"
	});
	try {
		await assertOkOrThrowProviderError(response, "ElevenLabs API error");
		return Buffer.from(await response.arrayBuffer());
	} finally {
		await release();
	}
}
//#endregion
export { elevenLabsTTS as t };
