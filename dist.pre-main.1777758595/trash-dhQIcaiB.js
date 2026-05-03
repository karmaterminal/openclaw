import { n as resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir-BWwlJ5o6.js";
import "./temp-path-DORItDY6.js";
import { t as movePathToTrash$1 } from "./browser-trash-DM4JAkIs.js";
import "./browser-config-Bk9MVWSU.js";
import os from "node:os";
//#region extensions/browser/src/browser/trash.ts
async function movePathToTrash(targetPath) {
	return await movePathToTrash$1(targetPath, { allowedRoots: [os.homedir(), resolvePreferredOpenClawTmpDir()] });
}
//#endregion
export { movePathToTrash as t };
