import { c as logToolLoopAction } from "./diagnostic-DsZ4vZSS.js";
import { n as getDiagnosticSessionState } from "./diagnostic-session-state-BWJqL3sX.js";
import { n as recordToolCall, r as recordToolCallOutcome, t as detectToolCallLoop } from "./tool-loop-detection-B2ZXqP4H.js";
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
