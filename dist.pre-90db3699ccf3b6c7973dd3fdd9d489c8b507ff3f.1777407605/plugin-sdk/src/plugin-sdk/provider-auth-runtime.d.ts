import type { OAuthCredential } from "../agents/auth-profiles/types.js";
export { resolveEnvApiKey } from "../agents/model-auth-env.js";
export { collectProviderApiKeysForExecution, executeWithApiKeyRotation, } from "../agents/api-key-rotation.js";
export { NON_ENV_SECRETREF_MARKER } from "../agents/model-auth-markers.js";
export { requireApiKey, resolveAwsSdkEnvVarName, type ResolvedProviderAuth, } from "../agents/model-auth-runtime-shared.js";
export type { ProviderPreparedRuntimeAuth } from "../plugins/types.js";
export type { ResolvedProviderRuntimeAuth } from "../plugins/runtime/model-auth-types.js";
export declare const CODEX_AUTH_ENV_CLEAR_KEYS: readonly ["OPENAI_API_KEY"];
export type PreparedCodexAuthBridge = {
    codexHome: string;
    clearEnv: string[];
};
export type OAuthCallbackResult = {
    code: string;
    state: string;
};
export declare function generateOAuthState(): string;
export declare function parseOAuthCallbackInput(input: string, messages?: {
    missingState?: string;
    invalidInput?: string;
}): OAuthCallbackResult | {
    error: string;
};
export declare function waitForLocalOAuthCallback(params: {
    expectedState: string;
    timeoutMs: number;
    port: number;
    callbackPath: string;
    redirectUri: string;
    successTitle: string;
    progressMessage?: string;
    hostname?: string;
    onProgress?: (message: string) => void;
}): Promise<OAuthCallbackResult>;
export declare function isCodexBridgeableOAuthCredential(value: unknown): value is OAuthCredential;
type CodexAuthBridgeMaterial = {
    accountId?: string;
    idToken?: string;
    lastRefresh?: string | number;
    openaiApiKey?: string;
};
export declare function resolveCodexAuthBridgeHome(params: {
    agentDir: string;
    bridgeDir: string;
    profileId: string;
}): string;
export declare function buildCodexAuthBridgeFile(credential: OAuthCredential, material?: Partial<CodexAuthBridgeMaterial>): string;
export declare function prepareCodexAuthBridge(params: {
    agentDir: string;
    bridgeDir: string;
    profileId: string;
    sourceCodexHome?: string;
    env?: NodeJS.ProcessEnv;
}): Promise<PreparedCodexAuthBridge | undefined>;
type ResolveApiKeyForProvider = typeof import("../agents/model-auth.js").resolveApiKeyForProvider;
type GetRuntimeAuthForModel = typeof import("../plugins/runtime/runtime-model-auth.runtime.js").getRuntimeAuthForModel;
export declare function resolveApiKeyForProvider(params: Parameters<ResolveApiKeyForProvider>[0]): Promise<Awaited<ReturnType<ResolveApiKeyForProvider>>>;
export declare function getRuntimeAuthForModel(params: Parameters<GetRuntimeAuthForModel>[0]): Promise<Awaited<ReturnType<GetRuntimeAuthForModel>>>;
