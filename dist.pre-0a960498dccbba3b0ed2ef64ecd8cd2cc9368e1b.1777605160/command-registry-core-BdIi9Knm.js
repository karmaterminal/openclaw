import { t as resolveCliArgvInvocation } from "./argv-invocation-BgdldYWV.js";
import { n as shouldRegisterPrimaryCommandOnly } from "./command-registration-policy-CDDDwF0a.js";
import { a as defineImportedCommandGroupSpec, i as buildCommandGroupEntries, o as defineImportedProgramCommandGroupSpecs } from "./register.subclis-core-aNGLsVYa.js";
import { n as getCoreCliCommandNames$1, t as getCoreCliCommandDescriptors } from "./core-command-descriptors-CVP8bHk4.js";
import { i as registerCommandGroups, r as registerCommandGroupByName } from "./register-command-groups-CVS6HXEh.js";
//#region src/cli/program/command-registry-core.ts
function withProgramOnlySpecs(specs) {
	return specs.map((spec) => ({
		commandNames: spec.commandNames,
		register: async ({ program }) => {
			await spec.register(program);
		}
	}));
}
const coreEntrySpecs = [
	...withProgramOnlySpecs(defineImportedProgramCommandGroupSpecs([
		{
			commandNames: ["setup"],
			loadModule: () => import("./register.setup-DohRSxst.js"),
			exportName: "registerSetupCommand"
		},
		{
			commandNames: ["onboard"],
			loadModule: () => import("./register.onboard-BSb4rGXb.js"),
			exportName: "registerOnboardCommand"
		},
		{
			commandNames: ["configure"],
			loadModule: () => import("./register.configure-Dn1fJdKA.js"),
			exportName: "registerConfigureCommand"
		},
		{
			commandNames: ["config"],
			loadModule: () => import("./config-cli-DuawDn0l.js"),
			exportName: "registerConfigCli"
		},
		{
			commandNames: ["backup"],
			loadModule: () => import("./register.backup-CExakLZ1.js"),
			exportName: "registerBackupCommand"
		},
		{
			commandNames: [
				"doctor",
				"dashboard",
				"reset",
				"uninstall"
			],
			loadModule: () => import("./register.maintenance-kIb3OO11.js"),
			exportName: "registerMaintenanceCommands"
		}
	])),
	defineImportedCommandGroupSpec(["message"], () => import("./register.message-Ow1KMdB1.js"), (mod, { program, ctx }) => {
		mod.registerMessageCommands(program, ctx);
	}),
	...withProgramOnlySpecs(defineImportedProgramCommandGroupSpecs([{
		commandNames: ["mcp"],
		loadModule: () => import("./mcp-cli-pxolyD79.js"),
		exportName: "registerMcpCli"
	}])),
	defineImportedCommandGroupSpec(["agent", "agents"], () => import("./register.agent-DmNRWv15.js"), (mod, { program, ctx }) => {
		mod.registerAgentCommands(program, { agentChannelOptions: ctx.agentChannelOptions });
	}),
	...withProgramOnlySpecs(defineImportedProgramCommandGroupSpecs([{
		commandNames: [
			"status",
			"health",
			"sessions",
			"tasks"
		],
		loadModule: () => import("./register.status-health-sessions-C2R8EgpK.js"),
		exportName: "registerStatusHealthSessionsCommands"
	}]))
];
function resolveCoreCommandGroups(ctx, argv) {
	return buildCommandGroupEntries(getCoreCliCommandDescriptors(), coreEntrySpecs, (register) => async (program) => {
		await register({
			program,
			ctx,
			argv
		});
	});
}
function getCoreCliCommandNames() {
	return getCoreCliCommandNames$1();
}
async function registerCoreCliByName(program, ctx, name, argv = process.argv) {
	return registerCommandGroupByName(program, resolveCoreCommandGroups(ctx, argv), name);
}
function registerCoreCliCommands(program, ctx, argv) {
	const { primary } = resolveCliArgvInvocation(argv);
	registerCommandGroups(program, resolveCoreCommandGroups(ctx, argv), {
		eager: false,
		primary,
		registerPrimaryOnly: Boolean(primary && shouldRegisterPrimaryCommandOnly(argv))
	});
}
//#endregion
export { registerCoreCliByName as n, registerCoreCliCommands as r, getCoreCliCommandNames as t };
