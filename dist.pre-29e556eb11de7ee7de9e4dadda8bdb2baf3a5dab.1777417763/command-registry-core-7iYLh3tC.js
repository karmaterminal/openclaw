import { t as resolveCliArgvInvocation } from "./argv-invocation-BgdldYWV.js";
import { n as shouldRegisterPrimaryCommandOnly } from "./command-registration-policy-Cyt_IoBm.js";
import { a as defineImportedCommandGroupSpec, i as buildCommandGroupEntries, o as defineImportedProgramCommandGroupSpecs } from "./register.subclis-core-Ddks9maF.js";
import { n as getCoreCliCommandNames$1, t as getCoreCliCommandDescriptors } from "./core-command-descriptors-BpBEhRgp.js";
import { i as registerCommandGroups, r as registerCommandGroupByName } from "./register-command-groups-C-5hM8Rz.js";
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
			loadModule: () => import("./register.setup-DX8eZ7fr.js"),
			exportName: "registerSetupCommand"
		},
		{
			commandNames: ["onboard"],
			loadModule: () => import("./register.onboard-Bzry_YiH.js"),
			exportName: "registerOnboardCommand"
		},
		{
			commandNames: ["configure"],
			loadModule: () => import("./register.configure-WylnHB4K.js"),
			exportName: "registerConfigureCommand"
		},
		{
			commandNames: ["config"],
			loadModule: () => import("./config-cli-DTy0ZcV1.js"),
			exportName: "registerConfigCli"
		},
		{
			commandNames: ["backup"],
			loadModule: () => import("./register.backup-CJAGCRRf.js"),
			exportName: "registerBackupCommand"
		},
		{
			commandNames: [
				"doctor",
				"dashboard",
				"reset",
				"uninstall"
			],
			loadModule: () => import("./register.maintenance-Dz7s6L0p.js"),
			exportName: "registerMaintenanceCommands"
		}
	])),
	defineImportedCommandGroupSpec(["message"], () => import("./register.message-DIlLoKJd.js"), (mod, { program, ctx }) => {
		mod.registerMessageCommands(program, ctx);
	}),
	...withProgramOnlySpecs(defineImportedProgramCommandGroupSpecs([{
		commandNames: ["mcp"],
		loadModule: () => import("./mcp-cli-DttQWo52.js"),
		exportName: "registerMcpCli"
	}])),
	defineImportedCommandGroupSpec(["agent", "agents"], () => import("./register.agent-BGRH4CFe.js"), (mod, { program, ctx }) => {
		mod.registerAgentCommands(program, { agentChannelOptions: ctx.agentChannelOptions });
	}),
	...withProgramOnlySpecs(defineImportedProgramCommandGroupSpecs([{
		commandNames: [
			"status",
			"health",
			"sessions",
			"tasks"
		],
		loadModule: () => import("./register.status-health-sessions-BeyOIxyu.js"),
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
