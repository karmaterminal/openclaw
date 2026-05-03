import { u as normalizeE164 } from "./utils-BMRcljdi.js";
import { a as loadConfig } from "./io-HGX0xk55.js";
import { i as handlePortError, n as describePortOwner, r as ensurePortAvailable, t as PortInUseError } from "./ports-Dr5GDon3.js";
import "./config-B3U8IbHS.js";
import { u as resolveStorePath } from "./paths-DOSS0HMP.js";
import { t as loadSessionStore } from "./store-load-BLzdjzCX.js";
import { a as saveSessionStore } from "./store-BD0Vlvaq.js";
import { n as resolveSessionKey, t as deriveSessionKey } from "./session-key-DWUX-Bck.js";
import { t as applyTemplate } from "./templating-DDiaYZXd.js";
import { t as waitForever } from "./wait-DyIMkGxY.js";
import { t as createDefaultDeps } from "./deps-BkoaWDDj.js";
//#region src/library.ts
let replyRuntimePromise = null;
let promptRuntimePromise = null;
let binariesRuntimePromise = null;
let execRuntimePromise = null;
let webChannelRuntimePromise = null;
function loadReplyRuntime() {
	replyRuntimePromise ??= import("./reply.runtime-BBAzItIZ.js");
	return replyRuntimePromise;
}
function loadPromptRuntime() {
	promptRuntimePromise ??= import("./prompt-C_5jQAi1.js");
	return promptRuntimePromise;
}
function loadBinariesRuntime() {
	binariesRuntimePromise ??= import("./binaries-BlUqC4qr.js");
	return binariesRuntimePromise;
}
function loadExecRuntime() {
	execRuntimePromise ??= import("./exec-C1J3LejB.js");
	return execRuntimePromise;
}
function loadWebChannelRuntime() {
	webChannelRuntimePromise ??= import("./runtime-web-channel-plugin-CWx3ftkm.js");
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
