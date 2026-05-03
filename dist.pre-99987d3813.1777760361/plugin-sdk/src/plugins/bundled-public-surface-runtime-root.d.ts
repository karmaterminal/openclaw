export type BundledPublicSurfaceLocation = {
    modulePath: string;
    boundaryRoot: string;
};
export declare function resolveBuiltBundledPluginRootFromModulePath(params: {
    modulePath: string;
    pluginId: string;
}): string | null;
export declare function prepareBuiltBundledPluginPublicSurfaceLocation(params: {
    location: BundledPublicSurfaceLocation;
    pluginId: string;
    env?: NodeJS.ProcessEnv;
    installRuntimeDeps?: boolean;
}): BundledPublicSurfaceLocation;
