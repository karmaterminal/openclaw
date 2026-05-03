import { _ as resolveStateDir } from "./paths-D92DjaZ-.js";
import { n as loadGlobalRuntimeDotEnvFiles, r as loadWorkspaceDotEnvFile } from "./dotenv-C8b8fj5f.js";
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
