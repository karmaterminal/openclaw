export type RuntimeDepEntry = {
    name: string;
    version: string;
    pluginIds: string[];
};
export declare function normalizeInstallableRuntimeDepName(rawName: string): string | null;
export declare function parseInstallableRuntimeDep(name: string, rawVersion: unknown): {
    name: string;
    version: string;
} | null;
export declare function parseInstallableRuntimeDepSpec(spec: string): {
    name: string;
    version: string;
};
export declare function normalizeRuntimeDepSpecs(specs: readonly string[]): string[];
export declare function collectPackageRuntimeDeps(packageJson: Record<string, unknown>): Record<string, unknown>;
export declare function resolveDependencySentinelAbsolutePath(rootDir: string, depName: string): string;
