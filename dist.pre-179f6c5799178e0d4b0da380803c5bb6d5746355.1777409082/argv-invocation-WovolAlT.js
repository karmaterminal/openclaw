import { I as getPrimaryCommand, M as getCommandPathWithRootOptions, V as isRootHelpInvocation, z as hasHelpOrVersion } from "./logger--l1ykZMf.js";
//#region src/cli/argv-invocation.ts
function resolveCliArgvInvocation(argv) {
	return {
		argv,
		commandPath: getCommandPathWithRootOptions(argv, 2),
		primary: getPrimaryCommand(argv),
		hasHelpOrVersion: hasHelpOrVersion(argv),
		isRootHelpInvocation: isRootHelpInvocation(argv)
	};
}
//#endregion
export { resolveCliArgvInvocation as t };
