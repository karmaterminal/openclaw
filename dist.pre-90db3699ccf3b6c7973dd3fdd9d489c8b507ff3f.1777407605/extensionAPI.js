import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-BofKZKJ4.js";
import { d as ensureAgentWorkspace } from "./workspace-DGJIk8rw.js";
import { b as resolveAgentWorkspaceDir, y as resolveAgentDir } from "./agent-scope-D-T17Rdc.js";
import { p as resolveThinkingDefault } from "./model-selection-B7RNWcLj.js";
import { n as resolveAgentIdentity } from "./identity-CxDbUUP-.js";
import { i as saveSessionStore } from "./store-COeaE7A7.js";
import "./sessions-THKm0e_w.js";
import { i as resolveSessionFilePath, u as resolveStorePath } from "./paths-D6msg0S1.js";
import { t as loadSessionStore } from "./store-load-Bi019EcE.js";
import { t as resolveAgentTimeoutMs } from "./timeout-htOXkzfH.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-runner-BrTbOgS7.js";
import "./pi-embedded-CdgYjVtp.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.OPENCLAW_SUPPRESS_EXTENSION_API_WARNING !== "1") process.emitWarning("openclaw/extension-api is deprecated. Migrate to api.runtime.agent.* or focused openclaw/plugin-sdk/<subpath> imports. See https://docs.openclaw.ai/plugins/sdk-migration", {
	code: "OPENCLAW_EXTENSION_API_DEPRECATED",
	detail: "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://docs.openclaw.ai/plugins/sdk-migration"
});
//#endregion
export { DEFAULT_MODEL, DEFAULT_PROVIDER, ensureAgentWorkspace, loadSessionStore, resolveAgentDir, resolveAgentIdentity, resolveAgentTimeoutMs, resolveAgentWorkspaceDir, resolveSessionFilePath, resolveStorePath, resolveThinkingDefault, runEmbeddedPiAgent, saveSessionStore };
