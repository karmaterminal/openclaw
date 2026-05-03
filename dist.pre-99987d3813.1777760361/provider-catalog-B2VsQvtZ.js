import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-6iwyQGK_.js";
//#region extensions/stepfun/openclaw.plugin.json
var modelCatalog = {
	"providers": {
		"stepfun": {
			"baseUrl": "https://api.stepfun.ai/v1",
			"api": "openai-completions",
			"models": [{
				"id": "step-3.5-flash",
				"name": "Step 3.5 Flash",
				"reasoning": true,
				"input": ["text"],
				"contextWindow": 262144,
				"maxTokens": 65536,
				"cost": {
					"input": 0,
					"output": 0,
					"cacheRead": 0,
					"cacheWrite": 0
				}
			}]
		},
		"stepfun-plan": {
			"baseUrl": "https://api.stepfun.ai/step_plan/v1",
			"api": "openai-completions",
			"models": [{
				"id": "step-3.5-flash",
				"name": "Step 3.5 Flash",
				"reasoning": true,
				"input": ["text"],
				"contextWindow": 262144,
				"maxTokens": 65536,
				"cost": {
					"input": 0,
					"output": 0,
					"cacheRead": 0,
					"cacheWrite": 0
				}
			}, {
				"id": "step-3.5-flash-2603",
				"name": "Step 3.5 Flash 2603",
				"reasoning": true,
				"input": ["text"],
				"contextWindow": 262144,
				"maxTokens": 65536,
				"cost": {
					"input": 0,
					"output": 0,
					"cacheRead": 0,
					"cacheWrite": 0
				}
			}]
		}
	},
	"discovery": {
		"stepfun": "static",
		"stepfun-plan": "static"
	}
};
//#endregion
//#region extensions/stepfun/provider-catalog.ts
const STEPFUN_PROVIDER_ID = "stepfun";
const STEPFUN_PLAN_PROVIDER_ID = "stepfun-plan";
const STEPFUN_STANDARD_CN_BASE_URL = "https://api.stepfun.com/v1";
const STEPFUN_STANDARD_INTL_BASE_URL = "https://api.stepfun.ai/v1";
const STEPFUN_PLAN_CN_BASE_URL = "https://api.stepfun.com/step_plan/v1";
const STEPFUN_PLAN_INTL_BASE_URL = "https://api.stepfun.ai/step_plan/v1";
const STEPFUN_DEFAULT_MODEL_ID = "step-3.5-flash";
const STEPFUN_FLASH_2603_MODEL_ID = "step-3.5-flash-2603";
const STEPFUN_DEFAULT_MODEL_REF = `${STEPFUN_PROVIDER_ID}/${STEPFUN_DEFAULT_MODEL_ID}`;
const STEPFUN_PLAN_DEFAULT_MODEL_REF = `${STEPFUN_PLAN_PROVIDER_ID}/${STEPFUN_DEFAULT_MODEL_ID}`;
function buildStepFunManifestProvider(providerId, baseUrl) {
	const provider = buildManifestModelProviderConfig({
		providerId,
		catalog: modelCatalog.providers[providerId]
	});
	return provider.baseUrl === baseUrl ? provider : {
		...provider,
		baseUrl
	};
}
function buildStepFunProvider(baseUrl = STEPFUN_STANDARD_INTL_BASE_URL) {
	return buildStepFunManifestProvider(STEPFUN_PROVIDER_ID, baseUrl);
}
function buildStepFunPlanProvider(baseUrl = STEPFUN_PLAN_INTL_BASE_URL) {
	return buildStepFunManifestProvider(STEPFUN_PLAN_PROVIDER_ID, baseUrl);
}
//#endregion
export { STEPFUN_PLAN_DEFAULT_MODEL_REF as a, STEPFUN_PROVIDER_ID as c, buildStepFunPlanProvider as d, buildStepFunProvider as f, STEPFUN_PLAN_CN_BASE_URL as i, STEPFUN_STANDARD_CN_BASE_URL as l, STEPFUN_DEFAULT_MODEL_REF as n, STEPFUN_PLAN_INTL_BASE_URL as o, STEPFUN_FLASH_2603_MODEL_ID as r, STEPFUN_PLAN_PROVIDER_ID as s, STEPFUN_DEFAULT_MODEL_ID as t, STEPFUN_STANDARD_INTL_BASE_URL as u };
