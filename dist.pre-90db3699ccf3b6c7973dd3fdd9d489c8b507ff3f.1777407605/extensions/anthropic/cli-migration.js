import { readClaudeCliCredentialsForSetup, readClaudeCliCredentialsForSetupNonInteractive } from "./cli-auth-seam.js";
import { CLAUDE_CLI_BACKEND_ID, CLAUDE_CLI_DEFAULT_ALLOWLIST_REFS, CLAUDE_CLI_DEFAULT_MODEL_REF } from "./cli-constants.js";
import "./cli-shared.js";
import { CLAUDE_CLI_PROFILE_ID } from "openclaw/plugin-sdk/provider-auth";
import { normalizeLowercaseStringOrEmpty } from "openclaw/plugin-sdk/text-runtime";
//#region extensions/anthropic/cli-migration.ts
function toClaudeCliModelRef(raw) {
	const trimmed = raw.trim();
	if (!normalizeLowercaseStringOrEmpty(trimmed).startsWith("anthropic/")) return null;
	const modelId = trimmed.slice(10).trim();
	if (!normalizeLowercaseStringOrEmpty(modelId).startsWith("claude-")) return null;
	return `claude-cli/${modelId}`;
}
function rewriteModelSelection(model) {
	if (typeof model === "string") {
		const converted = toClaudeCliModelRef(model);
		return converted ? {
			value: converted,
			primary: converted,
			changed: true
		} : {
			value: model,
			changed: false
		};
	}
	if (!model || typeof model !== "object" || Array.isArray(model)) return {
		value: model,
		changed: false
	};
	const current = model;
	const next = { ...current };
	let changed = false;
	let primary;
	if (typeof current.primary === "string") {
		const converted = toClaudeCliModelRef(current.primary);
		if (converted) {
			next.primary = converted;
			primary = converted;
			changed = true;
		}
	}
	const currentFallbacks = current.fallbacks;
	if (Array.isArray(currentFallbacks)) {
		const nextFallbacks = currentFallbacks.map((entry) => typeof entry === "string" ? toClaudeCliModelRef(entry) ?? entry : entry);
		if (nextFallbacks.some((entry, index) => entry !== currentFallbacks[index])) {
			next.fallbacks = nextFallbacks;
			changed = true;
		}
	}
	return {
		value: changed ? next : model,
		...primary ? { primary } : {},
		changed
	};
}
function rewriteModelEntryMap(models) {
	if (!models) return {
		value: models,
		migrated: []
	};
	const next = { ...models };
	const migrated = [];
	for (const [rawKey, value] of Object.entries(models)) {
		const converted = toClaudeCliModelRef(rawKey);
		if (!converted) continue;
		if (!(converted in next)) next[converted] = value;
		delete next[rawKey];
		migrated.push(converted);
	}
	return {
		value: migrated.length > 0 ? next : models,
		migrated
	};
}
function seedClaudeCliAllowlist(models) {
	const next = { ...models };
	for (const ref of CLAUDE_CLI_DEFAULT_ALLOWLIST_REFS) next[ref] = next[ref] ?? {};
	return next;
}
function hasClaudeCliAuth(options) {
	return Boolean(options?.allowKeychainPrompt === false ? readClaudeCliCredentialsForSetupNonInteractive() : readClaudeCliCredentialsForSetup());
}
function buildClaudeCliAuthProfiles(credential) {
	if (!credential) return [];
	if (credential.type === "oauth") return [{
		profileId: CLAUDE_CLI_PROFILE_ID,
		credential: {
			type: "oauth",
			provider: CLAUDE_CLI_BACKEND_ID,
			access: credential.access,
			refresh: credential.refresh,
			expires: credential.expires
		}
	}];
	return [{
		profileId: CLAUDE_CLI_PROFILE_ID,
		credential: {
			type: "token",
			provider: CLAUDE_CLI_BACKEND_ID,
			token: credential.token,
			expires: credential.expires
		}
	}];
}
function buildAnthropicCliMigrationResult(config, credential) {
	const defaults = config.agents?.defaults;
	const rewrittenModel = rewriteModelSelection(defaults?.model);
	const rewrittenModels = rewriteModelEntryMap(defaults?.models);
	const nextModels = seedClaudeCliAllowlist(rewrittenModels.value ?? defaults?.models ?? {});
	const defaultModel = rewrittenModel.primary ?? CLAUDE_CLI_DEFAULT_MODEL_REF;
	return {
		profiles: buildClaudeCliAuthProfiles(credential),
		configPatch: { agents: { defaults: {
			...rewrittenModel.changed ? { model: rewrittenModel.value } : {},
			models: nextModels
		} } },
		replaceDefaultModels: true,
		defaultModel,
		notes: [
			"Claude CLI auth detected; switched Anthropic model selection to the local Claude CLI backend.",
			"Existing Anthropic auth profiles are kept for rollback.",
			...rewrittenModels.migrated.length > 0 ? [`Migrated allowlist entries: ${rewrittenModels.migrated.join(", ")}.`] : []
		]
	};
}
//#endregion
export { buildAnthropicCliMigrationResult, hasClaudeCliAuth };
