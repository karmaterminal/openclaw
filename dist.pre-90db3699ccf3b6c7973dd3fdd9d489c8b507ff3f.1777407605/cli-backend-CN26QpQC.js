import { n as CLI_RESUME_WATCHDOG_DEFAULTS, t as CLI_FRESH_WATCHDOG_DEFAULTS } from "./cli-watchdog-defaults-sTzbfcfu.js";
import { t as prepareOpenAICodexCliExecution } from "./openai-codex-cli-bridge-2S54n5uX.js";
//#region extensions/openai/cli-backend.ts
const OPENAI_CODEX_DEFAULT_PROFILE_ID = "openai-codex:default";
const CODEX_CLI_DEFAULT_MODEL_REF = "codex-cli/gpt-5.4";
function buildOpenAICodexCliBackend() {
	return {
		id: "codex-cli",
		liveTest: {
			defaultModelRef: CODEX_CLI_DEFAULT_MODEL_REF,
			defaultImageProbe: true,
			defaultMcpProbe: true,
			docker: {
				npmPackage: "@openai/codex",
				binaryName: "codex"
			}
		},
		bundleMcp: true,
		bundleMcpMode: "codex-config-overrides",
		defaultAuthProfileId: OPENAI_CODEX_DEFAULT_PROFILE_ID,
		authEpochMode: "profile-only",
		prepareExecution: prepareOpenAICodexCliExecution,
		config: {
			command: "codex",
			args: [
				"exec",
				"--json",
				"--color",
				"never",
				"--sandbox",
				"workspace-write",
				"--skip-git-repo-check"
			],
			resumeArgs: [
				"exec",
				"resume",
				"{sessionId}",
				"-c",
				"sandbox_mode=\"workspace-write\"",
				"--skip-git-repo-check"
			],
			output: "jsonl",
			resumeOutput: "text",
			input: "arg",
			modelArg: "--model",
			sessionIdFields: ["thread_id"],
			sessionMode: "existing",
			systemPromptFileConfigArg: "-c",
			systemPromptFileConfigKey: "model_instructions_file",
			systemPromptWhen: "first",
			imageArg: "--image",
			imageMode: "repeat",
			reliability: { watchdog: {
				fresh: { ...CLI_FRESH_WATCHDOG_DEFAULTS },
				resume: { ...CLI_RESUME_WATCHDOG_DEFAULTS }
			} },
			serialize: true
		}
	};
}
//#endregion
export { buildOpenAICodexCliBackend as t };
