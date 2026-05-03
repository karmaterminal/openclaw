import { t as resolveCliArgvInvocation } from "./argv-invocation-BgdldYWV.js";
import { r as shouldRegisterPrimarySubcommandOnly, t as shouldEagerRegisterSubcommands } from "./command-registration-policy-D1vo-wQJ.js";
import { i as registerCommandGroups, r as registerCommandGroupByName } from "./register-command-groups-C-Ko9Woj.js";
import { n as getSubCliEntries$1, r as loadPrivateQaCliModule } from "./subcli-descriptors-C2gB97Sz.js";
//#region src/cli/program/command-group-descriptors.ts
function buildDescriptorIndex(descriptors) {
	return new Map(descriptors.map((descriptor) => [descriptor.name, descriptor]));
}
function resolveCommandGroupEntries(descriptors, specs) {
	const descriptorsByName = buildDescriptorIndex(descriptors);
	return specs.map((spec) => ({
		placeholders: spec.commandNames.map((name) => {
			const descriptor = descriptorsByName.get(name);
			if (!descriptor) throw new Error(`Unknown command descriptor: ${name}`);
			return descriptor;
		}),
		register: spec.register
	}));
}
function buildCommandGroupEntries(descriptors, specs, mapRegister) {
	return resolveCommandGroupEntries(descriptors, specs).map((entry) => ({
		placeholders: entry.placeholders,
		register: mapRegister(entry.register)
	}));
}
function defineImportedCommandGroupSpec(commandNames, loadModule, register) {
	return {
		commandNames,
		register: async (args) => {
			await register(await loadModule(), args);
		}
	};
}
function defineImportedProgramCommandGroupSpecs(definitions) {
	return definitions.map((definition) => ({
		commandNames: definition.commandNames,
		register: async (program) => {
			const register = (await definition.loadModule())[definition.exportName];
			if (typeof register !== "function") throw new Error(`Missing program command registrar: ${definition.exportName}`);
			await register(program);
		}
	}));
}
//#endregion
//#region src/cli/program/register.subclis-core.ts
async function registerSubCliWithPluginCommands(program, registerSubCli, pluginCliPosition) {
	const { registerPluginCliCommandsFromValidatedConfig } = await import("./cli-eXRJpWBu.js");
	if (pluginCliPosition === "before") await registerPluginCliCommandsFromValidatedConfig(program);
	await registerSubCli();
	if (pluginCliPosition === "after") await registerPluginCliCommandsFromValidatedConfig(program);
}
const entrySpecs = [
	...defineImportedProgramCommandGroupSpecs([
		{
			commandNames: ["acp"],
			loadModule: () => import("./acp-cli-Us_nVu6E.js"),
			exportName: "registerAcpCli"
		},
		{
			commandNames: ["gateway"],
			loadModule: () => import("./gateway-cli-BIq8a6nk.js"),
			exportName: "registerGatewayCli"
		},
		{
			commandNames: ["daemon"],
			loadModule: () => import("./cli/daemon-cli.js"),
			exportName: "registerDaemonCli"
		},
		{
			commandNames: ["logs"],
			loadModule: () => import("./logs-cli-BFdcsMo3.js"),
			exportName: "registerLogsCli"
		},
		{
			commandNames: ["system"],
			loadModule: () => import("./system-cli-BuY8kzSg.js"),
			exportName: "registerSystemCli"
		},
		{
			commandNames: ["models"],
			loadModule: () => import("./models-cli-BZ7X1xQ1.js"),
			exportName: "registerModelsCli"
		},
		{
			commandNames: ["infer", "capability"],
			loadModule: () => import("./capability-cli-Bo0-h4D2.js"),
			exportName: "registerCapabilityCli"
		},
		{
			commandNames: ["approvals"],
			loadModule: () => import("./exec-approvals-cli-ByHHFGku.js"),
			exportName: "registerExecApprovalsCli"
		},
		{
			commandNames: ["exec-policy"],
			loadModule: () => import("./exec-policy-cli-C50hZCxi.js"),
			exportName: "registerExecPolicyCli"
		},
		{
			commandNames: ["nodes"],
			loadModule: () => import("./nodes-cli-SQVh8Y2C.js"),
			exportName: "registerNodesCli"
		},
		{
			commandNames: ["devices"],
			loadModule: () => import("./devices-cli-Yo5M_Nds.js"),
			exportName: "registerDevicesCli"
		},
		{
			commandNames: ["node"],
			loadModule: () => import("./node-cli-CjoRF6DT.js"),
			exportName: "registerNodeCli"
		},
		{
			commandNames: ["sandbox"],
			loadModule: () => import("./sandbox-cli-UTg3ne2_.js"),
			exportName: "registerSandboxCli"
		},
		{
			commandNames: [
				"tui",
				"terminal",
				"chat"
			],
			loadModule: () => import("./tui-cli-BROTaEz5.js"),
			exportName: "registerTuiCli"
		},
		{
			commandNames: ["cron"],
			loadModule: () => import("./cron-cli-BPSL_BxO.js"),
			exportName: "registerCronCli"
		},
		{
			commandNames: ["dns"],
			loadModule: () => import("./dns-cli-CZ7MsZKX.js"),
			exportName: "registerDnsCli"
		},
		{
			commandNames: ["docs"],
			loadModule: () => import("./docs-cli-CtB-7nu2.js"),
			exportName: "registerDocsCli"
		},
		{
			commandNames: ["qa"],
			loadModule: loadPrivateQaCliModule,
			exportName: "registerQaLabCli"
		},
		{
			commandNames: ["proxy"],
			loadModule: () => import("./proxy-cli-CZKZEYcL.js"),
			exportName: "registerProxyCli"
		},
		{
			commandNames: ["hooks"],
			loadModule: () => import("./hooks-cli-8QNP7gBR.js"),
			exportName: "registerHooksCli"
		},
		{
			commandNames: ["webhooks"],
			loadModule: () => import("./webhooks-cli-DdVkG7WI.js"),
			exportName: "registerWebhooksCli"
		},
		{
			commandNames: ["qr"],
			loadModule: () => import("./qr-cli-COtSJHUj.js"),
			exportName: "registerQrCli"
		},
		{
			commandNames: ["clawbot"],
			loadModule: () => import("./clawbot-cli-CYfLkU94.js"),
			exportName: "registerClawbotCli"
		}
	]),
	{
		commandNames: ["pairing"],
		register: async (program) => {
			await registerSubCliWithPluginCommands(program, async () => {
				(await import("./pairing-cli-BJGKXBDU.js")).registerPairingCli(program);
			}, "before");
		}
	},
	{
		commandNames: ["plugins"],
		register: async (program) => {
			await registerSubCliWithPluginCommands(program, async () => {
				(await import("./plugins-cli-B6GdNT_Z.js")).registerPluginsCli(program);
			}, "after");
		}
	},
	...defineImportedProgramCommandGroupSpecs([
		{
			commandNames: ["channels"],
			loadModule: () => import("./channels-cli-CmTNuLUp.js"),
			exportName: "registerChannelsCli"
		},
		{
			commandNames: ["directory"],
			loadModule: () => import("./directory-cli-DJ0AXifK.js"),
			exportName: "registerDirectoryCli"
		},
		{
			commandNames: ["security"],
			loadModule: () => import("./security-cli-qWl9an-M.js"),
			exportName: "registerSecurityCli"
		},
		{
			commandNames: ["secrets"],
			loadModule: () => import("./secrets-cli-l_EHISka.js"),
			exportName: "registerSecretsCli"
		},
		{
			commandNames: ["skills"],
			loadModule: () => import("./skills-cli-qFq7E2PZ.js"),
			exportName: "registerSkillsCli"
		},
		{
			commandNames: ["update"],
			loadModule: () => import("./update-cli-D0R32NP-.js"),
			exportName: "registerUpdateCli"
		}
	])
];
function resolveSubCliCommandGroups() {
	const descriptors = getSubCliEntries$1();
	const descriptorNames = new Set(descriptors.map((descriptor) => descriptor.name));
	return buildCommandGroupEntries(descriptors, entrySpecs.filter((spec) => spec.commandNames.every((name) => descriptorNames.has(name))), (register) => register);
}
function getSubCliEntries() {
	return getSubCliEntries$1();
}
async function registerSubCliByName(program, name) {
	return registerCommandGroupByName(program, resolveSubCliCommandGroups(), name);
}
function registerSubCliCommands(program, argv = process.argv) {
	const { primary } = resolveCliArgvInvocation(argv);
	registerCommandGroups(program, resolveSubCliCommandGroups(), {
		eager: shouldEagerRegisterSubcommands(),
		primary,
		registerPrimaryOnly: Boolean(primary && shouldRegisterPrimarySubcommandOnly(argv))
	});
}
//#endregion
export { defineImportedCommandGroupSpec as a, buildCommandGroupEntries as i, registerSubCliByName as n, defineImportedProgramCommandGroupSpecs as o, registerSubCliCommands as r, getSubCliEntries as t };
