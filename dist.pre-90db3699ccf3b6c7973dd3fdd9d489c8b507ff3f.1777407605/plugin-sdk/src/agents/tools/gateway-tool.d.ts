import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { type AnyAgentTool } from "./common.js";
/** @internal Exposed for regression tests only; do not import from runtime code. */
export declare const PROTECTED_GATEWAY_CONFIG_PATHS_FOR_TEST: readonly ["tools.exec.ask", "tools.exec.security", "tools.exec.safeBins", "tools.exec.safeBinProfiles", "tools.exec.safeBinTrustedDirs", "tools.exec.strictInlineEval", "tools.fs", "agents.defaults.sandbox", "agents.sandbox", "sandbox", "agents.list[].sandbox", "agents.list[].tools", "agents.list[].embeddedPi", "tools.subagents", "plugins.enabled", "plugins.allow", "plugins.deny", "plugins.entries", "plugins.installs", "plugins.load", "plugins.slots", "gateway.auth", "gateway.tls", "gateway.tools.allow", "gateway.tools.deny", "hooks.token", "hooks.allowRequestSessionKey", "hooks.defaultSessionKey", "hooks.allowedSessionKeyPrefixes", "hooks.internal.load.extraDirs", "hooks.transformsDir", "hooks.mappings", "browser.ssrfPolicy", "tools.web.fetch.ssrfPolicy", "mcp.servers"];
/** @internal Exposed for regression tests only; do not import from runtime code. */
export declare function assertGatewayConfigMutationAllowedForTest(params: {
    action: "config.apply" | "config.patch";
    currentConfig: Record<string, unknown>;
    raw: string;
}): void;
export declare function createGatewayTool(opts?: {
    agentSessionKey?: string;
    config?: OpenClawConfig;
}): AnyAgentTool;
