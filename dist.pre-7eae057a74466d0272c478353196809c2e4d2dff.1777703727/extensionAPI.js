import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-CV5sAt-u.js";
import { u as ensureAgentWorkspace } from "./workspace-CeVfBCfB.js";
import { b as resolveAgentWorkspaceDir, y as resolveAgentDir } from "./agent-scope-BrwtzVtf.js";
import { p as resolveThinkingDefault } from "./model-selection-DwvfvFe2.js";
import { i as resolveSessionFilePath, u as resolveStorePath } from "./paths-aVTuLlts.js";
import { t as loadSessionStore } from "./store-load-Z1IBOlxt.js";
import { a as saveSessionStore } from "./store-Cf_mjUkP.js";
import "./sessions-CTeI8wwA.js";
import { n as resolveAgentIdentity } from "./identity-DEWU7t9T.js";
import { t as resolveAgentTimeoutMs } from "./timeout-CN1Egm-P.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-DG5lwphr.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.OPENCLAW_SUPPRESS_EXTENSION_API_WARNING !== "1") process.emitWarning("openclaw/extension-api is deprecated. Migrate to api.runtime.agent.* or focused openclaw/plugin-sdk/<subpath> imports. See https://docs.openclaw.ai/plugins/sdk-migration", {
	code: "OPENCLAW_EXTENSION_API_DEPRECATED",
	detail: "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://docs.openclaw.ai/plugins/sdk-migration"
});
//#endregion
export { DEFAULT_MODEL, DEFAULT_PROVIDER, ensureAgentWorkspace, loadSessionStore, resolveAgentDir, resolveAgentIdentity, resolveAgentTimeoutMs, resolveAgentWorkspaceDir, resolveSessionFilePath, resolveStorePath, resolveThinkingDefault, runEmbeddedPiAgent, saveSessionStore };
