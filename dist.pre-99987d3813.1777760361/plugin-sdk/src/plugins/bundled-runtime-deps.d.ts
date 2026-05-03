import type { OpenClawConfig } from "../config/types.openclaw.js";
import { installBundledRuntimeDeps, installBundledRuntimeDepsAsync, repairBundledRuntimeDepsInstallRoot, repairBundledRuntimeDepsInstallRootAsync, type BundledRuntimeDepsInstallParams } from "./bundled-runtime-deps-install.js";
import { formatRuntimeDepsLockTimeoutMessage, shouldRemoveRuntimeDepsLock, withBundledRuntimeDepsFilesystemLock } from "./bundled-runtime-deps-lock.js";
import { createBundledRuntimeDepsInstallArgs, createBundledRuntimeDepsInstallEnv, resolveBundledRuntimeDepsNpmRunner, resolveBundledRuntimeDepsPnpmRunner, type BundledRuntimeDepsNpmRunner } from "./bundled-runtime-deps-package-manager.js";
import { isWritableDirectory, pruneUnknownBundledRuntimeDepsRoots, resolveBundledRuntimeDependencyInstallRoot, resolveBundledRuntimeDependencyInstallRootInfo, resolveBundledRuntimeDependencyInstallRootPlan, resolveBundledRuntimeDependencyPackageInstallRoot, resolveBundledRuntimeDependencyPackageInstallRootPlan, resolveBundledRuntimeDependencyPackageRoot, type BundledRuntimeDepsInstallRootPlan } from "./bundled-runtime-deps-roots.js";
import { type RuntimeDepConflict } from "./bundled-runtime-deps-selection.js";
import { type RuntimeDepEntry } from "./bundled-runtime-deps-specs.js";
export { createBundledRuntimeDepsInstallArgs, createBundledRuntimeDepsInstallEnv, installBundledRuntimeDeps, installBundledRuntimeDepsAsync, repairBundledRuntimeDepsInstallRoot, repairBundledRuntimeDepsInstallRootAsync, resolveBundledRuntimeDepsNpmRunner, withBundledRuntimeDepsFilesystemLock, };
export type { BundledRuntimeDepsNpmRunner };
export type { BundledRuntimeDepsInstallParams } from "./bundled-runtime-deps-install.js";
export type { RuntimeDepEntry } from "./bundled-runtime-deps-specs.js";
export { isWritableDirectory, pruneUnknownBundledRuntimeDepsRoots, resolveBundledRuntimeDependencyInstallRoot, resolveBundledRuntimeDependencyInstallRootInfo, resolveBundledRuntimeDependencyInstallRootPlan, resolveBundledRuntimeDependencyPackageInstallRoot, resolveBundledRuntimeDependencyPackageInstallRootPlan, resolveBundledRuntimeDependencyPackageRoot, };
export type { BundledRuntimeDepsInstallRoot, BundledRuntimeDepsInstallRootPlan, } from "./bundled-runtime-deps-roots.js";
export type { RuntimeDepConflict } from "./bundled-runtime-deps-selection.js";
export declare const __testing: {
    formatRuntimeDepsLockTimeoutMessage: typeof formatRuntimeDepsLockTimeoutMessage;
    resolveBundledRuntimeDepsPnpmRunner: typeof resolveBundledRuntimeDepsPnpmRunner;
    shouldRemoveRuntimeDepsLock: typeof shouldRemoveRuntimeDepsLock;
};
export type BundledRuntimeDepsEnsureResult = {
    installedSpecs: string[];
};
export type BundledRuntimeDepsPlan = {
    deps: RuntimeDepEntry[];
    missing: RuntimeDepEntry[];
    conflicts: RuntimeDepConflict[];
    installSpecs: string[];
    installRootPlan: BundledRuntimeDepsInstallRootPlan;
};
export declare function registerBundledRuntimeDependencyNodePath(rootDir: string): void;
export declare function clearBundledRuntimeDependencyNodePaths(): void;
export declare function createBundledRuntimeDepsInstallSpecs(params: {
    deps: readonly {
        name: string;
        version: string;
    }[];
}): string[];
export declare function scanBundledPluginRuntimeDeps(params: {
    packageRoot: string;
    config?: OpenClawConfig;
    pluginIds?: readonly string[];
    selectedPluginIds?: readonly string[];
    includeConfiguredChannels?: boolean;
    env?: NodeJS.ProcessEnv;
}): {
    deps: RuntimeDepEntry[];
    missing: RuntimeDepEntry[];
    conflicts: RuntimeDepConflict[];
};
export declare function createBundledRuntimeDependencyAliasMap(params: {
    pluginRoot: string;
    installRoot: string;
}): Record<string, string>;
export declare function ensureBundledPluginRuntimeDeps(params: {
    pluginId: string;
    pluginRoot: string;
    env: NodeJS.ProcessEnv;
    config?: OpenClawConfig;
    installDeps?: (params: BundledRuntimeDepsInstallParams) => void;
}): BundledRuntimeDepsEnsureResult;
