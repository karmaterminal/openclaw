//#region src/agents/self-hosted-provider-defaults.ts
const SELF_HOSTED_DEFAULT_CONTEXT_WINDOW = 128e3;
const SELF_HOSTED_DEFAULT_MAX_TOKENS = 8192;
const SELF_HOSTED_DEFAULT_COST = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0
};
//#endregion
export { SELF_HOSTED_DEFAULT_COST as n, SELF_HOSTED_DEFAULT_MAX_TOKENS as r, SELF_HOSTED_DEFAULT_CONTEXT_WINDOW as t };
