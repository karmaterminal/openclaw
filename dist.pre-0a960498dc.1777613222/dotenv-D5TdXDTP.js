import { _ as resolveStateDir } from "./paths-CrDgDBYA.js";
import { n as loadGlobalRuntimeDotEnvFiles, r as loadWorkspaceDotEnvFile } from "./dotenv-D-YdXLHu.js";
import path from "node:path";
//#region src/cli/dotenv.ts
function loadCliDotEnv(opts) {
	const quiet = opts?.quiet ?? true;
	loadWorkspaceDotEnvFile(path.join(process.cwd(), ".env"), { quiet });
	loadGlobalRuntimeDotEnvFiles({
		quiet,
		stateEnvPath: path.join(resolveStateDir(process.env), ".env")
	});
}
//#endregion
export { loadCliDotEnv };
