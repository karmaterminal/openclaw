import "./chunk-B0UDAWcD.js";
import "./conversation-label-generator-BH1dtx8q.js";
//#region src/plugin-sdk/reply-dispatch-runtime.ts
const dispatchReplyWithBufferedBlockDispatcher = async (params) => {
	const { dispatchReplyWithBufferedBlockDispatcher: dispatch } = await import("./provider-dispatcher-D3rT70zw.js");
	return await dispatch(params);
};
const dispatchReplyWithDispatcher = async (params) => {
	const { dispatchReplyWithDispatcher: dispatch } = await import("./provider-dispatcher-D3rT70zw.js");
	return await dispatch(params);
};
//#endregion
export { dispatchReplyWithDispatcher as n, dispatchReplyWithBufferedBlockDispatcher as t };
