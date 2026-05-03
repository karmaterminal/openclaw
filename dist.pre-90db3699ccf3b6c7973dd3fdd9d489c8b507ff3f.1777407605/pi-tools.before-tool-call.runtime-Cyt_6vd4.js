import { c as logToolLoopAction } from "./diagnostic-CLYAjMPL.js";
import { n as getDiagnosticSessionState } from "./diagnostic-session-state-CGQyq5FH.js";
import { n as recordToolCall, r as recordToolCallOutcome, t as detectToolCallLoop } from "./tool-loop-detection-CRPrqVZ_.js";
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
