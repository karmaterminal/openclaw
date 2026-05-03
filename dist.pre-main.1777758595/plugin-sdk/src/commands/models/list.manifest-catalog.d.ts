import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { NormalizedModelCatalogRow } from "../../model-catalog/index.js";
type ManifestCatalogRowsForListMode = "static-authoritative" | "supplemental";
export declare function loadManifestCatalogRowsForList(params: {
    cfg: OpenClawConfig;
    providerFilter?: string;
    env?: NodeJS.ProcessEnv;
    mode?: ManifestCatalogRowsForListMode;
}): readonly NormalizedModelCatalogRow[];
export declare function loadStaticManifestCatalogRowsForList(params: {
    cfg: OpenClawConfig;
    providerFilter?: string;
    env?: NodeJS.ProcessEnv;
}): readonly NormalizedModelCatalogRow[];
export declare function loadSupplementalManifestCatalogRowsForList(params: {
    cfg: OpenClawConfig;
    providerFilter?: string;
    env?: NodeJS.ProcessEnv;
}): readonly NormalizedModelCatalogRow[];
export {};
