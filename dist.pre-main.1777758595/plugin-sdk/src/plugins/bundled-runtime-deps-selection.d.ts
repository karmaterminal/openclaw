import type { OpenClawConfig } from "../config/types.openclaw.js";
import { type RuntimeDepEntry } from "./bundled-runtime-deps-specs.js";
import { type NormalizedPluginsConfig, type NormalizePluginId } from "./config-normalization-shared.js";
export type RuntimeDepConflict = {
    name: string;
    versions: string[];
    pluginIdsByVersion: Map<string, string[]>;
};
export type BundledPluginRuntimeDepsManifest = {
    channels: string[];
    enabledByDefault: boolean;
    id?: string;
    legacyPluginIds: string[];
    localMemoryEmbeddingRuntimeDeps: RuntimeDepEntry[];
    modelSupport?: BundledPluginRuntimeDepsModelSupport;
    providers: string[];
};
export type BundledPluginRuntimeDepsManifestCache = Map<string, BundledPluginRuntimeDepsManifest>;
type BundledPluginRuntimeDepsModelSupport = {
    modelPatterns: string[];
    modelPrefixes: string[];
};
export declare function collectMirroredPackageRuntimeDeps(packageRoot: string | null): RuntimeDepEntry[];
export declare function createBundledRuntimeDepsPluginIdNormalizer(params: {
    extensionsDir: string;
    manifestCache: BundledPluginRuntimeDepsManifestCache;
}): NormalizePluginId;
export declare function resolveBundledRuntimeDepsConfiguredModelOwnerPluginIds(params: {
    config: OpenClawConfig;
    extensionsDir: string;
    manifestCache?: BundledPluginRuntimeDepsManifestCache;
}): ReadonlySet<string>;
export declare function isBundledPluginConfiguredForRuntimeDeps(params: {
    config: OpenClawConfig;
    plugins: NormalizedPluginsConfig;
    pluginId: string;
    pluginDir: string;
    configuredModelOwnerPluginIds?: ReadonlySet<string>;
    includeConfiguredChannels?: boolean;
    manifestCache?: BundledPluginRuntimeDepsManifestCache;
}): boolean;
export declare function collectBundledPluginRuntimeDeps(params: {
    extensionsDir: string;
    config?: OpenClawConfig;
    pluginIds?: ReadonlySet<string>;
    selectedPluginIds?: ReadonlySet<string>;
    includeConfiguredChannels?: boolean;
    manifestCache?: BundledPluginRuntimeDepsManifestCache;
    normalizePluginId?: NormalizePluginId;
}): {
    deps: RuntimeDepEntry[];
    conflicts: RuntimeDepConflict[];
    pluginIds: string[];
};
export declare function normalizePluginIdSet(pluginIds: readonly string[] | undefined, normalizePluginId?: NormalizePluginId): ReadonlySet<string> | undefined;
export {};
