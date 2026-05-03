import { r as registerCoreCliCommands } from "./command-registry-core-DYjWvx6T.js";
import { n as registerSubCliCommands } from "./register.subclis-DegUSeNz.js";
//#region src/cli/program/command-registry.ts
function registerProgramCommands(program, ctx, argv = process.argv) {
	registerCoreCliCommands(program, ctx, argv);
	registerSubCliCommands(program, argv);
}
//#endregion
export { registerProgramCommands as t };
