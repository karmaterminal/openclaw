import "./chunk-Bv_ioeL6.js";
import "./conversation-label-generator-C_dfE0xN.js";
//#region src/plugin-sdk/reply-dispatch-runtime.ts
const dispatchReplyWithBufferedBlockDispatcher = async (params) => {
	const { dispatchReplyWithBufferedBlockDispatcher: dispatch } = await import("./provider-dispatcher-D6Swm4Jy.js");
	return await dispatch(params);
};
const dispatchReplyWithDispatcher = async (params) => {
	const { dispatchReplyWithDispatcher: dispatch } = await import("./provider-dispatcher-D6Swm4Jy.js");
	return await dispatch(params);
};
//#endregion
export { dispatchReplyWithDispatcher as n, dispatchReplyWithBufferedBlockDispatcher as t };
