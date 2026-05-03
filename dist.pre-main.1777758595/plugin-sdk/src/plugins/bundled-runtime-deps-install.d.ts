export type BundledRuntimeDepsInstallParams = {
    installRoot: string;
    installExecutionRoot?: string;
    missingSpecs: string[];
    installSpecs?: string[];
    warn?: (message: string) => void;
};
export declare function installBundledRuntimeDeps(params: {
    installRoot: string;
    installExecutionRoot?: string;
    missingSpecs: string[];
    installSpecs?: string[];
    env: NodeJS.ProcessEnv;
    warn?: (message: string) => void;
}): void;
export declare function installBundledRuntimeDepsAsync(params: {
    installRoot: string;
    installExecutionRoot?: string;
    missingSpecs: string[];
    installSpecs?: string[];
    env: NodeJS.ProcessEnv;
    warn?: (message: string) => void;
    onProgress?: (message: string) => void;
}): Promise<void>;
export declare function repairBundledRuntimeDepsInstallRoot(params: {
    installRoot: string;
    missingSpecs: string[];
    installSpecs: string[];
    env: NodeJS.ProcessEnv;
    installDeps?: (params: BundledRuntimeDepsInstallParams) => void;
    warn?: (message: string) => void;
}): {
    installSpecs: string[];
};
export declare function repairBundledRuntimeDepsInstallRootAsync(params: {
    installRoot: string;
    missingSpecs: string[];
    installSpecs: string[];
    env: NodeJS.ProcessEnv;
    installDeps?: (params: BundledRuntimeDepsInstallParams) => Promise<void>;
    warn?: (message: string) => void;
    onProgress?: (message: string) => void;
}): Promise<{
    installSpecs: string[];
}>;
