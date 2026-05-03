import type { OpenClawConfig } from "../config/types.openclaw.js";
import { type BundledRuntimeDepsInstallParams } from "./bundled-runtime-deps.js";
export type PreparedBundledPluginRuntimeLoadRoot = {
    pluginRoot: string;
    modulePath: string;
    setupModulePath?: string;
};
export declare function isBuiltBundledPluginRuntimeRoot(pluginRoot: string): boolean;
export declare function prepareBundledPluginRuntimeRoot(params: {
    pluginId: string;
    pluginRoot: string;
    modulePath: string;
    env?: NodeJS.ProcessEnv;
    logInstalled?: (installedSpecs: readonly string[]) => void;
}): {
    pluginRoot: string;
    modulePath: string;
};
export declare function prepareBundledPluginRuntimeLoadRoot(params: {
    pluginId: string;
    pluginRoot: string;
    modulePath: string;
    setupModulePath?: string;
    env?: NodeJS.ProcessEnv;
    config?: OpenClawConfig;
    installDeps?: (params: BundledRuntimeDepsInstallParams) => void;
    registerRuntimeAliasRoot?: (rootDir: string) => void;
    logInstalled?: (installedSpecs: readonly string[]) => void;
}): PreparedBundledPluginRuntimeLoadRoot;
export declare function ensureOpenClawPluginSdkAlias(distRoot: string): void;
