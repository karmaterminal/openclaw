import { u as normalizeE164 } from "./utils-BMRcljdi.js";
import { a as loadConfig } from "./io-5jzTw2vS.js";
import { i as handlePortError, n as describePortOwner, r as ensurePortAvailable, t as PortInUseError } from "./ports-CfLGGRA3.js";
import "./config-CzLCUGML.js";
import { u as resolveStorePath } from "./paths-aVTuLlts.js";
import { t as loadSessionStore } from "./store-load-Bm74f3zN.js";
import { a as saveSessionStore } from "./store-DtATwbu4.js";
import { n as resolveSessionKey, t as deriveSessionKey } from "./session-key-tTdbuatw.js";
import { t as applyTemplate } from "./templating-BP_wOZq1.js";
import { t as waitForever } from "./wait-CeGFehKh.js";
import { t as createDefaultDeps } from "./deps-BuwER1Yg.js";
//#region src/library.ts
let replyRuntimePromise = null;
let promptRuntimePromise = null;
let binariesRuntimePromise = null;
let execRuntimePromise = null;
let webChannelRuntimePromise = null;
function loadReplyRuntime() {
	replyRuntimePromise ??= import("./reply.runtime-TP-zyZxt.js");
	return replyRuntimePromise;
}
function loadPromptRuntime() {
	promptRuntimePromise ??= import("./prompt-CzhcLljc.js");
	return promptRuntimePromise;
}
function loadBinariesRuntime() {
	binariesRuntimePromise ??= import("./binaries-BU5AvV82.js");
	return binariesRuntimePromise;
}
function loadExecRuntime() {
	execRuntimePromise ??= import("./exec-CZSyai4T.js");
	return execRuntimePromise;
}
function loadWebChannelRuntime() {
	webChannelRuntimePromise ??= import("./runtime-web-channel-plugin-sGpbrI1V.js");
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
