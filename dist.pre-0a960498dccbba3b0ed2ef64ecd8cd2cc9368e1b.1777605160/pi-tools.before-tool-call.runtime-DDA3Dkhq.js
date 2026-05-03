import { c as logToolLoopAction } from "./diagnostic-BTZAq-3K.js";
import { n as getDiagnosticSessionState } from "./diagnostic-session-state-DT1FeeEx.js";
import { n as recordToolCall, r as recordToolCallOutcome, t as detectToolCallLoop } from "./tool-loop-detection-BOnA_ptR.js";
//#region src/agents/pi-tools.before-tool-call.runtime.ts
const beforeToolCallRuntime = {
	getDiagnosticSessionState,
	logToolLoopAction,
	detectToolCallLoop,
	recordToolCall,
	recordToolCallOutcome
};
//#endregion
export { beforeToolCallRuntime };
