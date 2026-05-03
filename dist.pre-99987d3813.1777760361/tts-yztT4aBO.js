import { _ as ssrfPolicyFromHttpBaseUrlAllowedHostname } from "./ssrf-nwJHqKWi.js";
import { n as fetchWithSsrFGuard } from "./fetch-guard-I2SYZHil.js";
import { i as assertOkOrThrowProviderError } from "./provider-http-errors-DXrABZT1.js";
import "./ssrf-runtime-Bl9JVaAD.js";
import { i as requireInRange, n as normalizeLanguageCode, r as normalizeSeed, t as normalizeApplyTextNormalization } from "./tts-provider-helpers-DzrPuOND.js";
import "./provider-http-BPZpkWZd.js";
import "./speech-DuWbf18M.js";
import { n as isValidElevenLabsVoiceId, r as normalizeElevenLabsBaseUrl } from "./shared-D8-ndXP-.js";
//#region extensions/elevenlabs/tts.ts
function assertElevenLabsVoiceSettings(settings) {
	requireInRange(settings.stability, 0, 1, "stability");
	requireInRange(settings.similarityBoost, 0, 1, "similarityBoost");
	requireInRange(settings.style, 0, 1, "style");
	requireInRange(settings.speed, .5, 2, "speed");
}
function resolveElevenLabsAcceptHeader(outputFormat) {
	const normalized = outputFormat.trim().toLowerCase();
	if (!normalized || normalized.startsWith("mp3_")) return "audio/mpeg";
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
	const acceptHeader = resolveElevenLabsAcceptHeader(outputFormat);
	const { response, release } = await fetchWithSsrFGuard({
		url: url.toString(),
		init: {
			method: "POST",
			headers: {
				"xi-api-key": apiKey,
				"Content-Type": "application/json",
				...acceptHeader ? { Accept: acceptHeader } : {}
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
