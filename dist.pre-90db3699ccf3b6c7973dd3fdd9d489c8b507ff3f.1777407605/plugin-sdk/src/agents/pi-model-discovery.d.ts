import type { AuthStorage as PiAuthStorage, ModelRegistry as PiModelRegistry } from "@mariozechner/pi-coding-agent";
import { type PiCredentialMap } from "./pi-auth-credentials.js";
declare const PiAuthStorageClass: typeof PiAuthStorage;
declare const PiModelRegistryClass: typeof PiModelRegistry;
export { PiAuthStorageClass as AuthStorage, PiModelRegistryClass as ModelRegistry };
type DiscoverModelsOptions = {
    providerFilter?: string;
};
export declare function normalizeDiscoveredPiModel<T>(value: T, agentDir: string): T;
export declare function scrubLegacyStaticAuthJsonEntriesForDiscovery(pathname: string): void;
export declare function addEnvBackedPiCredentials(credentials: PiCredentialMap, env?: NodeJS.ProcessEnv): PiCredentialMap;
export declare function resolvePiCredentialsForDiscovery(agentDir: string): PiCredentialMap;
export declare function discoverAuthStorage(agentDir: string): PiAuthStorage;
export declare function discoverModels(authStorage: PiAuthStorage, agentDir: string, options?: DiscoverModelsOptions): PiModelRegistry;
