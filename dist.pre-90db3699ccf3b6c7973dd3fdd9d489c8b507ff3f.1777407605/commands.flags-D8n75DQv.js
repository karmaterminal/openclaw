import { x as isPlainObject } from "./utils-CB8xp0O4.js";
//#region src/config/commands.flags.ts
function getOwnCommandFlagValue(config, key) {
	const { commands } = config ?? {};
	if (!isPlainObject(commands) || !Object.hasOwn(commands, key)) return;
	return commands[key];
}
function isCommandFlagEnabled(config, key) {
	return getOwnCommandFlagValue(config, key) === true;
}
function isModelsWriteEnabled(config) {
	return getOwnCommandFlagValue(config, "modelsWrite") !== false;
}
function isRestartEnabled(config) {
	return getOwnCommandFlagValue(config, "restart") !== false;
}
//#endregion
export { isModelsWriteEnabled as n, isRestartEnabled as r, isCommandFlagEnabled as t };
