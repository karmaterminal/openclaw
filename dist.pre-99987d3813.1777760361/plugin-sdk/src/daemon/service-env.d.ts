import { isNodeVersionManagerRuntime, resolveLinuxSystemCaBundle } from "../bootstrap/node-extra-ca-certs.js";
export { isNodeVersionManagerRuntime, resolveLinuxSystemCaBundle };
export type MinimalServicePathOptions = {
    platform?: NodeJS.Platform;
    extraDirs?: string[];
    home?: string;
    cwd?: string;
    env?: Record<string, string | undefined>;
    existsSync?: (candidate: string) => boolean;
};
type BuildServicePathOptions = MinimalServicePathOptions & {
    env?: Record<string, string | undefined>;
};
export declare const SERVICE_PROXY_ENV_KEYS: readonly ["OPENCLAW_PROXY_URL", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "no_proxy", "all_proxy"];
/**
 * Resolve common user bin directories for macOS.
 * These are paths where npm global installs and node version managers typically place binaries.
 *
 * Key differences from Linux:
 * - fnm: macOS uses ~/Library/Application Support/fnm (not ~/.local/share/fnm)
 * - pnpm: macOS uses ~/Library/pnpm (not ~/.local/share/pnpm)
 */
export declare function resolveDarwinUserBinDirs(home: string | undefined, env?: Record<string, string | undefined>, existsSync?: (candidate: string) => boolean, options?: Pick<MinimalServicePathOptions, "cwd" | "home">): string[];
/**
 * Resolve common user bin directories for Linux.
 * These are paths where npm global installs and node version managers typically place binaries.
 */
export declare function resolveLinuxUserBinDirs(home: string | undefined, env?: Record<string, string | undefined>, existsSync?: (candidate: string) => boolean, options?: Pick<MinimalServicePathOptions, "cwd" | "home">): string[];
export declare function getMinimalServicePathParts(options?: MinimalServicePathOptions): string[];
export declare function getMinimalServicePathPartsFromEnv(options?: BuildServicePathOptions): string[];
export declare function buildMinimalServicePath(options?: BuildServicePathOptions): string;
export declare function buildServiceEnvironment(params: {
    env: Record<string, string | undefined>;
    port: number;
    launchdLabel?: string;
    platform?: NodeJS.Platform;
    extraPathDirs?: string[];
    execPath?: string;
}): Record<string, string | undefined>;
export declare function buildNodeServiceEnvironment(params: {
    env: Record<string, string | undefined>;
    platform?: NodeJS.Platform;
    extraPathDirs?: string[];
    execPath?: string;
}): Record<string, string | undefined>;
