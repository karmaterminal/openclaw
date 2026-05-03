import type { ModelDefinitionConfig, ModelProviderConfig } from "../../config/types.models.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
export type ModelAddAdapter = {
    providerId: string;
    bootstrapProviderConfig?: (cfg: OpenClawConfig) => ModelProviderConfig | null;
    detect?: (params: {
        cfg: OpenClawConfig;
        providerConfig: ModelProviderConfig;
        modelId: string;
    }) => Promise<{
        found: boolean;
        model?: ModelDefinitionConfig;
        warnings?: string[];
    }>;
};
type AddModelOutcome = {
    provider: string;
    modelId: string;
    existed: boolean;
    allowlistAdded: boolean;
    warnings: string[];
};
export declare function listAddableProviders(params: {
    cfg: OpenClawConfig;
    discoveredProviders?: readonly string[];
}): string[];
export declare function validateAddProvider(params: {
    cfg: OpenClawConfig;
    provider: string;
    discoveredProviders?: readonly string[];
}): {
    ok: true;
    provider: string;
} | {
    ok: false;
    providers: string[];
};
export declare function detectProviderModelDefinition(params: {
    cfg: OpenClawConfig;
    provider: string;
    modelId: string;
}): Promise<{
    supported: boolean;
    found: boolean;
    model?: ModelDefinitionConfig;
    warnings: string[];
}>;
export declare function addModelToConfig(params: {
    cfg: OpenClawConfig;
    provider: string;
    modelId: string;
}): Promise<{
    ok: true;
    result: AddModelOutcome;
} | {
    ok: false;
    error: string;
}>;
export {};
