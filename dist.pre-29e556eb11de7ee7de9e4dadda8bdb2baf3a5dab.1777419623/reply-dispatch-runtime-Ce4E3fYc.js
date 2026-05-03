import "./chunk-Bv_ioeL6.js";
import "./conversation-label-generator-DIw6oG1W.js";
//#region src/plugin-sdk/reply-dispatch-runtime.ts
const dispatchReplyWithBufferedBlockDispatcher = async (params) => {
	const { dispatchReplyWithBufferedBlockDispatcher: dispatch } = await import("./provider-dispatcher-B_0wVW_n.js");
	return await dispatch(params);
};
const dispatchReplyWithDispatcher = async (params) => {
	const { dispatchReplyWithDispatcher: dispatch } = await import("./provider-dispatcher-B_0wVW_n.js");
	return await dispatch(params);
};
//#endregion
export { dispatchReplyWithDispatcher as n, dispatchReplyWithBufferedBlockDispatcher as t };
