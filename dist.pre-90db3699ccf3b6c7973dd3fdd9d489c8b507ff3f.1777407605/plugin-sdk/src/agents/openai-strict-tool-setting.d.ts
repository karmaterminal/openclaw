type OpenAITransportKind = "stream" | "websocket";
type OpenAIStrictToolModel = {
    provider?: unknown;
    api?: unknown;
    baseUrl?: unknown;
    id?: unknown;
    compat?: {
        supportsStore?: boolean;
    };
};
export declare function resolvesToNativeOpenAIStrictTools(model: OpenAIStrictToolModel, transport: OpenAITransportKind): boolean;
export declare function resolveOpenAIStrictToolSetting(model: OpenAIStrictToolModel, options?: {
    transport?: OpenAITransportKind;
    supportsStrictMode?: boolean;
}): boolean | undefined;
export {};
