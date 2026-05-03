import { a as normalizeLowercaseStringOrEmpty, s as normalizeOptionalLowercaseString } from "./string-coerce-C1IzJjqi.js";
import { r as listSpeechProviders } from "./provider-registry-PU5o0GmJ.js";
import { rmSync } from "node:fs";
//#region src/tts/tts-provider-helpers.ts
const TEMP_FILE_CLEANUP_DELAY_MS = 300 * 1e3;
function requireInRange(value, min, max, label) {
	if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}`);
}
function normalizeLanguageCode(code) {
	const normalized = normalizeOptionalLowercaseString(code);
	if (!normalized) return;
	if (!/^[a-z]{2}$/.test(normalized)) throw new Error("languageCode must be a 2-letter ISO 639-1 code (e.g. en, de, fr)");
	return normalized;
}
function normalizeApplyTextNormalization(mode) {
	const normalized = normalizeOptionalLowercaseString(mode);
	if (!normalized) return;
	if (normalized === "auto" || normalized === "on" || normalized === "off") return normalized;
	throw new Error("applyTextNormalization must be one of: auto, on, off");
}
function normalizeSeed(seed) {
	if (seed == null) return;
	const next = Math.floor(seed);
	if (!Number.isFinite(next) || next < 0 || next > 4294967295) throw new Error("seed must be between 0 and 4294967295");
	return next;
}
function scheduleCleanup(tempDir, delayMs = TEMP_FILE_CLEANUP_DELAY_MS) {
	setTimeout(() => {
		try {
			rmSync(tempDir, {
				recursive: true,
				force: true
			});
		} catch {}
	}, delayMs).unref();
}
//#endregion
//#region src/tts/directives.ts
function buildProviderOrder(left, right) {
	const leftOrder = left.autoSelectOrder ?? Number.MAX_SAFE_INTEGER;
	const rightOrder = right.autoSelectOrder ?? Number.MAX_SAFE_INTEGER;
	if (leftOrder !== rightOrder) return leftOrder - rightOrder;
	return left.id.localeCompare(right.id);
}
function resolveDirectiveProviders(options) {
	if (options?.providers) return [...options.providers].toSorted(buildProviderOrder);
	return listSpeechProviders(options?.cfg).toSorted(buildProviderOrder);
}
function resolveDirectiveProviderConfig(provider, options) {
	return options?.providerConfigs?.[provider.id];
}
function prioritizeProvider(providers, providerId) {
	if (!providerId) return [...providers];
	const preferredProvider = providers.find((provider) => provider.id === providerId);
	if (!preferredProvider) return [...providers];
	return [preferredProvider, ...providers.filter((provider) => provider.id !== providerId)];
}
function parseTtsDirectives(text, policy, options) {
	if (!policy.enabled) return {
		cleanedText: text,
		overrides: {},
		warnings: [],
		hasDirective: false
	};
	if (!/\[\[tts:/iu.test(text)) return {
		cleanedText: text,
		overrides: {},
		warnings: [],
		hasDirective: false
	};
	let providers;
	const getProviders = () => {
		providers ??= resolveDirectiveProviders(options);
		return providers;
	};
	const overrides = {};
	const warnings = [];
	let cleanedText = text;
	let hasDirective = false;
	cleanedText = cleanedText.replace(/\[\[tts:text\]\]([\s\S]*?)\[\[\/tts:text\]\]/gi, (_match, inner) => {
		hasDirective = true;
		if (policy.allowText && overrides.ttsText == null) overrides.ttsText = inner.trim();
		return "";
	});
	cleanedText = cleanedText.replace(/\[\[tts:([^\]]+)\]\]/gi, (_match, body) => {
		hasDirective = true;
		const tokens = body.split(/\s+/).filter(Boolean);
		let declaredProviderId;
		if (policy.allowProvider) for (const token of tokens) {
			const eqIndex = token.indexOf("=");
			if (eqIndex === -1) continue;
			const rawKey = token.slice(0, eqIndex).trim();
			if (!rawKey || normalizeLowercaseStringOrEmpty(rawKey) !== "provider") continue;
			const rawValue = token.slice(eqIndex + 1).trim();
			if (!rawValue) continue;
			const providerId = normalizeLowercaseStringOrEmpty(rawValue);
			if (!providerId) {
				warnings.push("invalid provider id");
				continue;
			}
			declaredProviderId = providerId;
			overrides.provider = providerId;
		}
		let orderedProviders;
		const getOrderedProviders = () => {
			orderedProviders ??= prioritizeProvider(getProviders(), declaredProviderId ?? normalizeLowercaseStringOrEmpty(options?.preferredProviderId));
			return orderedProviders;
		};
		for (const token of tokens) {
			const eqIndex = token.indexOf("=");
			if (eqIndex === -1) continue;
			const rawKey = token.slice(0, eqIndex).trim();
			const rawValue = token.slice(eqIndex + 1).trim();
			if (!rawKey || !rawValue) continue;
			const key = normalizeLowercaseStringOrEmpty(rawKey);
			if (key === "provider") continue;
			for (const provider of getOrderedProviders()) {
				const parsed = provider.parseDirectiveToken?.({
					key,
					value: rawValue,
					policy,
					providerConfig: resolveDirectiveProviderConfig(provider, options),
					currentOverrides: overrides.providerOverrides?.[provider.id]
				});
				if (!parsed?.handled) continue;
				if (parsed.overrides) overrides.providerOverrides = {
					...overrides.providerOverrides,
					[provider.id]: {
						...overrides.providerOverrides?.[provider.id],
						...parsed.overrides
					}
				};
				if (parsed.warnings?.length) warnings.push(...parsed.warnings);
				break;
			}
		}
		return "";
	});
	return {
		cleanedText,
		ttsText: overrides.ttsText,
		hasDirective,
		overrides,
		warnings
	};
}
//#endregion
export { requireInRange as a, normalizeSeed as i, normalizeApplyTextNormalization as n, scheduleCleanup as o, normalizeLanguageCode as r, parseTtsDirectives as t };
