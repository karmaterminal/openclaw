export declare const GATEWAY_STARTUP_UNAVAILABLE_REASON = "startup-sidecars";
export declare const GATEWAY_STARTUP_RETRY_AFTER_MS = 500;
export declare const GATEWAY_STARTUP_RETRY_MIN_MS = 100;
export declare const GATEWAY_STARTUP_RETRY_MAX_MS = 2000;
export type GatewayStartupUnavailableDetails = {
    reason: typeof GATEWAY_STARTUP_UNAVAILABLE_REASON;
};
export declare function gatewayStartupUnavailableDetails(): GatewayStartupUnavailableDetails;
export declare function isGatewayStartupUnavailableDetails(details: unknown): details is GatewayStartupUnavailableDetails;
export declare function isRetryableGatewayStartupUnavailableError(error: unknown): boolean;
export declare function resolveGatewayStartupRetryAfterMs(error: unknown): number | null;
