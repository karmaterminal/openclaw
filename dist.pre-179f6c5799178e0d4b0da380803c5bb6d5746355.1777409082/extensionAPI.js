import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-Db0k6oKb.js";
import { u as ensureAgentWorkspace } from "./workspace-BoT_VDZH.js";
import { b as resolveAgentWorkspaceDir, y as resolveAgentDir } from "./agent-scope-Cmx30dd2.js";
import { p as resolveThinkingDefault } from "./model-selection-CZMUiuFR.js";
import { n as resolveAgentIdentity } from "./identity-Dok0oB-y.js";
import { i as saveSessionStore } from "./store-YSRCrOf6.js";
import "./sessions-CD6GeuLj.js";
import { i as resolveSessionFilePath, u as resolveStorePath } from "./paths-C9Qq8LIv.js";
import { t as loadSessionStore } from "./store-load-DghVySJ7.js";
import { t as resolveAgentTimeoutMs } from "./timeout-DPG38lna.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-BzWwX_Ok.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.OPENCLAW_SUPPRESS_EXTENSION_API_WARNING !== "1") process.emitWarning("openclaw/extension-api is deprecated. Migrate to api.runtime.agent.* or focused openclaw/plugin-sdk/<subpath> imports. See https://docs.openclaw.ai/plugins/sdk-migration", {
	code: "OPENCLAW_EXTENSION_API_DEPRECATED",
	detail: "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://docs.openclaw.ai/plugins/sdk-migration"
});
//#endregion
export { DEFAULT_MODEL, DEFAULT_PROVIDER, ensureAgentWorkspace, loadSessionStore, resolveAgentDir, resolveAgentIdentity, resolveAgentTimeoutMs, resolveAgentWorkspaceDir, resolveSessionFilePath, resolveStorePath, resolveThinkingDefault, runEmbeddedPiAgent, saveSessionStore };
