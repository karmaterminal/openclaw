export declare function clearBundledRuntimeDistMirrorPreparationCache(): void;
export declare function shouldReusePreparedBundledRuntimeDistMirror(params: {
    sourceDistRoot: string;
    mirrorDistRoot: string;
}): boolean;
export declare function markBundledRuntimeDistMirrorPrepared(params: {
    sourceDistRoot: string;
    mirrorDistRoot: string;
}): void;
