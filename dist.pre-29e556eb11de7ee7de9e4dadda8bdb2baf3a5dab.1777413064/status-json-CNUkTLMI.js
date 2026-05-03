import { t as runStatusJsonCommand } from "./status-json-command-Dtwbzscd.js";
import { t as scanStatusJsonFast } from "./status.scan.fast-json-C3KMcBA1.js";
//#region src/commands/status-json.ts
async function statusJsonCommand(opts, runtime) {
	await runStatusJsonCommand({
		opts,
		runtime,
		scanStatusJsonFast,
		includeSecurityAudit: opts.all === true,
		suppressHealthErrors: true
	});
}
//#endregion
export { statusJsonCommand };
