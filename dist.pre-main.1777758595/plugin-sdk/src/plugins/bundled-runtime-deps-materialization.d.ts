export declare function readGeneratedInstallManifestSpecs(installRoot: string): string[] | null;
export declare function isRuntimeDepSatisfied(rootDir: string, dep: {
    name: string;
    version: string;
}): boolean;
export declare function isRuntimeDepSatisfiedInAnyRoot(dep: {
    name: string;
    version: string;
}, roots: readonly string[]): boolean;
export declare function isRuntimeDepsPlanMaterialized(installRoot: string, installSpecs: readonly string[]): boolean;
export declare function assertBundledRuntimeDepsInstalled(rootDir: string, specs: readonly string[]): void;
export declare function removeLegacyRuntimeDepsManifest(installRoot: string): void;
export declare function ensureNpmInstallExecutionManifest(installExecutionRoot: string, installSpecs?: readonly string[]): void;
