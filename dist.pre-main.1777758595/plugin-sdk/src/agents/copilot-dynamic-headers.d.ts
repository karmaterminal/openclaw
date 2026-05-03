import type { Context } from "@mariozechner/pi-ai";
export { buildCopilotIdeHeaders, COPILOT_EDITOR_PLUGIN_VERSION, COPILOT_EDITOR_VERSION, COPILOT_GITHUB_API_VERSION, COPILOT_USER_AGENT, } from "../plugin-sdk/provider-auth.js";
export declare function hasCopilotVisionInput(messages: Context["messages"]): boolean;
export declare function buildCopilotDynamicHeaders(params: {
    messages: Context["messages"];
    hasImages: boolean;
}): Record<string, string>;
