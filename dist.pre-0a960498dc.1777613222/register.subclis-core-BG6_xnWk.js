import { t as resolveCliArgvInvocation } from "./argv-invocation-WovolAlT.js";
import { r as shouldRegisterPrimarySubcommandOnly, t as shouldEagerRegisterSubcommands } from "./command-registration-policy-ByQdxyCB.js";
import { i as registerCommandGroups, r as registerCommandGroupByName } from "./register-command-groups-hIYVtz54.js";
import { n as getSubCliEntries$1, r as loadPrivateQaCliModule } from "./subcli-descriptors-BFqbqEfV.js";
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
	const { registerPluginCliCommandsFromValidatedConfig } = await import("./cli-BAkIXSUc.js");
	if (pluginCliPosition === "before") await registerPluginCliCommandsFromValidatedConfig(program);
	await registerSubCli();
	if (pluginCliPosition === "after") await registerPluginCliCommandsFromValidatedConfig(program);
}
const entrySpecs = [
	...defineImportedProgramCommandGroupSpecs([
		{
			commandNames: ["acp"],
			loadModule: () => import("./acp-cli-DYJATXPQ.js"),
			exportName: "registerAcpCli"
		},
		{
			commandNames: ["gateway"],
			loadModule: () => import("./gateway-cli-5CBw_Ofq.js"),
			exportName: "registerGatewayCli"
		},
		{
			commandNames: ["daemon"],
			loadModule: () => import("./cli/daemon-cli.js"),
			exportName: "registerDaemonCli"
		},
		{
			commandNames: ["logs"],
			loadModule: () => import("./logs-cli-DjPhxmdA.js"),
			exportName: "registerLogsCli"
		},
		{
			commandNames: ["system"],
			loadModule: () => import("./system-cli-CYFzmhYV.js"),
			exportName: "registerSystemCli"
		},
		{
			commandNames: ["models"],
			loadModule: () => import("./models-cli-BZvS2UVn.js"),
			exportName: "registerModelsCli"
		},
		{
			commandNames: ["infer", "capability"],
			loadModule: () => import("./capability-cli-BR2XrIdY.js"),
			exportName: "registerCapabilityCli"
		},
		{
			commandNames: ["approvals"],
			loadModule: () => import("./exec-approvals-cli-DHfLcbez.js"),
			exportName: "registerExecApprovalsCli"
		},
		{
			commandNames: ["exec-policy"],
			loadModule: () => import("./exec-policy-cli-BOIgP2dq.js"),
			exportName: "registerExecPolicyCli"
		},
		{
			commandNames: ["nodes"],
			loadModule: () => import("./nodes-cli-CBcruXOX.js"),
			exportName: "registerNodesCli"
		},
		{
			commandNames: ["devices"],
			loadModule: () => import("./devices-cli-DH8U2HQR.js"),
			exportName: "registerDevicesCli"
		},
		{
			commandNames: ["node"],
			loadModule: () => import("./node-cli-U4WVTUPF.js"),
			exportName: "registerNodeCli"
		},
		{
			commandNames: ["sandbox"],
			loadModule: () => import("./sandbox-cli-B56FiWAH.js"),
			exportName: "registerSandboxCli"
		},
		{
			commandNames: [
				"tui",
				"terminal",
				"chat"
			],
			loadModule: () => import("./tui-cli-D-CgTv1M.js"),
			exportName: "registerTuiCli"
		},
		{
			commandNames: ["cron"],
			loadModule: () => import("./cron-cli-BeHEJKVI.js"),
			exportName: "registerCronCli"
		},
		{
			commandNames: ["dns"],
			loadModule: () => import("./dns-cli-jcOBfFq0.js"),
			exportName: "registerDnsCli"
		},
		{
			commandNames: ["docs"],
			loadModule: () => import("./docs-cli-DzQhXMzL.js"),
			exportName: "registerDocsCli"
		},
		{
			commandNames: ["qa"],
			loadModule: loadPrivateQaCliModule,
			exportName: "registerQaLabCli"
		},
		{
			commandNames: ["proxy"],
			loadModule: () => import("./proxy-cli-BKlHG90h.js"),
			exportName: "registerProxyCli"
		},
		{
			commandNames: ["hooks"],
			loadModule: () => import("./hooks-cli-BmWMxu_C.js"),
			exportName: "registerHooksCli"
		},
		{
			commandNames: ["webhooks"],
			loadModule: () => import("./webhooks-cli-CK0r8siu.js"),
			exportName: "registerWebhooksCli"
		},
		{
			commandNames: ["qr"],
			loadModule: () => import("./qr-cli-zkL1-vI1.js"),
			exportName: "registerQrCli"
		},
		{
			commandNames: ["clawbot"],
			loadModule: () => import("./clawbot-cli-BfTP4vXq.js"),
			exportName: "registerClawbotCli"
		}
	]),
	{
		commandNames: ["pairing"],
		register: async (program) => {
			await registerSubCliWithPluginCommands(program, async () => {
				(await import("./pairing-cli-C0pVR17f.js")).registerPairingCli(program);
			}, "before");
		}
	},
	{
		commandNames: ["plugins"],
		register: async (program) => {
			await registerSubCliWithPluginCommands(program, async () => {
				(await import("./plugins-cli-CNuixSi6.js")).registerPluginsCli(program);
			}, "after");
		}
	},
	...defineImportedProgramCommandGroupSpecs([
		{
			commandNames: ["channels"],
			loadModule: () => import("./channels-cli-BYBFYBS8.js"),
			exportName: "registerChannelsCli"
		},
		{
			commandNames: ["directory"],
			loadModule: () => import("./directory-cli-B9sRTA8B.js"),
			exportName: "registerDirectoryCli"
		},
		{
			commandNames: ["security"],
			loadModule: () => import("./security-cli-Bnvs18TO.js"),
			exportName: "registerSecurityCli"
		},
		{
			commandNames: ["secrets"],
			loadModule: () => import("./secrets-cli-TT-L3sg2.js"),
			exportName: "registerSecretsCli"
		},
		{
			commandNames: ["skills"],
			loadModule: () => import("./skills-cli-Cw80Dk-g.js"),
			exportName: "registerSkillsCli"
		},
		{
			commandNames: ["update"],
			loadModule: () => import("./update-cli-Bf_hwaZt.js"),
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
