import { t as resolveCliArgvInvocation } from "./argv-invocation-WovolAlT.js";
import { r as shouldRegisterPrimarySubcommandOnly, t as shouldEagerRegisterSubcommands } from "./command-registration-policy-DyJIOZXd.js";
import { i as buildCommandGroupEntries, n as registerSubCliByName$1, o as defineImportedProgramCommandGroupSpecs, r as registerSubCliCommands$1 } from "./register.subclis-core-BeDshNZo.js";
import { i as registerCommandGroups, r as registerCommandGroupByName } from "./register-command-groups-C_uIPV_0.js";
import { n as getSubCliEntries } from "./subcli-descriptors-Bpn_yfgA.js";
//#region src/cli/program/register.subclis.ts
const entrySpecs = [...defineImportedProgramCommandGroupSpecs([{
	commandNames: ["completion"],
	loadModule: () => import("./completion-cli-DhWaFd4r.js"),
	exportName: "registerCompletionCli"
}])];
function resolveSubCliCommandGroups() {
	return buildCommandGroupEntries(getSubCliEntries(), entrySpecs, (register) => register);
}
async function registerSubCliByName(program, name) {
	if (await registerSubCliByName$1(program, name)) return true;
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
