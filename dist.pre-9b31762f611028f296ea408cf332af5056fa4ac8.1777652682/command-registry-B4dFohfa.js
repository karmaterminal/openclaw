import { r as registerCoreCliCommands } from "./command-registry-core-DV2ueNAA.js";
import { n as registerSubCliCommands } from "./register.subclis-DcGz7u5l.js";
//#region src/cli/program/command-registry.ts
function registerProgramCommands(program, ctx, argv = process.argv) {
	registerCoreCliCommands(program, ctx, argv);
	registerSubCliCommands(program, argv);
}
//#endregion
export { registerProgramCommands as t };
