import { a as normalizeLowercaseStringOrEmpty } from "./string-coerce-CjxCKZ6B.js";
import { t as createSubsystemLogger } from "./subsystem-CJBoMDt5.js";
import "./zod-schema.sensitive-B92jMOck.js";
import { n as hasSensitiveUrlHintTag, o as redactSensitiveUrlLikeString, r as isSensitiveUrlConfigPath, t as SENSITIVE_URL_HINT_TAG } from "./redact-sensitive-url-CUAlaYqg.js";
import { n as redactSecretRefId, t as isSecretRefShape } from "./redact-snapshot.secret-ref-BKDNNctx.js";
import { isDeepStrictEqual } from "node:util";
import JSON5 from "json5";
import "zod";
//#region src/config/redact-snapshot.raw.ts
function replaceSensitiveValuesInRaw(params) {
	const values = [...new Set(params.sensitiveValues)].filter((value) => value !== "").toSorted((a, b) => b.length - a.length);
	let result = params.raw;
	for (const value of values) result = result.replaceAll(value, params.redactedSentinel);
	return result;
}
function shouldFallbackToStructuredRawRedaction(params) {
	try {
		const parsed = JSON5.parse(params.redactedRaw);
		const restored = params.restoreParsed(parsed);
		if (!restored.ok) return true;
		return !isDeepStrictEqual(restored.result, params.originalConfig);
	} catch {
		return true;
	}
}
//#endregion
//#region src/config/media-audio-field-metadata.ts
const MEDIA_AUDIO_FIELD_HELP = {
	"tools.media.audio.enabled": "Enable audio understanding so voice notes or audio clips can be transcribed/summarized for agent context. Disable when audio ingestion is outside policy or unnecessary for your workflows.",
	"tools.media.audio.maxBytes": "Maximum accepted audio payload size in bytes before processing is rejected or clipped by policy. Set this based on expected recording length and upstream provider limits.",
	"tools.media.audio.maxChars": "Maximum characters retained from audio understanding output to prevent oversized transcript injection. Increase for long-form dictation, or lower to keep conversational turns compact.",
	"tools.media.audio.prompt": "Instruction template guiding audio understanding output style, such as concise summary versus near-verbatim transcript. Keep wording consistent so downstream automations can rely on output format.",
	"tools.media.audio.timeoutSeconds": "Timeout in seconds for audio understanding execution before the operation is cancelled. Use longer timeouts for long recordings and tighter ones for interactive chat responsiveness.",
	"tools.media.audio.language": "Preferred language hint for audio understanding/transcription when provider support is available. Set this to improve recognition accuracy for known primary languages.",
	"tools.media.audio.attachments": "Attachment policy for audio inputs indicating which uploaded files are eligible for audio processing. Keep restrictive defaults in mixed-content channels to avoid unintended audio workloads.",
	"tools.media.audio.models": "Ordered model preferences specifically for audio understanding, used before shared media model fallback. Choose models optimized for transcription quality in your primary language/domain.",
	"tools.media.audio.scope": "Scope selector for when audio understanding runs across inbound messages and attachments. Keep focused scopes in high-volume channels to reduce cost and avoid accidental transcription.",
	"tools.media.audio.echoTranscript": "Echo the audio transcript back to the originating chat before agent processing. When enabled, users immediately see what was heard from their voice note, helping them verify transcription accuracy before the agent acts on it. Default: false.",
	"tools.media.audio.echoFormat": "Format string for the echoed transcript message. Use `{transcript}` as a placeholder for the transcribed text. Default: '📝 \"{transcript}\"'.",
	"tools.media.audio.request": "Low-level HTTP request overrides for audio providers, including custom headers, auth, proxy routing, and TLS client settings. Use this for proxy-backed or self-hosted transcription endpoints when plain baseUrl/apiKey fields are not enough.",
	"tools.media.audio.request.headers": "Additional HTTP headers merged into audio provider requests after provider defaults. Use this for tenant routing or proxy integration headers, and keep secrets in env-backed values.",
	"tools.media.audio.request.auth": "Optional auth override for audio provider requests. Use this when the upstream expects a non-default bearer token or custom auth header shape.",
	"tools.media.audio.request.auth.mode": "Auth override mode for audio requests: \"provider-default\" keeps the normal provider auth, \"authorization-bearer\" forces an Authorization bearer token, and \"header\" sends a custom header/value pair.",
	"tools.media.audio.request.auth.token": "Bearer token used when audio request auth.mode is authorization-bearer. Keep this in secret storage rather than inline config.",
	"tools.media.audio.request.auth.headerName": "Header name used when audio request auth.mode is header. Match the exact upstream expectation, such as x-api-key or authorization.",
	"tools.media.audio.request.auth.value": "Header value used when audio request auth.mode is header. Keep secrets in env-backed values and avoid duplicating provider-default auth unnecessarily.",
	"tools.media.audio.request.auth.prefix": "Optional prefix prepended to the custom auth header value, such as Bearer. Leave unset when the upstream expects the raw credential only.",
	"tools.media.audio.request.proxy": "Proxy transport override for audio requests. Use env-proxy to respect process proxy settings, or explicit-proxy to force a dedicated proxy URL for this provider path.",
	"tools.media.audio.request.proxy.mode": "Proxy mode for audio requests: \"env-proxy\" uses environment proxy settings, while \"explicit-proxy\" uses the configured proxy URL only for this request path.",
	"tools.media.audio.request.proxy.url": "Explicit proxy URL for audio provider traffic when proxy.mode is explicit-proxy. Keep credentials out of inline URLs when possible and prefer secret-backed env injection.",
	"tools.media.audio.request.proxy.tls": "TLS settings applied when connecting to the configured audio proxy, such as custom CA trust for an internal proxy gateway.",
	"tools.media.audio.request.tls": "Direct TLS client settings for audio provider requests, including custom CA trust, client certs, or SNI overrides for managed gateways and internal endpoints."
};
const MEDIA_AUDIO_FIELD_LABELS = {
	"tools.media.audio.enabled": "Enable Audio Understanding",
	"tools.media.audio.maxBytes": "Audio Understanding Max Bytes",
	"tools.media.audio.maxChars": "Audio Understanding Max Chars",
	"tools.media.audio.prompt": "Audio Understanding Prompt",
	"tools.media.audio.timeoutSeconds": "Audio Understanding Timeout (sec)",
	"tools.media.audio.language": "Audio Understanding Language",
	"tools.media.audio.attachments": "Audio Understanding Attachment Policy",
	"tools.media.audio.models": "Audio Understanding Models",
	"tools.media.audio.scope": "Audio Understanding Scope",
	"tools.media.audio.echoTranscript": "Echo Transcript to Chat",
	"tools.media.audio.echoFormat": "Transcript Echo Format",
	"tools.media.audio.request": "Audio Request Overrides",
	"tools.media.audio.request.headers": "Audio Request Headers",
	"tools.media.audio.request.auth": "Audio Request Auth Override",
	"tools.media.audio.request.auth.mode": "Audio Request Auth Mode",
	"tools.media.audio.request.auth.token": "Audio Request Bearer Token",
	"tools.media.audio.request.auth.headerName": "Audio Request Auth Header Name",
	"tools.media.audio.request.auth.value": "Audio Request Auth Header Value",
	"tools.media.audio.request.auth.prefix": "Audio Request Auth Header Prefix",
	"tools.media.audio.request.proxy": "Audio Request Proxy",
	"tools.media.audio.request.proxy.mode": "Audio Request Proxy Mode",
	"tools.media.audio.request.proxy.url": "Audio Request Proxy URL",
	"tools.media.audio.request.proxy.tls": "Audio Request Proxy TLS",
	"tools.media.audio.request.tls": "Audio Request TLS"
};
//#endregion
//#region src/config/talk-defaults.ts
const TALK_SILENCE_TIMEOUT_MS_BY_PLATFORM = {
	macos: 700,
	android: 700,
	ios: 900
};
function describeTalkSilenceTimeoutDefaults() {
	return `${TALK_SILENCE_TIMEOUT_MS_BY_PLATFORM.macos} ms on macOS and Android, ${TALK_SILENCE_TIMEOUT_MS_BY_PLATFORM.ios} ms on iOS`;
}
`${describeTalkSilenceTimeoutDefaults()}`, { ...MEDIA_AUDIO_FIELD_HELP };
({ ...MEDIA_AUDIO_FIELD_LABELS });
//#endregion
//#region src/config/schema.tags.ts
const CONFIG_TAGS = [
	"security",
	"auth",
	"network",
	"access",
	"privacy",
	"observability",
	"performance",
	"reliability",
	"storage",
	"models",
	"media",
	"automation",
	"channels",
	"tools",
	"advanced"
];
const TAG_PRIORITY = {
	security: 0,
	auth: 1,
	access: 2,
	network: 3,
	privacy: 4,
	observability: 5,
	reliability: 6,
	performance: 7,
	storage: 8,
	models: 9,
	media: 10,
	automation: 11,
	channels: 12,
	tools: 13,
	advanced: 14
};
const TAG_OVERRIDES = {
	"gateway.auth.token": [
		"security",
		"auth",
		"access",
		"network"
	],
	"gateway.auth.password": [
		"security",
		"auth",
		"access",
		"network"
	],
	"gateway.push.apns.relay.baseUrl": ["network", "advanced"],
	"gateway.controlUi.embedSandbox": [
		"security",
		"access",
		"advanced"
	],
	"gateway.controlUi.allowExternalEmbedUrls": [
		"security",
		"access",
		"network",
		"advanced"
	],
	"gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback": [
		"security",
		"access",
		"network",
		"advanced"
	],
	"gateway.controlUi.dangerouslyDisableDeviceAuth": [
		"security",
		"access",
		"network",
		"advanced"
	],
	"gateway.controlUi.allowInsecureAuth": [
		"security",
		"access",
		"network",
		"advanced"
	],
	"tools.exec.applyPatch.workspaceOnly": [
		"tools",
		"security",
		"access",
		"advanced"
	]
};
const PREFIX_RULES = [
	{
		prefix: "channels.",
		tags: ["channels", "network"]
	},
	{
		prefix: "tools.",
		tags: ["tools"]
	},
	{
		prefix: "gateway.",
		tags: ["network"]
	},
	{
		prefix: "nodehost.",
		tags: ["network"]
	},
	{
		prefix: "discovery.",
		tags: ["network"]
	},
	{
		prefix: "auth.",
		tags: ["auth", "access"]
	},
	{
		prefix: "memory.",
		tags: ["storage"]
	},
	{
		prefix: "models.",
		tags: ["models"]
	},
	{
		prefix: "diagnostics.",
		tags: ["observability"]
	},
	{
		prefix: "logging.",
		tags: ["observability"]
	},
	{
		prefix: "cron.",
		tags: ["automation"]
	},
	{
		prefix: "talk.",
		tags: ["media"]
	},
	{
		prefix: "audio.",
		tags: ["media"]
	}
];
const KEYWORD_RULES = [
	{
		pattern: /(token|password|secret|api[_.-]?key|tlsfingerprint)/i,
		tags: ["security", "auth"]
	},
	{
		pattern: /(allow|deny|owner|permission|policy|access)/i,
		tags: ["access"]
	},
	{
		pattern: /(timeout|debounce|interval|concurrency|max|limit|cachettl)/i,
		tags: ["performance"]
	},
	{
		pattern: /(retry|backoff|fallback|circuit|health|reload|probe)/i,
		tags: ["reliability"]
	},
	{
		pattern: /(path|dir|file|store|db|session|cache)/i,
		tags: ["storage"]
	},
	{
		pattern: /(telemetry|trace|metrics|logs|diagnostic)/i,
		tags: ["observability"]
	},
	{
		pattern: /(experimental|dangerously|insecure)/i,
		tags: ["advanced", "security"]
	},
	{
		pattern: /(privacy|redact|sanitize|anonym|pseudonym)/i,
		tags: ["privacy"]
	}
];
const MODEL_PATH_PATTERN = /(^|\.)(model|models|modelid|imagemodel)(\.|$)/i;
const MEDIA_PATH_PATTERN = /(tools\.media\.|^audio\.|^talk\.|image|video|stt|tts)/i;
const AUTOMATION_PATH_PATTERN = /(cron|heartbeat|schedule|onstart|watchdebounce)/i;
const AUTH_KEYWORD_PATTERN = /(token|password|secret|api[_.-]?key|credential|oauth)/i;
function normalizeTag(tag) {
	const normalized = normalizeLowercaseStringOrEmpty(tag);
	return CONFIG_TAGS.includes(normalized) ? normalized : null;
}
function normalizeTags(tags) {
	const out = /* @__PURE__ */ new Set();
	for (const tag of tags) {
		const normalized = normalizeTag(tag);
		if (normalized) out.add(normalized);
	}
	return [...out].toSorted((a, b) => TAG_PRIORITY[a] - TAG_PRIORITY[b]);
}
function collectUnknownTags(tags) {
	const out = /* @__PURE__ */ new Set();
	for (const tag of tags) {
		const normalized = normalizeLowercaseStringOrEmpty(tag);
		if (!normalized || normalizeTag(normalized)) continue;
		out.add(normalized);
	}
	return [...out];
}
function patternToRegExp(pattern) {
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^.]+");
	return new RegExp(`^${escaped}$`, "i");
}
function resolveOverride(path) {
	const direct = TAG_OVERRIDES[path];
	if (direct) return direct;
	for (const [pattern, tags] of Object.entries(TAG_OVERRIDES)) {
		if (!pattern.includes("*")) continue;
		if (patternToRegExp(pattern).test(path)) return tags;
	}
}
function addTags(set, tags) {
	for (const tag of tags) set.add(tag);
}
function deriveTagsForPath(path, hint) {
	const lowerPath = normalizeLowercaseStringOrEmpty(path);
	const override = resolveOverride(path);
	if (override) return normalizeTags(override);
	const tags = /* @__PURE__ */ new Set();
	for (const rule of PREFIX_RULES) if (lowerPath.startsWith(rule.prefix)) addTags(tags, rule.tags);
	for (const rule of KEYWORD_RULES) if (rule.pattern.test(path)) addTags(tags, rule.tags);
	if (MODEL_PATH_PATTERN.test(path)) tags.add("models");
	if (MEDIA_PATH_PATTERN.test(path)) tags.add("media");
	if (AUTOMATION_PATH_PATTERN.test(path)) tags.add("automation");
	if (hint?.sensitive) {
		tags.add("security");
		if (AUTH_KEYWORD_PATTERN.test(path)) tags.add("auth");
	}
	if (hint?.advanced) tags.add("advanced");
	if (tags.size === 0) tags.add("advanced");
	return normalizeTags([...tags]);
}
function applyDerivedTags(hints) {
	const next = {};
	for (const [path, hint] of Object.entries(hints)) {
		const existingTags = Array.isArray(hint?.tags) ? hint.tags : [];
		const tags = [...normalizeTags([...deriveTagsForPath(path, hint), ...existingTags]), ...collectUnknownTags(existingTags)];
		next[path] = {
			...hint,
			tags
		};
	}
	return next;
}
//#endregion
//#region src/config/schema.hints.ts
const NORMALIZED_SENSITIVE_KEY_WHITELIST_SUFFIXES = [
	"maxtokens",
	"maxoutputtokens",
	"maxinputtokens",
	"maxcompletiontokens",
	"contexttokens",
	"totaltokens",
	"tokencount",
	"tokenlimit",
	"tokenbudget",
	"passwordFile"
].map((suffix) => normalizeLowercaseStringOrEmpty(suffix));
const SENSITIVE_PATTERNS = [
	/token$/i,
	/password/i,
	/secret/i,
	/api.?key/i,
	/encrypt.?key/i,
	/private.?key/i,
	/serviceaccount(?:ref)?$/i
];
function isWhitelistedSensitivePath(path) {
	const lowerPath = normalizeLowercaseStringOrEmpty(path);
	return NORMALIZED_SENSITIVE_KEY_WHITELIST_SUFFIXES.some((suffix) => lowerPath.endsWith(suffix));
}
function matchesSensitivePattern(path) {
	return SENSITIVE_PATTERNS.some((pattern) => pattern.test(path));
}
function isSensitiveConfigPath(path) {
	return !isWhitelistedSensitivePath(path) && matchesSensitivePattern(path);
}
function applySensitiveHints(hints, allowedKeys) {
	const next = { ...hints };
	const keys = allowedKeys ? [...allowedKeys] : Object.keys(next);
	for (const key of keys) {
		const current = next[key];
		if (current?.sensitive !== void 0) continue;
		if (isSensitiveConfigPath(key)) next[key] = {
			...current,
			sensitive: true
		};
	}
	return next;
}
function applySensitiveUrlHints(hints, allowedKeys) {
	const next = { ...hints };
	const keys = allowedKeys ? [...allowedKeys] : Object.keys(next);
	for (const key of keys) {
		if (!isSensitiveUrlConfigPath(key)) continue;
		const current = next[key];
		const tags = new Set(current?.tags ?? []);
		tags.add(SENSITIVE_URL_HINT_TAG);
		next[key] = {
			...current,
			tags: [...tags]
		};
	}
	return next;
}
//#endregion
//#region src/config/redact-snapshot.ts
const log = createSubsystemLogger("config/redaction");
const ENV_VAR_PLACEHOLDER_PATTERN = /^\$\{[^}]*\}$/;
function isSensitivePath(path) {
	if (path.endsWith("[]")) return isSensitiveConfigPath(path.slice(0, -2));
	return isSensitiveConfigPath(path);
}
function isEnvVarPlaceholder(value) {
	return ENV_VAR_PLACEHOLDER_PATTERN.test(value.trim());
}
function isWholeObjectSensitivePath(path) {
	const lowered = normalizeLowercaseStringOrEmpty(path);
	return lowered.endsWith("serviceaccount") || lowered.endsWith("serviceaccountref");
}
function isSensitiveUrlPath(path) {
	return isSensitiveUrlConfigPath(path);
}
function hasSensitiveUrlHintPath(hints, paths) {
	if (!hints) return false;
	return paths.some((path) => hasSensitiveUrlHintTag(hints[path]));
}
function isObjectRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function collectSensitiveStrings(value, values) {
	if (typeof value === "string") {
		if (!isEnvVarPlaceholder(value)) values.push(value);
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectSensitiveStrings(item, values);
		return;
	}
	if (isObjectRecord(value)) {
		const obj = value;
		if (isSecretRefShape(obj)) {
			if (!isEnvVarPlaceholder(obj.id)) values.push(obj.id);
			return;
		}
		for (const item of Object.values(obj)) collectSensitiveStrings(item, values);
	}
}
function isExplicitlyNonSensitivePath(hints, paths) {
	if (!hints) return false;
	return paths.some((path) => hints[path]?.sensitive === false);
}
/**
* Sentinel value used to replace sensitive config fields in gateway responses.
* Write-side handlers (config.set, config.apply, config.patch) detect this
* sentinel and restore the original value from the on-disk config, so a
* round-trip through the Web UI does not corrupt credentials.
*/
const REDACTED_SENTINEL = "__OPENCLAW_REDACTED__";
function isSecretRefWithProvider(value) {
	return isSecretRefShape(value) && typeof value.provider === "string";
}
function buildRedactionLookup(hints) {
	let result = /* @__PURE__ */ new Set();
	for (const [path, hint] of Object.entries(hints)) {
		if (!hint.sensitive) continue;
		const parts = path.split(".");
		let joinedPath = parts.shift() ?? "";
		result.add(joinedPath);
		if (joinedPath.endsWith("[]")) result.add(joinedPath.slice(0, -2));
		for (const part of parts) {
			if (part.endsWith("[]")) result.add(`${joinedPath}.${part.slice(0, -2)}`);
			joinedPath = `${joinedPath}.${part}`;
			result.add(joinedPath);
		}
	}
	if (result.size !== 0) result.add("");
	return result;
}
function redactObject(obj, hints) {
	if (hints) {
		const lookup = buildRedactionLookup(hints);
		return lookup.has("") ? redactObjectWithLookup(obj, lookup, "", [], hints) : redactObjectGuessing(obj, "", [], hints);
	}
	return redactObjectGuessing(obj, "", []);
}
/**
* Collect all sensitive string values from a config object.
* Used for text-based redaction of the raw JSON5 source.
*/
function collectSensitiveValues(obj, hints) {
	const result = [];
	if (hints) {
		const lookup = buildRedactionLookup(hints);
		if (lookup.has("")) redactObjectWithLookup(obj, lookup, "", result, hints);
		else redactObjectGuessing(obj, "", result, hints);
	} else redactObjectGuessing(obj, "", result);
	return result;
}
/**
* Worker for redactObject() and collectSensitiveValues().
* Used when there are ConfigUiHints available.
*/
function redactObjectWithLookup(obj, lookup, prefix, values, hints) {
	if (obj === null || obj === void 0) return obj;
	if (Array.isArray(obj)) {
		const path = `${prefix}[]`;
		if (!lookup.has(path)) return redactObjectGuessing(obj, prefix, values, hints);
		return obj.map((item) => {
			if (typeof item === "string" && !isEnvVarPlaceholder(item)) {
				values.push(item);
				return REDACTED_SENTINEL;
			}
			return redactObjectWithLookup(item, lookup, path, values, hints);
		});
	}
	if (isObjectRecord(obj)) {
		const result = {};
		for (const [key, value] of Object.entries(obj)) {
			const path = prefix ? `${prefix}.${key}` : key;
			const wildcardPath = prefix ? `${prefix}.*` : "*";
			let matched = false;
			for (const candidate of [path, wildcardPath]) {
				result[key] = value;
				if (lookup.has(candidate)) {
					matched = true;
					if (typeof value === "string" && !isEnvVarPlaceholder(value)) {
						result[key] = REDACTED_SENTINEL;
						values.push(value);
					} else if (typeof value === "object" && value !== null) if (hints[candidate]?.sensitive === true && !Array.isArray(value)) {
						const objectValue = toObjectRecord(value);
						if (isSecretRefShape(objectValue)) result[key] = redactSecretRefId({
							value: objectValue,
							values,
							redactedSentinel: REDACTED_SENTINEL,
							isEnvVarPlaceholder
						});
						else {
							collectSensitiveStrings(objectValue, values);
							result[key] = REDACTED_SENTINEL;
						}
					} else result[key] = redactObjectWithLookup(value, lookup, candidate, values, hints);
					else if (hints[candidate]?.sensitive === true && value !== void 0 && value !== null) result[key] = REDACTED_SENTINEL;
					else if (typeof value === "string" && (hasSensitiveUrlHintPath(hints, [
						candidate,
						path,
						wildcardPath
					]) || isSensitiveUrlPath(path))) if (redactSensitiveUrlLikeString(value) !== value) {
						values.push(value);
						result[key] = REDACTED_SENTINEL;
					} else result[key] = value;
					break;
				}
			}
			if (!matched) {
				const markedNonSensitive = isExplicitlyNonSensitivePath(hints, [path, wildcardPath]);
				if (typeof value === "string" && !markedNonSensitive && isSensitivePath(path) && !isEnvVarPlaceholder(value)) {
					result[key] = REDACTED_SENTINEL;
					values.push(value);
				} else if (typeof value === "string" && (hasSensitiveUrlHintPath(hints, [path, wildcardPath]) || isSensitiveUrlPath(path))) if (redactSensitiveUrlLikeString(value) !== value) {
					values.push(value);
					result[key] = REDACTED_SENTINEL;
				} else result[key] = value;
				else if (typeof value === "object" && value !== null) result[key] = redactObjectGuessing(value, path, values, hints);
			}
		}
		return result;
	}
	return obj;
}
/**
* Worker for redactObject() and collectSensitiveValues().
* Used when ConfigUiHints are NOT available.
*/
function redactObjectGuessing(obj, prefix, values, hints) {
	if (obj === null || obj === void 0) return obj;
	if (Array.isArray(obj)) return obj.map((item) => {
		const path = `${prefix}[]`;
		if (!isExplicitlyNonSensitivePath(hints, [path]) && isSensitivePath(path) && typeof item === "string" && !isEnvVarPlaceholder(item)) {
			values.push(item);
			return REDACTED_SENTINEL;
		}
		return redactObjectGuessing(item, path, values, hints);
	});
	if (isObjectRecord(obj)) {
		const result = {};
		for (const [key, value] of Object.entries(obj)) {
			const dotPath = prefix ? `${prefix}.${key}` : key;
			const wildcardPath = prefix ? `${prefix}.*` : "*";
			if (!isExplicitlyNonSensitivePath(hints, [dotPath, wildcardPath]) && isSensitivePath(dotPath) && typeof value === "string" && !isEnvVarPlaceholder(value)) {
				result[key] = REDACTED_SENTINEL;
				values.push(value);
			} else if (!isExplicitlyNonSensitivePath(hints, [dotPath, wildcardPath]) && isSensitivePath(dotPath) && isWholeObjectSensitivePath(dotPath) && value && typeof value === "object" && !Array.isArray(value)) {
				collectSensitiveStrings(value, values);
				result[key] = REDACTED_SENTINEL;
			} else if (typeof value === "string" && (hasSensitiveUrlHintPath(hints, [dotPath, wildcardPath]) || isSensitiveUrlPath(dotPath))) if (redactSensitiveUrlLikeString(value) !== value) {
				values.push(value);
				result[key] = REDACTED_SENTINEL;
			} else result[key] = value;
			else if (typeof value === "object" && value !== null) result[key] = redactObjectGuessing(value, dotPath, values, hints);
			else result[key] = value;
		}
		return result;
	}
	return obj;
}
/**
* Replace known sensitive values in a raw JSON5 string with the sentinel.
* Values are replaced longest-first to avoid partial matches.
*/
function redactRawText(raw, config, hints) {
	return replaceSensitiveValuesInRaw({
		raw,
		sensitiveValues: collectSensitiveValues(config, hints),
		redactedSentinel: REDACTED_SENTINEL
	});
}
let suppressRestoreWarnings = false;
function withRestoreWarningsSuppressed(fn) {
	const prev = suppressRestoreWarnings;
	suppressRestoreWarnings = true;
	try {
		return fn();
	} finally {
		suppressRestoreWarnings = prev;
	}
}
/**
* Returns a copy of the config snapshot with all sensitive fields
* replaced by {@link REDACTED_SENTINEL}. The `hash` is preserved
* (it tracks config identity, not content).
*
* Both `config` (the parsed object) and `raw` (the JSON5 source) are scrubbed
* so no credential can leak through either path.
*
* When `uiHints` are provided, sensitivity is determined from the schema hints.
* Without hints, falls back to regex-based detection via `isSensitivePath()`.
*/
/**
* Redact sensitive fields from a plain config object (not a full snapshot).
* Used by write endpoints (config.set, config.patch, config.apply) to avoid
* leaking credentials in their responses.
*/
function redactConfigObject(value, uiHints) {
	return redactObject(value, uiHints);
}
function redactConfigSnapshot(snapshot, uiHints) {
	if (!snapshot.valid) {
		const redactedConfig = {};
		const redactedResolved = {};
		return {
			...snapshot,
			sourceConfig: redactedResolved,
			runtimeConfig: redactedConfig,
			config: redactedConfig,
			raw: null,
			parsed: null,
			resolved: redactedResolved
		};
	}
	const redactedConfig = redactObject(snapshot.config, uiHints);
	const redactedParsed = snapshot.parsed ? redactObject(snapshot.parsed, uiHints) : snapshot.parsed;
	let redactedRaw = snapshot.raw ? redactRawText(snapshot.raw, snapshot.config, uiHints) : null;
	if (redactedRaw && shouldFallbackToStructuredRawRedaction({
		redactedRaw,
		originalConfig: snapshot.config,
		restoreParsed: (parsed) => withRestoreWarningsSuppressed(() => restoreRedactedValues(parsed, snapshot.config, uiHints))
	})) redactedRaw = null;
	const redactedResolved = redactConfigObject(snapshot.resolved, uiHints);
	return {
		...snapshot,
		sourceConfig: redactedResolved,
		runtimeConfig: redactedConfig,
		config: redactedConfig,
		raw: redactedRaw,
		parsed: redactedParsed,
		resolved: redactedResolved
	};
}
/**
* Deep-walk `incoming` and replace any {@link REDACTED_SENTINEL} values
* (on sensitive paths) with the corresponding value from `original`.
*
* This is called by config.set / config.apply / config.patch before writing,
* so that credentials survive a Web UI round-trip unmodified.
*/
function restoreRedactedValues(incoming, original, hints) {
	if (incoming === null || incoming === void 0) return {
		ok: false,
		error: "no input"
	};
	if (typeof incoming !== "object") return {
		ok: false,
		error: "input not an object"
	};
	try {
		let restored;
		if (hints) {
			const lookup = buildRedactionLookup(hints);
			if (lookup.has("")) restored = restoreRedactedValuesWithLookup(incoming, original, lookup, "", hints);
			else restored = restoreRedactedValuesGuessing(incoming, original, "", hints);
		} else restored = restoreRedactedValuesGuessing(incoming, original, "");
		assertNoRedactedSentinel(restored, "");
		return {
			ok: true,
			result: restored
		};
	} catch (err) {
		if (err instanceof RedactionError) return {
			ok: false,
			humanReadableMessage: err.humanReadableMessage
		};
		throw err;
	}
}
var RedactionError = class extends Error {
	constructor(key, humanReadableMessage) {
		super("internal error class---should never escape");
		this.key = key;
		this.humanReadableMessage = humanReadableMessage ?? `Sentinel value "__OPENCLAW_REDACTED__" in key ${key} is not valid as real data`;
		this.name = "RedactionError";
	}
};
function restoreOriginalValueOrThrow(params) {
	if (params.key in params.original) return params.original[params.key];
	if (!suppressRestoreWarnings) log.warn(`Cannot un-redact config key ${params.path} as it doesn't have any value`);
	throw new RedactionError(params.path);
}
function assertNoRedactedSentinel(value, path) {
	if (typeof value === "string" && value === "__OPENCLAW_REDACTED__") {
		const pathLabel = path || "<root>";
		throw new RedactionError(pathLabel, `Reserved redaction sentinel "${REDACTED_SENTINEL}" is not valid config data (${pathLabel}).`);
	}
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			const nextPath = path ? `${path}[${index}]` : `[${index}]`;
			assertNoRedactedSentinel(value[index], nextPath);
		}
		return;
	}
	if (isObjectRecord(value)) for (const [key, item] of Object.entries(value)) assertNoRedactedSentinel(item, path ? `${path}.${key}` : key);
}
function maybeRestoreSecretRefId(params) {
	const incomingObj = toObjectRecord(params.incoming);
	if (!isSecretRefShape(incomingObj) || incomingObj.id !== "__OPENCLAW_REDACTED__") return { handled: false };
	const originalObj = toObjectRecord(params.original);
	if (!isSecretRefWithProvider(originalObj)) {
		if (isSecretRefShape(originalObj)) throw new RedactionError(params.path, `SecretRef at ${params.path} requires a provider field to restore the redacted id automatically (original ref lacks provider).`);
		throw new RedactionError(params.path, `SecretRef at ${params.path} contains a redacted id placeholder with no matching original value.`);
	}
	if (!isSecretRefWithProvider(incomingObj)) throw new RedactionError(params.path, `SecretRef at ${params.path} must include source, provider, and id when redacted placeholders are present.`);
	if (incomingObj.source !== originalObj.source || incomingObj.provider !== originalObj.provider) throw new RedactionError(params.path, `SecretRef at ${params.path} changed source/provider while id is redacted. Provide an explicit id when changing source/provider.`);
	return {
		handled: true,
		value: {
			...incomingObj,
			id: originalObj.id
		}
	};
}
function mapRedactedArray(params) {
	const originalArray = Array.isArray(params.original) ? params.original : [];
	if (params.incoming.length < originalArray.length) log.warn(`Redacted config array key ${params.path} has been truncated`);
	return params.incoming.map((item, index) => params.mapItem(item, index, originalArray));
}
function toObjectRecord(value) {
	return isObjectRecord(value) ? value : {};
}
function shouldPassThroughRestoreValue(incoming) {
	return incoming === null || incoming === void 0 || typeof incoming !== "object";
}
function toRestoreArrayContext(incoming, prefix) {
	if (!Array.isArray(incoming)) return null;
	return {
		incoming,
		path: `${prefix}[]`
	};
}
function restoreArrayItemWithLookup(params) {
	if (params.item === "__OPENCLAW_REDACTED__") return params.originalArray[params.index];
	return restoreRedactedValuesWithLookup(params.item, params.originalArray[params.index], params.lookup, params.path, params.hints);
}
function restoreArrayItemWithGuessing(params) {
	if (!isExplicitlyNonSensitivePath(params.hints, [params.path]) && isSensitivePath(params.path) && params.item === "__OPENCLAW_REDACTED__") return params.originalArray[params.index];
	return restoreRedactedValuesGuessing(params.item, params.originalArray[params.index], params.path, params.hints);
}
function restoreGuessingArray(incoming, original, path, hints) {
	return mapRedactedArray({
		incoming,
		original,
		path,
		mapItem: (item, index, originalArray) => restoreArrayItemWithGuessing({
			item,
			index,
			originalArray,
			path,
			hints
		})
	});
}
function shouldRestoreSensitiveGuessingPath(path, hintPaths, hints) {
	return !isExplicitlyNonSensitivePath(hints, hintPaths) && (isSensitivePath(path) || hasSensitiveUrlHintPath(hints, hintPaths) || isSensitiveUrlPath(path));
}
function restoreRedactedEntryGuessing(params) {
	const hintPaths = [params.path, params.wildcardPath];
	const canRestoreSecretRef = shouldRestoreSensitiveGuessingPath(params.path, hintPaths, params.hints);
	if (params.value === "__OPENCLAW_REDACTED__" && canRestoreSecretRef) return restoreOriginalValueOrThrow({
		key: params.key,
		path: params.path,
		original: params.original
	});
	if (typeof params.value === "object" && params.value !== null) {
		if (canRestoreSecretRef) {
			const restoredSecretRef = maybeRestoreSecretRefId({
				incoming: params.value,
				original: params.original[params.key],
				path: params.path
			});
			if (restoredSecretRef.handled) return restoredSecretRef.value;
		}
		return restoreRedactedValuesGuessing(params.value, params.original[params.key], params.path, params.hints);
	}
	return params.value;
}
/**
* Worker for restoreRedactedValues().
* Used when there are ConfigUiHints available.
*/
function restoreRedactedValuesWithLookup(incoming, original, lookup, prefix, hints) {
	if (shouldPassThroughRestoreValue(incoming)) return incoming;
	const arrayContext = toRestoreArrayContext(incoming, prefix);
	if (arrayContext) {
		const { incoming: incomingArray, path } = arrayContext;
		if (!lookup.has(path)) return restoreRedactedValuesGuessing(incomingArray, original, prefix, hints);
		return mapRedactedArray({
			incoming: incomingArray,
			original,
			path,
			mapItem: (item, index, originalArray) => restoreArrayItemWithLookup({
				item,
				index,
				originalArray,
				lookup,
				path,
				hints
			})
		});
	}
	const orig = toObjectRecord(original);
	const result = {};
	for (const [key, value] of Object.entries(toObjectRecord(incoming))) {
		result[key] = value;
		const path = prefix ? `${prefix}.${key}` : key;
		const wildcardPath = prefix ? `${prefix}.*` : "*";
		let matched = false;
		for (const candidate of [path, wildcardPath]) if (lookup.has(candidate)) {
			matched = true;
			if (value === "__OPENCLAW_REDACTED__" && (hints[candidate]?.sensitive === true || hasSensitiveUrlHintPath(hints, [
				candidate,
				path,
				wildcardPath
			]) || isSensitiveUrlPath(path))) result[key] = restoreOriginalValueOrThrow({
				key,
				path: candidate,
				original: orig
			});
			else if (typeof value === "object" && value !== null) {
				const restoredSecretRef = maybeRestoreSecretRefId({
					incoming: value,
					original: orig[key],
					path
				});
				result[key] = restoredSecretRef.handled ? restoredSecretRef.value : restoreRedactedValuesWithLookup(value, orig[key], lookup, candidate, hints);
			}
			break;
		}
		if (!matched) result[key] = restoreRedactedEntryGuessing({
			key,
			value,
			path,
			wildcardPath,
			original: orig,
			hints
		});
	}
	return result;
}
/**
* Worker for restoreRedactedValues().
* Used when ConfigUiHints are NOT available.
*/
function restoreRedactedValuesGuessing(incoming, original, prefix, hints) {
	if (shouldPassThroughRestoreValue(incoming)) return incoming;
	const arrayContext = toRestoreArrayContext(incoming, prefix);
	if (arrayContext) {
		const { incoming: incomingArray, path } = arrayContext;
		return restoreGuessingArray(incomingArray, original, path, hints);
	}
	const orig = toObjectRecord(original);
	const result = {};
	for (const [key, value] of Object.entries(toObjectRecord(incoming))) result[key] = restoreRedactedEntryGuessing({
		key,
		value,
		path: prefix ? `${prefix}.${key}` : key,
		wildcardPath: prefix ? `${prefix}.*` : "*",
		original: orig,
		hints
	});
	return result;
}
//#endregion
export { applySensitiveUrlHints as a, applySensitiveHints as i, redactConfigSnapshot as n, applyDerivedTags as o, restoreRedactedValues as r, redactConfigObject as t };
