import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-DM8yIn8C.js";
import { u as ensureAgentWorkspace } from "./workspace-ibYRWzQC.js";
import { b as resolveAgentWorkspaceDir, y as resolveAgentDir } from "./agent-scope-zHoqFGPE.js";
import { p as resolveThinkingDefault } from "./model-selection-CZhXg7nY.js";
import { n as resolveAgentIdentity } from "./identity-3awe6JYT.js";
import "./sessions-CQdlpJUR.js";
import { i as resolveSessionFilePath, u as resolveStorePath } from "./paths-DOSS0HMP.js";
import { t as loadSessionStore } from "./store-load-BLzdjzCX.js";
import { a as saveSessionStore } from "./store-BD0Vlvaq.js";
import { t as resolveAgentTimeoutMs } from "./timeout-TgWmyBUs.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-B_oZaq8D.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.OPENCLAW_SUPPRESS_EXTENSION_API_WARNING !== "1") process.emitWarning("openclaw/extension-api is deprecated. Migrate to api.runtime.agent.* or focused openclaw/plugin-sdk/<subpath> imports. See https://docs.openclaw.ai/plugins/sdk-migration", {
	code: "OPENCLAW_EXTENSION_API_DEPRECATED",
	detail: "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://docs.openclaw.ai/plugins/sdk-migration"
});
//#endregion
export { DEFAULT_MODEL, DEFAULT_PROVIDER, ensureAgentWorkspace, loadSessionStore, resolveAgentDir, resolveAgentIdentity, resolveAgentTimeoutMs, resolveAgentWorkspaceDir, resolveSessionFilePath, resolveStorePath, resolveThinkingDefault, runEmbeddedPiAgent, saveSessionStore };
