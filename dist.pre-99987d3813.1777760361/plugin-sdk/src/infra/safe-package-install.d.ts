import type { NpmProjectInstallEnvOptions } from "./npm-install-env.js";
export type SafeNpmInstallEnvOptions = NpmProjectInstallEnvOptions & {
    legacyPeerDeps?: boolean;
    packageLock?: boolean;
    quiet?: boolean;
};
export type SafeNpmInstallArgsOptions = {
    loglevel?: "error" | "silent";
    noAudit?: boolean;
    noFund?: boolean;
    omitDev?: boolean;
};
export declare function createSafeNpmInstallEnv(env: NodeJS.ProcessEnv, options?: SafeNpmInstallEnvOptions): NodeJS.ProcessEnv;
export declare function createSafeNpmInstallArgs(options?: SafeNpmInstallArgsOptions): string[];
