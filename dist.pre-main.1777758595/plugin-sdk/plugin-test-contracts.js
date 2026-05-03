import { t as loadPluginManifestRegistry } from "../manifest-registry-B4b3w90-.js";
import { a as parseSemver, n as isAtLeast } from "../runtime-guard-BpAF5_ad.js";
import { n as parseMinHostVersionRequirement } from "../min-host-version-5uLX3I2k.js";
import { t as pluginRegistrationContractRegistry } from "../registry-c8XrPu9h.js";
import { a as describe, c as it } from "../dist-DXplqi46.js";
import { t as globalExpect } from "../test.DNmyFkvJ-DTMtNgEB.js";
import { x as requireRegisteredProvider, y as registerProviderPlugins } from "../plugin-setup-wizard-K6Uj1NoS.js";
import "../testing-D4WiM9O5.js";
import { n as assertUniqueValues, t as BUNDLED_RUNTIME_SIDECAR_PATHS } from "../runtime-sidecar-paths-Dx-JkZjB.js";
import { a as registerTestPlugin, c as assertNoImportTimeSideEffects, i as createPluginRegistryFixture, n as loadBundledPluginPublicSurfaceSync, o as registerVirtualTestPlugin, r as resolveWorkspacePackagePublicModuleUrl, s as uniqueSortedStrings, t as loadBundledPluginPublicSurface } from "../public-surface-loader-D4S0oFut.js";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs, { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
//#region src/plugin-sdk/test-helpers/direct-smoke.ts
const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SHARED_IMPORT_ENV = {
	HOME: process.env.HOME,
	NODE_OPTIONS: process.env.NODE_OPTIONS,
	NODE_PATH: process.env.NODE_PATH,
	PATH: process.env.PATH,
	TERM: process.env.TERM
};
async function runDirectImportSmoke(code) {
	const { stdout } = await execFileAsync(process.execPath, [
		"--import",
		"tsx",
		"-e",
		code
	], {
		cwd: repoRoot,
		env: SHARED_IMPORT_ENV,
		timeout: 4e4
	});
	return stdout;
}
//#endregion
//#region src/plugin-sdk/test-helpers/jiti-runtime-api.ts
const nodeRequire = createRequire(import.meta.url);
function loadTypeScript() {
	return nodeRequire("typescript");
}
const JITI_EXTENSIONS = [
	".ts",
	".tsx",
	".mts",
	".cts",
	".mtsx",
	".ctsx",
	".js",
	".mjs",
	".cjs",
	".json"
];
const PLUGIN_SDK_SPECIFIER_PREFIX = "openclaw/plugin-sdk/";
const SOURCE_MODULE_EXTENSIONS = [
	".ts",
	".tsx",
	".mts",
	".cts"
];
function listPluginSdkExportedSubpaths(root) {
	const packageJsonPath = path.join(root, "package.json");
	const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
	return Object.keys(packageJson.exports ?? {}).filter((key) => key.startsWith("./plugin-sdk/")).map((key) => key.slice(13));
}
function resolvePluginSdkAliasTarget(root, subpath) {
	const distCandidate = path.join(root, "dist", "plugin-sdk", `${subpath}.js`);
	if (existsSync(distCandidate)) return distCandidate;
	for (const ext of SOURCE_MODULE_EXTENSIONS) {
		const srcCandidate = path.join(root, "src", "plugin-sdk", `${subpath}${ext}`);
		if (existsSync(srcCandidate)) return srcCandidate;
	}
	return null;
}
function resolveLocalModulePath(filePath, specifier) {
	const basePath = path.resolve(path.dirname(filePath), specifier);
	const candidates = new Set([basePath]);
	for (const ext of SOURCE_MODULE_EXTENSIONS) candidates.add(`${basePath}${ext}`);
	if (/\.[cm]?[jt]sx?$/u.test(basePath)) {
		const withoutExt = basePath.replace(/\.[cm]?[jt]sx?$/u, "");
		for (const ext of SOURCE_MODULE_EXTENSIONS) candidates.add(`${withoutExt}${ext}`);
	}
	for (const ext of SOURCE_MODULE_EXTENSIONS) candidates.add(path.join(basePath, `index${ext}`));
	for (const candidate of candidates) if (existsSync(candidate)) return candidate;
	return null;
}
function collectSourceModuleRefs(filePath) {
	const ts = loadTypeScript();
	const sourceText = readFileSync(filePath, "utf8");
	const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
	const refs = [];
	for (const statement of sourceFile.statements) {
		if (ts.isImportDeclaration(statement)) {
			const specifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : void 0;
			if (specifier) refs.push({
				specifier,
				typeOnly: Boolean(statement.importClause?.isTypeOnly)
			});
			continue;
		}
		if (!ts.isExportDeclaration(statement)) continue;
		const specifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : void 0;
		if (!specifier) continue;
		const typeOnly = Boolean(statement.isTypeOnly || statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.length > 0 && statement.exportClause.elements.every((element) => element.isTypeOnly));
		refs.push({
			specifier,
			typeOnly
		});
	}
	return refs;
}
function collectPluginSdkAliases(params) {
	const realSpecifiers = /* @__PURE__ */ new Set();
	const stubSpecifiers = /* @__PURE__ */ new Set();
	const visitedFiles = /* @__PURE__ */ new Set();
	const stubPath = path.join(params.root, "test", "helpers", "plugins", "plugin-sdk-stub.cjs");
	const explicitRealSpecifiers = new Set(params.realPluginSdkSpecifiers ?? []);
	function visitModule(filePath, rootModule) {
		if (visitedFiles.has(filePath)) return;
		visitedFiles.add(filePath);
		for (const ref of collectSourceModuleRefs(filePath)) {
			if (ref.specifier.startsWith(PLUGIN_SDK_SPECIFIER_PREFIX)) {
				if (rootModule && !ref.typeOnly && (explicitRealSpecifiers.size === 0 || explicitRealSpecifiers.has(ref.specifier))) {
					realSpecifiers.add(ref.specifier);
					const subpath = ref.specifier.slice(20);
					const target = resolvePluginSdkAliasTarget(params.root, subpath);
					if (target?.endsWith(".ts")) visitModule(target, false);
				} else stubSpecifiers.add(ref.specifier);
				continue;
			}
			if (!ref.specifier.startsWith(".")) continue;
			const resolved = resolveLocalModulePath(filePath, ref.specifier);
			if (resolved) visitModule(resolved, false);
		}
	}
	visitModule(params.modulePath, true);
	const aliasEntries = /* @__PURE__ */ new Map();
	for (const specifier of listPluginSdkExportedSubpaths(params.root).map((subpath) => `${PLUGIN_SDK_SPECIFIER_PREFIX}${subpath}`)) {
		if (realSpecifiers.has(specifier)) {
			const subpath = specifier.slice(20);
			aliasEntries.set(specifier, resolvePluginSdkAliasTarget(params.root, subpath) ?? stubPath);
			continue;
		}
		if (stubSpecifiers.has(specifier)) aliasEntries.set(specifier, stubPath);
	}
	return Object.fromEntries(aliasEntries);
}
function loadRuntimeApiExportTypesViaJiti(params) {
	const root = process.cwd();
	const alias = {
		...collectPluginSdkAliases({
			modulePath: params.modulePath,
			root,
			realPluginSdkSpecifiers: params.realPluginSdkSpecifiers
		}),
		...params.additionalAliases
	};
	const script = `
import path from "node:path";
import { createJiti } from "jiti";

const modulePath = ${JSON.stringify(params.modulePath)};
const exportNames = ${JSON.stringify(params.exportNames)};
const alias = ${JSON.stringify(alias)};
const jiti = createJiti(path.join(${JSON.stringify(root)}, "openclaw.mjs"), {
  interopDefault: true,
  tryNative: false,
  fsCache: false,
  moduleCache: false,
  extensions: ${JSON.stringify(JITI_EXTENSIONS)},
  alias,
});
const mod = jiti(modulePath);
console.log(
  JSON.stringify(
    Object.fromEntries(exportNames.map((name) => [name, typeof mod[name]])),
  ),
);
`;
	const raw = execFileSync(process.execPath, [
		"--input-type=module",
		"--eval",
		script
	], {
		cwd: root,
		encoding: "utf-8"
	});
	return JSON.parse(raw);
}
//#endregion
//#region src/plugin-sdk/test-helpers/package-manifest-contract.ts
function readJson(relativePath) {
	const absolutePath = path.resolve(process.cwd(), relativePath);
	return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}
function bundledPluginFile(pluginId, relativePath) {
	return `extensions/${pluginId}/${relativePath}`;
}
function describePackageManifestContract(params) {
	const packagePath = bundledPluginFile(params.pluginId, "package.json");
	describe(`${params.pluginId} package manifest contract`, () => {
		if (params.pluginLocalRuntimeDeps?.length) for (const dependencyName of params.pluginLocalRuntimeDeps) it(`keeps ${dependencyName} plugin-local`, () => {
			const rootManifest = readJson("package.json");
			const pluginManifest = readJson(packagePath);
			const pluginSpec = pluginManifest.dependencies?.[dependencyName] ?? pluginManifest.optionalDependencies?.[dependencyName];
			const rootSpec = rootManifest.dependencies?.[dependencyName] ?? rootManifest.optionalDependencies?.[dependencyName];
			globalExpect(pluginSpec).toBeTruthy();
			globalExpect(rootSpec).toBeUndefined();
		});
		if (params.mirroredRootRuntimeDeps?.length) for (const dependencyName of params.mirroredRootRuntimeDeps) it(`mirrors ${dependencyName} at the root package`, () => {
			const rootManifest = readJson("package.json");
			const pluginManifest = readJson(packagePath);
			const pluginSpec = pluginManifest.dependencies?.[dependencyName] ?? pluginManifest.optionalDependencies?.[dependencyName];
			const rootSpec = rootManifest.dependencies?.[dependencyName] ?? rootManifest.optionalDependencies?.[dependencyName];
			globalExpect(pluginSpec).toBeTruthy();
			globalExpect(rootSpec).toBe(pluginSpec);
		});
		const minHostVersionBaseline = params.minHostVersionBaseline;
		if (minHostVersionBaseline) it("declares a parseable minHostVersion floor at or above the baseline", () => {
			const baseline = parseSemver(minHostVersionBaseline);
			globalExpect(baseline).not.toBeNull();
			if (!baseline) return;
			const requirement = parseMinHostVersionRequirement(readJson(packagePath).openclaw?.install?.minHostVersion ?? null);
			globalExpect(requirement, `${packagePath} should declare openclaw.install.minHostVersion`).not.toBeNull();
			if (!requirement) return;
			const minimum = parseSemver(requirement.minimumLabel);
			globalExpect(minimum, `${packagePath} should use a parseable semver floor`).not.toBeNull();
			if (!minimum) return;
			globalExpect(isAtLeast(minimum, baseline), `${packagePath} should require at least OpenClaw ${minHostVersionBaseline}`).toBe(true);
		});
	});
}
//#endregion
//#region src/plugin-sdk/test-helpers/plugin-registration-contract-cases.ts
const pluginRegistrationContractCases = {
	anthropic: {
		pluginId: "anthropic",
		providerIds: ["anthropic"],
		mediaUnderstandingProviderIds: ["anthropic"],
		cliBackendIds: ["claude-cli"],
		requireDescribeImages: true
	},
	brave: {
		pluginId: "brave",
		webSearchProviderIds: ["brave"]
	},
	comfy: {
		pluginId: "comfy",
		providerIds: ["comfy"],
		imageGenerationProviderIds: ["comfy"],
		musicGenerationProviderIds: ["comfy"],
		videoGenerationProviderIds: ["comfy"],
		requireGenerateImage: true,
		requireGenerateVideo: true
	},
	deepgram: {
		pluginId: "deepgram",
		mediaUnderstandingProviderIds: ["deepgram"]
	},
	duckduckgo: {
		pluginId: "duckduckgo",
		webSearchProviderIds: ["duckduckgo"]
	},
	elevenlabs: {
		pluginId: "elevenlabs",
		speechProviderIds: ["elevenlabs"],
		requireSpeechVoices: true
	},
	exa: {
		pluginId: "exa",
		webSearchProviderIds: ["exa"]
	},
	fal: {
		pluginId: "fal",
		providerIds: ["fal"],
		imageGenerationProviderIds: ["fal"]
	},
	firecrawl: {
		pluginId: "firecrawl",
		webFetchProviderIds: ["firecrawl"],
		webSearchProviderIds: ["firecrawl"],
		toolNames: ["firecrawl_search", "firecrawl_scrape"]
	},
	google: {
		pluginId: "google",
		providerIds: [
			"google",
			"google-gemini-cli",
			"google-vertex"
		],
		webSearchProviderIds: ["gemini"],
		realtimeVoiceProviderIds: ["google"],
		speechProviderIds: ["google"],
		mediaUnderstandingProviderIds: ["google"],
		imageGenerationProviderIds: ["google"],
		requireDescribeImages: true,
		requireGenerateImage: true
	},
	groq: {
		pluginId: "groq",
		mediaUnderstandingProviderIds: ["groq"]
	},
	microsoft: {
		pluginId: "microsoft",
		speechProviderIds: ["microsoft"],
		requireSpeechVoices: true
	},
	minimax: {
		pluginId: "minimax",
		providerIds: ["minimax", "minimax-portal"],
		mediaUnderstandingProviderIds: ["minimax", "minimax-portal"],
		imageGenerationProviderIds: ["minimax", "minimax-portal"],
		requireDescribeImages: true,
		requireGenerateImage: true
	},
	mistral: {
		pluginId: "mistral",
		mediaUnderstandingProviderIds: ["mistral"]
	},
	moonshot: {
		pluginId: "moonshot",
		providerIds: ["moonshot"],
		webSearchProviderIds: ["kimi"],
		mediaUnderstandingProviderIds: ["moonshot"],
		requireDescribeImages: true,
		manifestAuthChoice: {
			pluginId: "kimi",
			choiceId: "kimi-code-api-key",
			choiceLabel: "Kimi Code API key (subscription)",
			groupId: "moonshot",
			groupLabel: "Moonshot AI (Kimi K2.6)",
			groupHint: "Kimi K2.6"
		}
	},
	openai: {
		pluginId: "openai",
		providerIds: ["openai", "openai-codex"],
		speechProviderIds: ["openai"],
		realtimeTranscriptionProviderIds: ["openai"],
		realtimeVoiceProviderIds: ["openai"],
		mediaUnderstandingProviderIds: ["openai", "openai-codex"],
		imageGenerationProviderIds: ["openai"],
		requireSpeechVoices: true,
		requireDescribeImages: true,
		requireGenerateImage: true
	},
	openrouter: {
		pluginId: "openrouter",
		providerIds: ["openrouter"],
		mediaUnderstandingProviderIds: ["openrouter"],
		imageGenerationProviderIds: ["openrouter"],
		videoGenerationProviderIds: ["openrouter"],
		requireDescribeImages: true,
		requireGenerateImage: true,
		requireGenerateVideo: true
	},
	perplexity: {
		pluginId: "perplexity",
		webSearchProviderIds: ["perplexity"]
	},
	senseaudio: {
		pluginId: "senseaudio",
		mediaUnderstandingProviderIds: ["senseaudio"]
	},
	tavily: {
		pluginId: "tavily",
		webSearchProviderIds: ["tavily"],
		toolNames: ["tavily_search", "tavily_extract"]
	},
	"tts-local-cli": {
		pluginId: "tts-local-cli",
		speechProviderIds: ["tts-local-cli", "cli"]
	},
	xai: {
		pluginId: "xai",
		providerIds: ["xai"],
		webSearchProviderIds: ["grok"],
		realtimeTranscriptionProviderIds: ["xai"],
		mediaUnderstandingProviderIds: ["xai"]
	},
	zai: {
		pluginId: "zai",
		mediaUnderstandingProviderIds: ["zai"],
		requireDescribeImages: true
	}
};
//#endregion
//#region src/plugin-sdk/test-helpers/plugin-registration-contract.ts
function findRegistration(pluginId) {
	const entry = pluginRegistrationContractRegistry.find((candidate) => candidate.pluginId === pluginId);
	if (!entry) throw new Error(`plugin registration contract missing for ${pluginId}`);
	return entry;
}
function describePluginRegistrationContract(params) {
	describe(`${params.pluginId} plugin registration contract`, () => {
		if (params.cliBackendIds) it("keeps bundled cli-backend ownership explicit", () => {
			globalExpect(findRegistration(params.pluginId).cliBackendIds).toEqual(params.cliBackendIds);
		});
		if (params.providerIds) it("keeps bundled provider ownership explicit", () => {
			globalExpect(findRegistration(params.pluginId).providerIds).toEqual(params.providerIds);
		});
		if (params.webSearchProviderIds) it("keeps bundled web search ownership explicit", () => {
			globalExpect(findRegistration(params.pluginId).webSearchProviderIds).toEqual(params.webSearchProviderIds);
		});
		if (params.webFetchProviderIds) it("keeps bundled web fetch ownership explicit", () => {
			globalExpect(findRegistration(params.pluginId).webFetchProviderIds).toEqual(params.webFetchProviderIds);
		});
		if (params.speechProviderIds) it("keeps bundled speech ownership explicit", () => {
			globalExpect(findRegistration(params.pluginId).speechProviderIds).toEqual(params.speechProviderIds);
		});
		if (params.realtimeTranscriptionProviderIds) it("keeps bundled realtime-transcription ownership explicit", () => {
			globalExpect(findRegistration(params.pluginId).realtimeTranscriptionProviderIds).toEqual(params.realtimeTranscriptionProviderIds);
		});
		if (params.realtimeVoiceProviderIds) it("keeps bundled realtime-voice ownership explicit", () => {
			globalExpect(findRegistration(params.pluginId).realtimeVoiceProviderIds).toEqual(params.realtimeVoiceProviderIds);
		});
		if (params.mediaUnderstandingProviderIds) it("keeps bundled media-understanding ownership explicit", () => {
			globalExpect(findRegistration(params.pluginId).mediaUnderstandingProviderIds).toEqual(params.mediaUnderstandingProviderIds);
		});
		if (params.imageGenerationProviderIds) it("keeps bundled image-generation ownership explicit", () => {
			globalExpect(findRegistration(params.pluginId).imageGenerationProviderIds).toEqual(params.imageGenerationProviderIds);
		});
		if (params.videoGenerationProviderIds) it("keeps bundled video-generation ownership explicit", () => {
			globalExpect(findRegistration(params.pluginId).videoGenerationProviderIds).toEqual(params.videoGenerationProviderIds);
		});
		if (params.musicGenerationProviderIds) it("keeps bundled music-generation ownership explicit", () => {
			globalExpect(findRegistration(params.pluginId).musicGenerationProviderIds).toEqual(params.musicGenerationProviderIds);
		});
		if (params.toolNames) it("keeps bundled tool ownership explicit", () => {
			globalExpect(findRegistration(params.pluginId).toolNames).toEqual(params.toolNames);
		});
		const manifestAuthChoice = params.manifestAuthChoice;
		if (manifestAuthChoice) it("keeps onboarding auth grouping explicit", () => {
			globalExpect(loadPluginManifestRegistry({}).plugins.find((entry) => entry.origin === "bundled" && entry.id === manifestAuthChoice.pluginId)?.providerAuthChoices).toEqual(globalExpect.arrayContaining([globalExpect.objectContaining({
				choiceId: manifestAuthChoice.choiceId,
				choiceLabel: manifestAuthChoice.choiceLabel,
				groupId: manifestAuthChoice.groupId,
				groupLabel: manifestAuthChoice.groupLabel,
				groupHint: manifestAuthChoice.groupHint
			})]));
		});
	});
}
//#endregion
//#region src/plugin-sdk/test-helpers/public-artifacts.ts
function getPublicArtifactBasename(relativePath) {
	return relativePath.split("/").at(-1) ?? relativePath;
}
const EXTRA_GUARDED_EXTENSION_PUBLIC_SURFACE_BASENAMES = assertUniqueValues([
	"action-runtime.runtime.js",
	"action-runtime-api.js",
	"allow-from.js",
	"api.js",
	"auth-presence.js",
	"channel-config-api.js",
	"index.js",
	"login-qr-api.js",
	"onboard.js",
	"openai-codex-catalog.js",
	"provider-catalog.js",
	"session-key-api.js",
	"setup-api.js",
	"setup-entry.js",
	"timeouts.js",
	"x-search.js"
], "extra guarded extension public surface basename");
const BUNDLED_RUNTIME_SIDECAR_BASENAMES = assertUniqueValues([...new Set(BUNDLED_RUNTIME_SIDECAR_PATHS.map(getPublicArtifactBasename))], "bundled runtime sidecar basename");
const GUARDED_EXTENSION_PUBLIC_SURFACE_BASENAMES = assertUniqueValues([...BUNDLED_RUNTIME_SIDECAR_BASENAMES, ...EXTRA_GUARDED_EXTENSION_PUBLIC_SURFACE_BASENAMES], "guarded extension public surface basename");
//#endregion
export { BUNDLED_RUNTIME_SIDECAR_BASENAMES, GUARDED_EXTENSION_PUBLIC_SURFACE_BASENAMES, assertNoImportTimeSideEffects, createPluginRegistryFixture, describePackageManifestContract, describePluginRegistrationContract, getPublicArtifactBasename, loadBundledPluginPublicSurface, loadBundledPluginPublicSurfaceSync, loadRuntimeApiExportTypesViaJiti, pluginRegistrationContractCases, registerProviderPlugins as registerProviders, registerTestPlugin, registerVirtualTestPlugin, requireRegisteredProvider as requireProvider, resolveWorkspacePackagePublicModuleUrl, runDirectImportSmoke, uniqueSortedStrings };
