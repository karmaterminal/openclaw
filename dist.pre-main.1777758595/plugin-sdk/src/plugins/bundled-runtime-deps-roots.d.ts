export type BundledRuntimeDepsInstallRoot = {
    installRoot: string;
    external: boolean;
};
export type BundledRuntimeDepsInstallRootPlan = BundledRuntimeDepsInstallRoot & {
    searchRoots: string[];
};
export declare function isSourceCheckoutRoot(packageRoot: string): boolean;
export declare function resolveBundledRuntimeDependencyPackageRoot(pluginRoot: string): string | null;
export declare function isWritableDirectory(dir: string): boolean;
export declare function pruneUnknownBundledRuntimeDepsRoots(params?: {
    env?: NodeJS.ProcessEnv;
    nowMs?: number;
    maxRootsToKeep?: number;
    minAgeMs?: number;
    warn?: (message: string) => void;
}): {
    scanned: number;
    removed: number;
    skippedLocked: number;
};
export declare function resolveBundledRuntimeDependencyPackageInstallRootPlan(packageRoot: string, options?: {
    env?: NodeJS.ProcessEnv;
    forceExternal?: boolean;
}): BundledRuntimeDepsInstallRootPlan;
export declare function resolveBundledRuntimeDependencyPackageInstallRoot(packageRoot: string, options?: {
    env?: NodeJS.ProcessEnv;
    forceExternal?: boolean;
}): string;
export declare function resolveBundledRuntimeDependencyInstallRootPlan(pluginRoot: string, options?: {
    env?: NodeJS.ProcessEnv;
    forceExternal?: boolean;
}): BundledRuntimeDepsInstallRootPlan;
export declare function resolveBundledRuntimeDependencyInstallRoot(pluginRoot: string, options?: {
    env?: NodeJS.ProcessEnv;
    forceExternal?: boolean;
}): string;
export declare function resolveBundledRuntimeDependencyInstallRootInfo(pluginRoot: string, options?: {
    env?: NodeJS.ProcessEnv;
    forceExternal?: boolean;
}): BundledRuntimeDepsInstallRoot;
