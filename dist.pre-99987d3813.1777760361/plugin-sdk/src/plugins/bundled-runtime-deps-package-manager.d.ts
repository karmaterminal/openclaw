import fs from "node:fs";
export type BundledRuntimeDepsNpmRunner = {
    command: string;
    args: string[];
    env?: NodeJS.ProcessEnv;
};
export type BundledRuntimeDepsPackageManager = "pnpm" | "npm";
export type BundledRuntimeDepsPackageManagerRunner = BundledRuntimeDepsNpmRunner & {
    packageManager: BundledRuntimeDepsPackageManager;
};
export declare function createBundledRuntimeDepsInstallEnv(env: NodeJS.ProcessEnv, options?: {
    cacheDir?: string;
}): NodeJS.ProcessEnv;
export declare function createBundledRuntimeDepsInstallArgs(): string[];
export declare function resolveBundledRuntimeDepsNpmRunner(params: {
    npmArgs: string[];
    env?: NodeJS.ProcessEnv;
    execPath?: string;
    existsSync?: typeof fs.existsSync;
    platform?: NodeJS.Platform;
}): BundledRuntimeDepsNpmRunner;
export declare function resolveBundledRuntimeDepsPnpmRunner(params: {
    pnpmArgs: string[];
    env?: NodeJS.ProcessEnv;
    execPath?: string;
    existsSync?: typeof fs.existsSync;
    platform?: NodeJS.Platform;
}): BundledRuntimeDepsPackageManagerRunner | null;
export declare function resolveBundledRuntimeDepsPackageManagerRunner(params: {
    installExecutionRoot: string;
    env: NodeJS.ProcessEnv;
    npmArgs: string[];
}): BundledRuntimeDepsPackageManagerRunner;
