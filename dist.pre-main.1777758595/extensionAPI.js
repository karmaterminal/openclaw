import { b as resolveAgentDir, x as resolveAgentWorkspaceDir } from "./agent-scope-DfXPuZUf.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-CyUAeHC6.js";
import { i as resolveSessionFilePath, u as resolveStorePath } from "./paths-BCOWYnec.js";
import { t as loadSessionStore } from "./store-load-CDajuL7y.js";
import { a as saveSessionStore } from "./store-APN60wqF.js";
import "./sessions-DTfZDTku.js";
import { p as resolveThinkingDefault } from "./model-selection-DJFAuwNY.js";
import { l as ensureAgentWorkspace } from "./workspace-DSIvVEKH.js";
import { n as resolveAgentIdentity } from "./identity-Cojf61YG.js";
import { t as resolveAgentTimeoutMs } from "./timeout-CRld88BP.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-BRAWqaVM.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.OPENCLAW_SUPPRESS_EXTENSION_API_WARNING !== "1") process.emitWarning("openclaw/extension-api is deprecated. Migrate to api.runtime.agent.* or focused openclaw/plugin-sdk/<subpath> imports. See https://docs.openclaw.ai/plugins/sdk-migration", {
	code: "OPENCLAW_EXTENSION_API_DEPRECATED",
	detail: "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://docs.openclaw.ai/plugins/sdk-migration"
});
//#endregion
export { DEFAULT_MODEL, DEFAULT_PROVIDER, ensureAgentWorkspace, loadSessionStore, resolveAgentDir, resolveAgentIdentity, resolveAgentTimeoutMs, resolveAgentWorkspaceDir, resolveSessionFilePath, resolveStorePath, resolveThinkingDefault, runEmbeddedPiAgent, saveSessionStore };
