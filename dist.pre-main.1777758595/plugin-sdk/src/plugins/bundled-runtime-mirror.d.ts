type BundledRuntimeMirrorMetadata = {
    version: number;
    pluginId: string;
    sourceRoot: string;
    sourceFingerprint: string;
};
export type PrecomputedBundledRuntimeMirrorMetadata = Pick<BundledRuntimeMirrorMetadata, "sourceRoot" | "sourceFingerprint">;
export declare function refreshBundledPluginRuntimeMirrorRoot(params: {
    pluginId: string;
    sourceRoot: string;
    targetRoot: string;
    tempDirParent?: string;
    precomputedSourceMetadata?: PrecomputedBundledRuntimeMirrorMetadata;
}): boolean;
export declare function copyBundledPluginRuntimeRoot(sourceRoot: string, targetRoot: string): void;
export declare function materializeBundledRuntimeMirrorFile(sourcePath: string, targetPath: string): void;
export declare function precomputeBundledRuntimeMirrorMetadata(params: {
    sourceRoot: string;
}): PrecomputedBundledRuntimeMirrorMetadata;
export {};
