import { vi } from "vitest";
import type { AuthProfileStore } from "../../src/agents/auth-profiles.js";

type AuthProfilesModule = typeof import("../../src/agents/auth-profiles.js");
type AuthProfileStoreModule = typeof import("../../src/agents/auth-profiles/store.js");
type AuthProfilePersistedModule = typeof import("../../src/agents/auth-profiles/persisted.js");
type AuthProfileExternalCliSyncModule =
  typeof import("../../src/agents/auth-profiles/external-cli-sync.js");
type AuthProfileUpsertWithLockModule =
  typeof import("../../src/agents/auth-profiles/upsert-with-lock.js");
type MockOverrides<T extends object> = Partial<Record<keyof T, unknown>>;

export function createMockAuthProfileStore(
  overrides: Partial<AuthProfileStore> = {},
): AuthProfileStore {
  return {
    version: 1,
    profiles: {},
    ...overrides,
  };
}

function dedupeProfileIds(profileIds: string[]): string[] {
  return [...new Set(profileIds)];
}

function listProfilesForProvider(store: AuthProfileStore, provider: string): string[] {
  const normalizedProvider = provider.trim().toLowerCase();
  return Object.entries(store.profiles)
    .filter(([, credential]) => credential.provider.trim().toLowerCase() === normalizedProvider)
    .map(([profileId]) => profileId);
}

function compactStrings(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function buildAuthProfileStoreMock(
  overrides: MockOverrides<AuthProfileStoreModule> = {},
): AuthProfileStoreModule {
  const createStore = () => createMockAuthProfileStore();
  const defaults = {
    updateAuthProfileStoreWithLock: vi.fn(async () => createStore()),
    loadAuthProfileStore: vi.fn(createStore),
    loadAuthProfileStoreForRuntime: vi.fn(createStore),
    loadAuthProfileStoreForSecretsRuntime: vi.fn(createStore),
    loadAuthProfileStoreWithoutExternalProfiles: vi.fn(createStore),
    ensureAuthProfileStore: vi.fn(createStore),
    ensureAuthProfileStoreWithoutExternalProfiles: vi.fn(createStore),
    findPersistedAuthProfileCredential: vi.fn(() => undefined),
    resolvePersistedAuthProfileOwnerAgentDir: vi.fn(() => undefined),
    ensureAuthProfileStoreForLocalUpdate: vi.fn(createStore),
    hasAnyAuthProfileStoreSource: vi.fn(() => false),
    replaceRuntimeAuthProfileStoreSnapshots: vi.fn(),
    clearRuntimeAuthProfileStoreSnapshots: vi.fn(),
    saveAuthProfileStore: vi.fn(),
  } satisfies AuthProfileStoreModule;
  return {
    ...defaults,
    ...overrides,
  } as AuthProfileStoreModule;
}

export function buildAuthProfilePersistedMock(
  overrides: MockOverrides<AuthProfilePersistedModule> = {},
): AuthProfilePersistedModule {
  const defaults = {
    coercePersistedAuthProfileStore: vi.fn(() => null),
    mergeAuthProfileStores: vi.fn((base: AuthProfileStore, override: AuthProfileStore) => ({
      ...base,
      ...override,
      profiles: { ...base.profiles, ...override.profiles },
    })),
    buildPersistedAuthProfileSecretsStore: vi.fn((store: AuthProfileStore) => ({
      version: store.version,
      profiles: store.profiles,
    })),
    applyLegacyAuthStore: vi.fn(),
    mergeOAuthFileIntoStore: vi.fn(() => false),
    loadPersistedAuthProfileStore: vi.fn(() => null),
    loadLegacyAuthProfileStore: vi.fn(() => null),
  } satisfies AuthProfilePersistedModule;
  return {
    ...defaults,
    ...overrides,
  } as AuthProfilePersistedModule;
}

export function buildAuthProfileExternalCliSyncMock(
  overrides: MockOverrides<AuthProfileExternalCliSyncModule> = {},
): AuthProfileExternalCliSyncModule {
  const defaults = {
    areOAuthCredentialsEquivalent: vi.fn(() => false),
    hasUsableOAuthCredential: vi.fn(() => false),
    isSafeToAdoptBootstrapOAuthIdentity: vi.fn(() => true),
    isSafeToOverwriteStoredOAuthIdentity: vi.fn(() => true),
    shouldBootstrapFromExternalCliCredential: vi.fn(() => false),
    shouldReplaceStoredOAuthCredential: vi.fn(() => false),
    isSafeToUseExternalCliCredential: vi.fn(() => true),
    readExternalCliBootstrapCredential: vi.fn(() => null),
    readManagedExternalCliCredential: vi.fn(() => null),
    readExternalCliFallbackCredential: vi.fn(() => null),
    resolveExternalCliAuthProfiles: vi.fn(() => []),
  } satisfies AuthProfileExternalCliSyncModule;
  return {
    ...defaults,
    ...overrides,
  } as AuthProfileExternalCliSyncModule;
}

export function buildAuthProfileUpsertWithLockMock(
  overrides: MockOverrides<AuthProfileUpsertWithLockModule> = {},
): AuthProfileUpsertWithLockModule {
  const defaults = {
    upsertAuthProfileWithLock: vi.fn(async () => createMockAuthProfileStore()),
  } satisfies AuthProfileUpsertWithLockModule;
  return {
    ...defaults,
    ...overrides,
  } as AuthProfileUpsertWithLockModule;
}

export function buildAuthProfilesMock(
  overrides: MockOverrides<AuthProfilesModule> = {},
): AuthProfilesModule {
  const storeMock = buildAuthProfileStoreMock();
  const defaults = {
    CLAUDE_CLI_PROFILE_ID: "anthropic:claude-cli",
    CODEX_CLI_PROFILE_ID: "openai-codex:codex-cli",
    resolveAuthProfileDisplayLabel: vi.fn(({ profileId }: { profileId: string }) => profileId),
    formatAuthDoctorHint: vi.fn(async () => ""),
    externalCliDiscoveryExisting: vi.fn((params = {}) => ({
      mode: "existing" as const,
      ...params,
    })),
    externalCliDiscoveryForConfigStatus: vi.fn((params) => ({
      mode: "none" as const,
      allowKeychainPrompt: false as const,
      config: params.cfg,
    })),
    externalCliDiscoveryForProviderAuth: vi.fn((params) => ({
      mode: "scoped" as const,
      allowKeychainPrompt: params.allowKeychainPrompt ?? false,
      config: params.cfg,
      providerIds: [params.provider],
      ...(params.profileId || params.preferredProfile
        ? { profileIds: compactStrings([params.profileId, params.preferredProfile]) }
        : {}),
    })),
    externalCliDiscoveryForProviders: vi.fn((params) => ({
      mode: "scoped" as const,
      allowKeychainPrompt: params.allowKeychainPrompt ?? false,
      config: params.cfg,
      providerIds: params.providers,
    })),
    externalCliDiscoveryNone: vi.fn((params = {}) => ({
      mode: "none" as const,
      allowKeychainPrompt: false as const,
      ...params,
    })),
    externalCliDiscoveryScoped: vi.fn((params) => ({
      mode: "scoped" as const,
      ...params,
    })),
    refreshOAuthCredentialForRuntime: vi.fn(async () => null),
    resolveApiKeyForProfile: vi.fn(async () => null),
    isConfiguredAwsSdkAuthProfileForProvider: vi.fn(() => false),
    resolveAuthProfileEligibility: vi.fn(() => ({
      eligible: false,
      reasonCode: "profile_missing" as const,
    })),
    resolveAuthProfileOrder: vi.fn(() => []),
    resolveAuthStatePathForDisplay: vi.fn((agentDir?: string) =>
      agentDir ? `${agentDir}/auth-state.json` : "/tmp/auth-state.json",
    ),
    resolveAuthStorePathForDisplay: vi.fn((agentDir?: string) =>
      agentDir ? `${agentDir}/auth-profiles.json` : "/tmp/auth-profiles.json",
    ),
    dedupeProfileIds: vi.fn(dedupeProfileIds),
    listProfilesForProvider: vi.fn(listProfilesForProvider),
    markAuthProfileSuccess: vi.fn(async () => undefined),
    removeProviderAuthProfilesWithLock: vi.fn(async () => createMockAuthProfileStore()),
    setAuthProfileOrder: vi.fn(async () => createMockAuthProfileStore()),
    upsertAuthProfile: vi.fn(),
    upsertAuthProfileWithLock: vi.fn(async () => createMockAuthProfileStore()),
    repairOAuthProfileIdMismatch: vi.fn(
      (params: Parameters<AuthProfilesModule["repairOAuthProfileIdMismatch"]>[0]) => ({
        config: params.cfg,
        changes: [],
        migrated: false,
      }),
    ),
    suggestOAuthProfileIdForLegacyDefault: vi.fn(() => null),
    buildPortableAuthProfileSecretsStoreForAgentCopy: vi.fn((store: AuthProfileStore) => ({
      store: {
        version: store.version,
        profiles: store.profiles,
      },
      copiedProfileIds: Object.keys(store.profiles),
      skippedProfileIds: [],
    })),
    isAuthProfileCredentialPortableForAgentCopy: vi.fn(() => true),
    resolveAuthProfilePortability: vi.fn(() => ({
      portable: true,
      reason: "portable-static-credential" as const,
    })),
    clearRuntimeAuthProfileStoreSnapshots: storeMock.clearRuntimeAuthProfileStoreSnapshots,
    ensureAuthProfileStore: storeMock.ensureAuthProfileStore,
    ensureAuthProfileStoreWithoutExternalProfiles:
      storeMock.ensureAuthProfileStoreWithoutExternalProfiles,
    hasAnyAuthProfileStoreSource: storeMock.hasAnyAuthProfileStoreSource,
    loadAuthProfileStoreForSecretsRuntime: storeMock.loadAuthProfileStoreForSecretsRuntime,
    loadAuthProfileStoreWithoutExternalProfiles:
      storeMock.loadAuthProfileStoreWithoutExternalProfiles,
    loadAuthProfileStoreForRuntime: storeMock.loadAuthProfileStoreForRuntime,
    replaceRuntimeAuthProfileStoreSnapshots: storeMock.replaceRuntimeAuthProfileStoreSnapshots,
    loadAuthProfileStore: storeMock.loadAuthProfileStore,
    saveAuthProfileStore: storeMock.saveAuthProfileStore,
    findPersistedAuthProfileCredential: storeMock.findPersistedAuthProfileCredential,
    resolvePersistedAuthProfileOwnerAgentDir: storeMock.resolvePersistedAuthProfileOwnerAgentDir,
    calculateAuthProfileCooldownMs: vi.fn((errorCount: number) =>
      errorCount <= 1 ? 30_000 : errorCount <= 2 ? 60_000 : 300_000,
    ),
    clearAuthProfileCooldown: vi.fn(async () => undefined),
    clearExpiredCooldowns: vi.fn(() => false),
    getSoonestCooldownExpiry: vi.fn(() => null),
    isProfileInCooldown: vi.fn(() => false),
    markAuthProfileCooldown: vi.fn(async () => undefined),
    markAuthProfileBlockedUntil: vi.fn(async () => undefined),
    markAuthProfileFailure: vi.fn(async () => undefined),
    resolveProfilesUnavailableReason: vi.fn(() => null),
    resolveProfileUnusableUntilForDisplay: vi.fn(() => null),
  } satisfies AuthProfilesModule;
  return {
    ...defaults,
    ...overrides,
  } as AuthProfilesModule;
}
