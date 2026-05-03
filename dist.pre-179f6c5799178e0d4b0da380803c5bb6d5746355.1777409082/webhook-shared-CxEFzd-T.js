import { c as normalizeOptionalString } from "./string-coerce-C1IzJjqi.js";
import "./text-runtime-CF6GykCk.js";
import { t as normalizeWebhookPath } from "./webhook-path-D9opjpz6.js";
//#region extensions/bluebubbles/src/webhook-shared.ts
const DEFAULT_WEBHOOK_PATH = "/bluebubbles-webhook";
function resolveWebhookPathFromConfig(config) {
	const raw = normalizeOptionalString(config?.webhookPath);
	if (raw) return normalizeWebhookPath(raw);
	return DEFAULT_WEBHOOK_PATH;
}
//#endregion
export { resolveWebhookPathFromConfig as n, DEFAULT_WEBHOOK_PATH as t };
