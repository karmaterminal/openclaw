import { t as __exportAll } from "./rolldown-runtime-DUslC3ob.js";
import { t as getMatrixScopedEnvVarNames } from "./env-vars-KF01E9CM.js";
import { i as resolveScopedMatrixEnvConfig, r as resolveMatrixEnvAuthReadiness, t as hasReadyMatrixEnvAuth } from "./env-auth-CZGZEhLW.js";
import { n as validateMatrixHomeserverUrl, t as resolveValidatedMatrixHomeserverUrl } from "./url-validation-Bl0WGrAg.js";
import { t as isBunRuntime } from "./runtime-DiJjx5FN.js";
import { i as resolveMatrixConfigForAccount, n as resolveMatrixAuth, r as resolveMatrixAuthContext, t as backfillMatrixAuthDeviceIdAfterStartup } from "./config-CpHvZGxt.js";
import { t as createMatrixClient } from "./create-client-b28tWeXd.js";
import { i as resolveSharedMatrixClient, n as releaseSharedClientInstance, o as stopSharedClientForAccount, r as removeSharedClientInstance, s as stopSharedClientInstance, t as acquireSharedMatrixClient } from "./shared-L0iFKL1f.js";
//#region extensions/matrix/src/matrix/client.ts
var client_exports = /* @__PURE__ */ __exportAll({
	acquireSharedMatrixClient: () => acquireSharedMatrixClient,
	backfillMatrixAuthDeviceIdAfterStartup: () => backfillMatrixAuthDeviceIdAfterStartup,
	createMatrixClient: () => createMatrixClient,
	getMatrixScopedEnvVarNames: () => getMatrixScopedEnvVarNames,
	hasReadyMatrixEnvAuth: () => hasReadyMatrixEnvAuth,
	isBunRuntime: () => isBunRuntime,
	releaseSharedClientInstance: () => releaseSharedClientInstance,
	removeSharedClientInstance: () => removeSharedClientInstance,
	resolveMatrixAuth: () => resolveMatrixAuth,
	resolveMatrixAuthContext: () => resolveMatrixAuthContext,
	resolveMatrixConfigForAccount: () => resolveMatrixConfigForAccount,
	resolveMatrixEnvAuthReadiness: () => resolveMatrixEnvAuthReadiness,
	resolveScopedMatrixEnvConfig: () => resolveScopedMatrixEnvConfig,
	resolveSharedMatrixClient: () => resolveSharedMatrixClient,
	resolveValidatedMatrixHomeserverUrl: () => resolveValidatedMatrixHomeserverUrl,
	stopSharedClientForAccount: () => stopSharedClientForAccount,
	stopSharedClientInstance: () => stopSharedClientInstance,
	validateMatrixHomeserverUrl: () => validateMatrixHomeserverUrl
});
//#endregion
export { client_exports as t };
