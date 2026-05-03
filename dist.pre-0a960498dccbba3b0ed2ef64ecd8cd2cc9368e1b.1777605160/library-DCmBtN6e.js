import { u as normalizeE164 } from "./utils-BMRcljdi.js";
import { a as loadConfig } from "./io-Cs-0dhMf.js";
import { i as handlePortError, n as describePortOwner, r as ensurePortAvailable, t as PortInUseError } from "./ports-BNt4VvHz.js";
import "./config-DaTMB1pm.js";
import { u as resolveStorePath } from "./paths-DvU8Tgvw.js";
import { t as loadSessionStore } from "./store-load-DYALOLpQ.js";
import { i as saveSessionStore } from "./store-Ci-m4oZ1.js";
import { n as resolveSessionKey, t as deriveSessionKey } from "./session-key-KThj4jtx.js";
import { t as applyTemplate } from "./templating-CE57Ub-U.js";
import { t as waitForever } from "./wait-DA7pF7Ah.js";
import { t as createDefaultDeps } from "./deps-Cq4bhoB8.js";
//#region src/library.ts
let replyRuntimePromise = null;
let promptRuntimePromise = null;
let binariesRuntimePromise = null;
let execRuntimePromise = null;
let webChannelRuntimePromise = null;
function loadReplyRuntime() {
	replyRuntimePromise ??= import("./reply.runtime-CrSnOoey.js");
	return replyRuntimePromise;
}
function loadPromptRuntime() {
	promptRuntimePromise ??= import("./prompt-C8_Y908R.js");
	return promptRuntimePromise;
}
function loadBinariesRuntime() {
	binariesRuntimePromise ??= import("./binaries-CGXfq-Yi.js");
	return binariesRuntimePromise;
}
function loadExecRuntime() {
	execRuntimePromise ??= import("./exec-DvJJFPHo.js");
	return execRuntimePromise;
}
function loadWebChannelRuntime() {
	webChannelRuntimePromise ??= import("./runtime-web-channel-plugin-Cf7A-Ei5.js");
	return webChannelRuntimePromise;
}
const getReplyFromConfig = async (...args) => (await loadReplyRuntime()).getReplyFromConfig(...args);
const promptYesNo = async (...args) => (await loadPromptRuntime()).promptYesNo(...args);
const ensureBinary = async (...args) => (await loadBinariesRuntime()).ensureBinary(...args);
const runExec = async (...args) => (await loadExecRuntime()).runExec(...args);
const runCommandWithTimeout = async (...args) => (await loadExecRuntime()).runCommandWithTimeout(...args);
const monitorWebChannel = async (...args) => (await loadWebChannelRuntime()).monitorWebChannel(...args);
//#endregion
export { PortInUseError, applyTemplate, createDefaultDeps, deriveSessionKey, describePortOwner, ensureBinary, ensurePortAvailable, getReplyFromConfig, handlePortError, loadConfig, loadSessionStore, monitorWebChannel, normalizeE164, promptYesNo, resolveSessionKey, resolveStorePath, runCommandWithTimeout, runExec, saveSessionStore, waitForever };
