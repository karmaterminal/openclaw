import { c as logToolLoopAction } from "./diagnostic-DLmgtjxT.js";
import { n as getDiagnosticSessionState } from "./diagnostic-session-state-Dcs8j6d-.js";
import { n as recordToolCall, r as recordToolCallOutcome, t as detectToolCallLoop } from "./tool-loop-detection-Cuypy8C7.js";
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
