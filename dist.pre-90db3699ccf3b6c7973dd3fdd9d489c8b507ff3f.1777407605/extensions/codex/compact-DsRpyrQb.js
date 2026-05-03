import { c as isJsonObject } from "./shared-client-C5M1Nphx.js";
import { r as resolveCodexAppServerRuntimeOptions } from "./config-C9_NiPaE.js";
import { n as defaultCodexAppServerClientFactory, t as createCodexAppServerClientFactoryTestHooks } from "./client-factory-FO-824xT.js";
import { readCodexAppServerBinding } from "./session-binding-B50a7Hp4.js";
import { embeddedAgentLog } from "openclaw/plugin-sdk/agent-harness-runtime";
//#region extensions/codex/src/app-server/compact.ts
const DEFAULT_CODEX_COMPACTION_WAIT_TIMEOUT_MS = 300 * 1e3;
let clientFactory = defaultCodexAppServerClientFactory;
async function maybeCompactCodexAppServerSession(params, options = {}) {
	const appServer = resolveCodexAppServerRuntimeOptions({ pluginConfig: options.pluginConfig });
	const binding = await readCodexAppServerBinding(params.sessionFile);
	if (!binding?.threadId) return {
		ok: false,
		compacted: false,
		reason: "no codex app-server thread binding"
	};
	const requestedAuthProfileId = params.authProfileId?.trim() || void 0;
	if (requestedAuthProfileId && binding.authProfileId && binding.authProfileId !== requestedAuthProfileId) return {
		ok: false,
		compacted: false,
		reason: "auth profile mismatch for session binding"
	};
	const client = await clientFactory(appServer.start, requestedAuthProfileId ?? binding.authProfileId);
	const waiter = createCodexNativeCompactionWaiter(client, binding.threadId);
	let completion;
	try {
		await client.request("thread/compact/start", { threadId: binding.threadId });
		embeddedAgentLog.info("started codex app-server compaction", {
			sessionId: params.sessionId,
			threadId: binding.threadId
		});
		waiter.startTimeout();
		completion = await waiter.promise;
	} catch (error) {
		waiter.cancel();
		return {
			ok: false,
			compacted: false,
			reason: formatCompactionError(error)
		};
	}
	embeddedAgentLog.info("completed codex app-server compaction", {
		sessionId: params.sessionId,
		threadId: binding.threadId,
		signal: completion.signal,
		turnId: completion.turnId,
		itemId: completion.itemId
	});
	return {
		ok: true,
		compacted: true,
		result: {
			summary: "",
			firstKeptEntryId: "",
			tokensBefore: params.currentTokenCount ?? 0,
			details: {
				backend: "codex-app-server",
				threadId: binding.threadId,
				signal: completion.signal,
				turnId: completion.turnId,
				itemId: completion.itemId
			}
		}
	};
}
function createCodexNativeCompactionWaiter(client, threadId) {
	let settled = false;
	let removeHandler = () => {};
	let timeout;
	let failWaiter = () => {};
	return {
		promise: new Promise((resolve, reject) => {
			const cleanup = () => {
				removeHandler();
				if (timeout) clearTimeout(timeout);
			};
			const complete = (completion) => {
				if (settled) return;
				settled = true;
				cleanup();
				resolve(completion);
			};
			const fail = (error) => {
				if (settled) return;
				settled = true;
				cleanup();
				reject(error);
			};
			failWaiter = fail;
			const handler = (notification) => {
				const completion = readNativeCompactionCompletion(notification, threadId);
				if (completion) complete(completion);
			};
			removeHandler = client.addNotificationHandler(handler);
		}),
		startTimeout() {
			if (settled || timeout) return;
			timeout = setTimeout(() => {
				failWaiter(/* @__PURE__ */ new Error(`timed out waiting for codex app-server compaction for ${threadId}`));
			}, resolveCompactionWaitTimeoutMs());
			timeout.unref?.();
		},
		cancel() {
			if (settled) return;
			settled = true;
			removeHandler();
			if (timeout) clearTimeout(timeout);
		}
	};
}
function readNativeCompactionCompletion(notification, threadId) {
	const params = notification.params;
	if (!isJsonObject(params) || readString(params, "threadId", "thread_id") !== threadId) return;
	if (notification.method === "thread/compacted") return {
		signal: "thread/compacted",
		turnId: readString(params, "turnId", "turn_id")
	};
	if (notification.method !== "item/completed") return;
	const item = isJsonObject(params.item) ? params.item : void 0;
	if (readString(item, "type") !== "contextCompaction") return;
	return {
		signal: "item/completed",
		turnId: readString(params, "turnId", "turn_id"),
		itemId: readString(item, "id") ?? readString(params, "itemId", "item_id", "id")
	};
}
function resolveCompactionWaitTimeoutMs() {
	const raw = process.env.OPENCLAW_CODEX_COMPACTION_WAIT_TIMEOUT_MS?.trim();
	const parsed = raw ? Number.parseInt(raw, 10) : NaN;
	if (Number.isFinite(parsed) && parsed > 0) return parsed;
	return DEFAULT_CODEX_COMPACTION_WAIT_TIMEOUT_MS;
}
function readString(params, ...keys) {
	if (!params) return;
	for (const key of keys) {
		const value = params[key];
		if (typeof value === "string") return value;
	}
}
function formatCompactionError(error) {
	if (error instanceof Error) return error.message;
	return String(error);
}
createCodexAppServerClientFactoryTestHooks((factory) => {
	clientFactory = factory;
});
//#endregion
export { maybeCompactCodexAppServerSession };
