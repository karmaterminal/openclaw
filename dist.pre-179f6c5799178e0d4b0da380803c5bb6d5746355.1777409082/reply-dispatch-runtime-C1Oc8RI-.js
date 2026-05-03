import "./chunk-D2taG7SF.js";
import "./conversation-label-generator-CFR_pRCn.js";
//#region src/plugin-sdk/reply-dispatch-runtime.ts
const dispatchReplyWithBufferedBlockDispatcher = async (params) => {
	const { dispatchReplyWithBufferedBlockDispatcher: dispatch } = await import("./provider-dispatcher-DyV4v0Od.js");
	return await dispatch(params);
};
const dispatchReplyWithDispatcher = async (params) => {
	const { dispatchReplyWithDispatcher: dispatch } = await import("./provider-dispatcher-DyV4v0Od.js");
	return await dispatch(params);
};
//#endregion
export { dispatchReplyWithDispatcher as n, dispatchReplyWithBufferedBlockDispatcher as t };
