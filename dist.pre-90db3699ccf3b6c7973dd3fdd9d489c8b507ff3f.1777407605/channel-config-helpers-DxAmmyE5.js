import { s as normalizeOptionalLowercaseString } from "./string-coerce-CjxCKZ6B.js";
import { s as normalizeStringEntries } from "./string-normalization-5F-0OqbT.js";
import { n as normalizeAccountId } from "./account-id-BM1T6029.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "./config-helpers-BzagItDT.js";
import { i as resolveChannelConfigWritesShared, n as canBypassConfigWritePolicyShared, r as formatConfigWriteDeniedMessageShared, t as authorizeConfigWriteShared } from "./config-write-policy-shared-Bh9y3cot.js";
import { t as buildAccountScopedDmSecurityPolicy } from "./helpers-DIuSKnxZ.js";
//#region src/plugin-sdk/channel-config-helpers.ts
const INTERNAL_MESSAGE_CHANNEL = "webchat";
function resolveChannelConfigWrites(params) {
	return resolveChannelConfigWritesShared(params);
}
function authorizeConfigWrite(params) {
	return authorizeConfigWriteShared(params);
}
function canBypassConfigWritePolicy(params) {
	return canBypassConfigWritePolicyShared({
		...params,
		isInternalMessageChannel: (channel) => normalizeOptionalLowercaseString(channel) === INTERNAL_MESSAGE_CHANNEL
	});
}
function formatConfigWriteDeniedMessage(params) {
	return formatConfigWriteDeniedMessageShared(params);
}
/** Coerce mixed allowlist config values into plain strings without trimming or deduping. */
function mapAllowFromEntries(allowFrom) {
	return (allowFrom ?? []).map((entry) => String(entry));
}
/** Normalize user-facing allowlist entries the same way config and doctor flows expect. */
function formatTrimmedAllowFromEntries(allowFrom) {
	return normalizeStringEntries(allowFrom);
}
/** Collapse nullable config scalars into a trimmed optional string. */
function resolveOptionalConfigString(value) {
	if (value == null) return;
	return String(value).trim() || void 0;
}
/** Adapt `{ cfg, accountId }` accessors to callback sites that pass positional args. */
function adaptScopedAccountAccessor(accessor) {
	return (cfg, accountId) => accessor({
		cfg,
		accountId
	});
}
/** Build the shared allowlist/default target adapter surface for account-scoped channel configs. */
function createScopedAccountConfigAccessors(params) {
	const base = {
		resolveAllowFrom({ cfg, accountId }) {
			return mapAllowFromEntries(params.resolveAllowFrom(params.resolveAccount({
				cfg,
				accountId
			})));
		},
		formatAllowFrom({ allowFrom }) {
			return params.formatAllowFrom(allowFrom);
		}
	};
	if (!params.resolveDefaultTo) return base;
	return {
		...base,
		resolveDefaultTo({ cfg, accountId }) {
			return resolveOptionalConfigString(params.resolveDefaultTo?.(params.resolveAccount({
				cfg,
				accountId
			})));
		}
	};
}
function createNamedAccountConfigBase(params) {
	return {
		listAccountIds(cfg) {
			return params.listAccountIds(cfg);
		},
		resolveAccount(cfg, accountId) {
			return params.resolveAccount(cfg, accountId);
		},
		inspectAccount: params.inspectAccount ? (cfg, accountId) => params.inspectAccount?.(cfg, accountId) : void 0,
		defaultAccountId(cfg) {
			return params.defaultAccountId(cfg);
		},
		setAccountEnabled({ cfg, accountId, enabled }) {
			return params.setAccountEnabled({
				cfg,
				accountId: normalizeAccountId(accountId),
				enabled
			});
		},
		deleteAccount({ cfg, accountId }) {
			return params.deleteAccount({
				cfg,
				accountId: normalizeAccountId(accountId)
			});
		}
	};
}
function resolveAccessorAccountWithFallback(resolveAccessorAccount, fallbackResolveAccessorAccount) {
	return resolveAccessorAccount ?? fallbackResolveAccessorAccount;
}
function createChannelConfigAdapterWithAccessors(params) {
	return {
		...params.base,
		...createScopedAccountConfigAccessors({
			resolveAccount: resolveAccessorAccountWithFallback(params.resolveAccessorAccount, params.fallbackResolveAccessorAccount),
			resolveAllowFrom: params.resolveAllowFrom,
			formatAllowFrom: params.formatAllowFrom,
			resolveDefaultTo: params.resolveDefaultTo
		})
	};
}
function createChannelConfigAdapterFromBase(params) {
	return createChannelConfigAdapterWithAccessors({
		base: params.base,
		resolveAccessorAccount: params.resolveAccessorAccount,
		fallbackResolveAccessorAccount: params.resolveAccountForAccessors,
		resolveAllowFrom: params.resolveAllowFrom,
		formatAllowFrom: params.formatAllowFrom,
		resolveDefaultTo: params.resolveDefaultTo
	});
}
/** Build the common CRUD/config helpers for channels that store multiple named accounts. */
function createScopedChannelConfigBase(params) {
	return createNamedAccountConfigBase({
		listAccountIds: params.listAccountIds,
		resolveAccount: params.resolveAccount,
		inspectAccount: params.inspectAccount,
		defaultAccountId: params.defaultAccountId,
		setAccountEnabled({ cfg, accountId, enabled }) {
			return setAccountEnabledInConfigSection({
				cfg,
				sectionKey: params.sectionKey,
				accountId,
				enabled,
				allowTopLevel: params.allowTopLevel ?? true
			});
		},
		deleteAccount({ cfg, accountId }) {
			return deleteAccountFromConfigSection({
				cfg,
				sectionKey: params.sectionKey,
				accountId,
				clearBaseFields: params.clearBaseFields
			});
		}
	});
}
/** Build the full shared config adapter for account-scoped channels with allowlist/default target accessors. */
function createScopedChannelConfigAdapter(params) {
	return createChannelConfigAdapterFromBase({
		base: createScopedChannelConfigBase({
			sectionKey: params.sectionKey,
			listAccountIds: params.listAccountIds,
			resolveAccount: params.resolveAccount,
			inspectAccount: params.inspectAccount,
			defaultAccountId: params.defaultAccountId,
			clearBaseFields: params.clearBaseFields,
			allowTopLevel: params.allowTopLevel
		}),
		resolveAccessorAccount: params.resolveAccessorAccount,
		resolveAccountForAccessors({ cfg, accountId }) {
			return params.resolveAccount(cfg, accountId);
		},
		resolveAllowFrom: params.resolveAllowFrom,
		formatAllowFrom: params.formatAllowFrom,
		resolveDefaultTo: params.resolveDefaultTo
	});
}
function setTopLevelChannelEnabledInConfigSection(params) {
	const section = params.cfg.channels?.[params.sectionKey];
	return {
		...params.cfg,
		channels: {
			...params.cfg.channels,
			[params.sectionKey]: {
				...section,
				enabled: params.enabled
			}
		}
	};
}
function removeTopLevelChannelConfigSection(params) {
	const nextChannels = { ...params.cfg.channels };
	delete nextChannels[params.sectionKey];
	const nextCfg = { ...params.cfg };
	if (Object.keys(nextChannels).length > 0) nextCfg.channels = nextChannels;
	else delete nextCfg.channels;
	return nextCfg;
}
function clearTopLevelChannelConfigFields(params) {
	const section = params.cfg.channels?.[params.sectionKey];
	if (!section) return params.cfg;
	const nextSection = { ...section };
	for (const field of params.clearBaseFields) delete nextSection[field];
	return {
		...params.cfg,
		channels: {
			...params.cfg.channels,
			[params.sectionKey]: nextSection
		}
	};
}
/** Build CRUD/config helpers for top-level single-account channels. */
function createTopLevelChannelConfigBase(params) {
	return {
		listAccountIds(cfg) {
			return params.listAccountIds?.(cfg) ?? ["default"];
		},
		resolveAccount(cfg) {
			return params.resolveAccount(cfg);
		},
		inspectAccount: params.inspectAccount ? (cfg) => params.inspectAccount?.(cfg) : void 0,
		defaultAccountId(cfg) {
			return params.defaultAccountId?.(cfg) ?? "default";
		},
		setAccountEnabled({ cfg, enabled }) {
			return setTopLevelChannelEnabledInConfigSection({
				cfg,
				sectionKey: params.sectionKey,
				enabled
			});
		},
		deleteAccount({ cfg }) {
			return params.deleteMode === "clear-fields" ? clearTopLevelChannelConfigFields({
				cfg,
				sectionKey: params.sectionKey,
				clearBaseFields: params.clearBaseFields ?? []
			}) : removeTopLevelChannelConfigSection({
				cfg,
				sectionKey: params.sectionKey
			});
		}
	};
}
/** Build the full shared config adapter for top-level single-account channels with allowlist/default target accessors. */
function createTopLevelChannelConfigAdapter(params) {
	return createChannelConfigAdapterFromBase({
		base: createTopLevelChannelConfigBase({
			sectionKey: params.sectionKey,
			resolveAccount: params.resolveAccount,
			listAccountIds: params.listAccountIds,
			defaultAccountId: params.defaultAccountId,
			inspectAccount: params.inspectAccount,
			deleteMode: params.deleteMode,
			clearBaseFields: params.clearBaseFields
		}),
		resolveAccessorAccount: params.resolveAccessorAccount,
		resolveAccountForAccessors({ cfg }) {
			return params.resolveAccount(cfg);
		},
		resolveAllowFrom: params.resolveAllowFrom,
		formatAllowFrom: params.formatAllowFrom,
		resolveDefaultTo: params.resolveDefaultTo
	});
}
/** Build CRUD/config helpers for channels where the default account lives at channel root and named accounts live under `accounts`. */
function createHybridChannelConfigBase(params) {
	return createNamedAccountConfigBase({
		listAccountIds: params.listAccountIds,
		resolveAccount: params.resolveAccount,
		inspectAccount: params.inspectAccount,
		defaultAccountId: params.defaultAccountId,
		setAccountEnabled({ cfg, accountId, enabled }) {
			if (normalizeAccountId(accountId) === "default") return setTopLevelChannelEnabledInConfigSection({
				cfg,
				sectionKey: params.sectionKey,
				enabled
			});
			return setAccountEnabledInConfigSection({
				cfg,
				sectionKey: params.sectionKey,
				accountId,
				enabled
			});
		},
		deleteAccount({ cfg, accountId }) {
			if (normalizeAccountId(accountId) === "default") {
				if (params.preserveSectionOnDefaultDelete) return clearTopLevelChannelConfigFields({
					cfg,
					sectionKey: params.sectionKey,
					clearBaseFields: params.clearBaseFields
				});
				return deleteAccountFromConfigSection({
					cfg,
					sectionKey: params.sectionKey,
					accountId,
					clearBaseFields: params.clearBaseFields
				});
			}
			return deleteAccountFromConfigSection({
				cfg,
				sectionKey: params.sectionKey,
				accountId,
				clearBaseFields: params.clearBaseFields
			});
		}
	});
}
/** Build the full shared config adapter for hybrid channels with allowlist/default target accessors. */
function createHybridChannelConfigAdapter(params) {
	return createChannelConfigAdapterFromBase({
		base: createHybridChannelConfigBase({
			sectionKey: params.sectionKey,
			listAccountIds: params.listAccountIds,
			resolveAccount: params.resolveAccount,
			inspectAccount: params.inspectAccount,
			defaultAccountId: params.defaultAccountId,
			clearBaseFields: params.clearBaseFields,
			preserveSectionOnDefaultDelete: params.preserveSectionOnDefaultDelete
		}),
		resolveAccessorAccount: params.resolveAccessorAccount,
		resolveAccountForAccessors({ cfg, accountId }) {
			return params.resolveAccount(cfg, accountId);
		},
		resolveAllowFrom: params.resolveAllowFrom,
		formatAllowFrom: params.formatAllowFrom,
		resolveDefaultTo: params.resolveDefaultTo
	});
}
/** Convert account-specific DM security fields into the shared runtime policy resolver shape. */
function createScopedDmSecurityResolver(params) {
	return ({ cfg, accountId, account }) => buildAccountScopedDmSecurityPolicy({
		cfg,
		channelKey: params.channelKey,
		accountId,
		fallbackAccountId: params.resolveFallbackAccountId?.(account) ?? account.accountId,
		policy: params.resolvePolicy(account),
		allowFrom: params.resolveAllowFrom(account) ?? [],
		defaultPolicy: params.defaultPolicy,
		allowFromPathSuffix: params.allowFromPathSuffix,
		policyPathSuffix: params.policyPathSuffix,
		approveChannelId: params.approveChannelId,
		approveHint: params.approveHint,
		normalizeEntry: params.normalizeEntry,
		inheritSharedDefaultsFromDefaultAccount: params.inheritSharedDefaultsFromDefaultAccount
	});
}
//#endregion
export { createHybridChannelConfigBase as a, createScopedChannelConfigBase as c, createTopLevelChannelConfigBase as d, formatConfigWriteDeniedMessage as f, resolveOptionalConfigString as g, resolveChannelConfigWrites as h, createHybridChannelConfigAdapter as i, createScopedDmSecurityResolver as l, mapAllowFromEntries as m, authorizeConfigWrite as n, createScopedAccountConfigAccessors as o, formatTrimmedAllowFromEntries as p, canBypassConfigWritePolicy as r, createScopedChannelConfigAdapter as s, adaptScopedAccountAccessor as t, createTopLevelChannelConfigAdapter as u };
