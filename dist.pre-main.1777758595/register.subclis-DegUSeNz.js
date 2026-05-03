import { h as getSubCliEntries } from "./argv-BT86vRPw.js";
import { t as resolveCliArgvInvocation } from "./argv-invocation-CwlsoXUV.js";
import { r as shouldRegisterPrimarySubcommandOnly, t as shouldEagerRegisterSubcommands } from "./command-registration-policy-CAl2OIBW.js";
import { i as registerCommandGroups, r as registerCommandGroupByName } from "./register-command-groups-Coms1NkK.js";
import { i as buildCommandGroupEntries, n as registerSubCliByName$1, o as defineImportedProgramCommandGroupSpecs, r as registerSubCliCommands$1 } from "./register.subclis-core-EqPIVms1.js";
//#region src/cli/program/register.subclis.ts
const entrySpecs = [...defineImportedProgramCommandGroupSpecs([{
	commandNames: ["completion"],
	loadModule: () => import("./completion-cli-1744vwvc.js"),
	exportName: "registerCompletionCli"
}])];
function resolveSubCliCommandGroups() {
	return buildCommandGroupEntries(getSubCliEntries(), entrySpecs, (register) => register);
}
async function registerSubCliByName(program, name, argv = process.argv) {
	if (await registerSubCliByName$1(program, name, argv)) return true;
	return registerCommandGroupByName(program, resolveSubCliCommandGroups(), name);
}
function registerSubCliCommands(program, argv = process.argv) {
	registerSubCliCommands$1(program, argv);
	const { primary } = resolveCliArgvInvocation(argv);
	registerCommandGroups(program, resolveSubCliCommandGroups(), {
		eager: shouldEagerRegisterSubcommands(),
		primary,
		registerPrimaryOnly: Boolean(primary && shouldRegisterPrimarySubcommandOnly(argv))
	});
}
//#endregion
export { registerSubCliCommands as n, registerSubCliByName as t };
