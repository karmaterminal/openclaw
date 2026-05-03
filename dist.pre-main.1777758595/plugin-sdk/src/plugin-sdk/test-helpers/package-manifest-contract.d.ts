type PackageManifestContractParams = {
    pluginId: string;
    pluginLocalRuntimeDeps?: string[];
    mirroredRootRuntimeDeps?: string[];
    minHostVersionBaseline?: string;
};
export declare function describePackageManifestContract(params: PackageManifestContractParams): void;
export {};
