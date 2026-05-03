import { c as logToolLoopAction } from "./diagnostic-BTg369xh.js";
import { n as getDiagnosticSessionState } from "./diagnostic-session-state-Dcs8j6d-.js";
import { n as recordToolCall, r as recordToolCallOutcome, t as detectToolCallLoop } from "./tool-loop-detection-q3gq5z2n.js";
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
