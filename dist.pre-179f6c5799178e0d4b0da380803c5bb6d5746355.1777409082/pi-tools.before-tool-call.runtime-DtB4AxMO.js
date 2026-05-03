import { c as logToolLoopAction } from "./diagnostic-CCOkZzFJ.js";
import { n as getDiagnosticSessionState } from "./diagnostic-session-state-Bwm65Vdd.js";
import { n as recordToolCall, r as recordToolCallOutcome, t as detectToolCallLoop } from "./tool-loop-detection-Ur9SIhE8.js";
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
