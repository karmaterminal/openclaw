import { t as runStatusJsonCommand } from "./status-json-command-CBX3fQ23.js";
import { t as scanStatusJsonFast } from "./status.scan.fast-json-4MvaY7Lr.js";
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
