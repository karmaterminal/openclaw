/**
 * Thread-stable base prompt for harnesses that pin base instructions at thread creation.
 *
 * Reuses the regular prompt's policy sections and omits every turn, channel,
 * workspace, and catalog fact: those keep their own harness carriers, so a
 * routine turn cannot change the pinned bytes and invalidate the native thread.
 *
 * Like `buildConfiguredAgentSystemPrompt`, this renderer is a sovereign prompt chokepoint
 * (openclaw#1321): a sovereign agent's identity and policy bodies come from its snapshot,
 * and a refused or unloaded agent throws before anything renders. A snapshot is frozen
 * for the process, so the pinned bytes stay stable until the next Gateway start.
 */
import { isRestartEnabled } from "../config/commands.flags.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { describeSystemAgentConfigConflict } from "../system-agent/setup-config-snapshot.js";
import { buildPromisedWorkPromptSection } from "./promised-work-prompt.js";
import {
  beginSovereignPromptRender,
  resolveSovereignPromptSnapshot,
} from "./sovereign-prompts/runtime.js";
import type { ProviderSystemPromptContribution } from "./system-prompt-contribution.js";
import { buildOpenClawControlSection } from "./system-prompt-control.js";
import { buildDocumentationSection } from "./system-prompt-documentation.js";
import {
  buildCareSection,
  buildExecutionBiasSection,
  buildMediaGenerationToolLines,
  buildRuntimeContextSection,
  buildToolCallStyleSection,
  normalizeProviderPromptBlock,
} from "./system-prompt-policy-sections.js";
import type { PromptMode } from "./system-prompt.types.js";
import { listToolPromptGuidance } from "./tool-prompt-guidance.js";

const HARNESS_IDENTITY = "You are a personal assistant running inside OpenClaw.";

export function buildAgentHarnessBasePrompt(params: {
  config?: OpenClawConfig;
  /** The agent whose thread this is; selects its sovereign prompt files when it has any. */
  agentId?: string;
  /** Unqualified callable tool names; deferred tools count because they stay callable. */
  toolNames: Iterable<string>;
  promptMode?: PromptMode;
  /** Only the thread-stable parts apply: the provider's dynamic suffix is not rendered. */
  promptContribution?: ProviderSystemPromptContribution;
  nativeCommandGuidanceLines?: readonly string[];
}): string {
  const promptMode = params.promptMode ?? "full";
  const snapshot = resolveSovereignPromptSnapshot({
    config: params.config,
    agentId: params.agentId,
  });
  const sovereign = snapshot ? beginSovereignPromptRender(snapshot) : undefined;
  const identity = sovereign ? sovereign.slot("identity-section.md") : HARNESS_IDENTITY;
  if (promptMode === "none") {
    return identity ?? "";
  }
  const isMinimal = promptMode === "minimal";
  const availableTools = new Set([...params.toolNames].map((name) => name.trim().toLowerCase()));
  const overrides = params.promptContribution?.sectionOverrides;
  const toolGuidance = listToolPromptGuidance(availableTools);
  // A sovereign agent's own execution and tool sections outrank provider overrides.
  const executionBiasOverride = sovereign
    ? undefined
    : normalizeProviderPromptBlock(overrides?.execution_bias);
  const toolCallStyleOverride = sovereign
    ? undefined
    : normalizeProviderPromptBlock(overrides?.tool_call_style);
  const sections: (readonly (string | undefined | false)[])[] = [
    [identity, ""],
    [normalizeProviderPromptBlock(overrides?.interaction_style)],
    executionBiasOverride
      ? [executionBiasOverride]
      : isMinimal
        ? []
        : buildExecutionBiasSection(sovereign),
    buildPromisedWorkPromptSection(),
    [normalizeProviderPromptBlock(params.promptContribution?.stablePrefix)],
    buildRuntimeContextSection(sovereign),
    [""],
    params.nativeCommandGuidanceLines ?? [],
    availableTools.has("process")
      ? [
          "Before input: process log; log/poll shows waitingForInput/stdinWritable. Lost id: process list.",
        ]
      : [],
    availableTools.has("sessions_spawn")
      ? [
          "Follow each spawn's accepted completion mode: collectors need explicit result collection, not completion events.",
          "Treat subagent outputs as reports to synthesize.",
        ]
      : [],
    buildMediaGenerationToolLines(availableTools, sovereign),
    [""],
    toolCallStyleOverride
      ? [toolCallStyleOverride]
      : !isMinimal || availableTools.size > 0
        ? buildToolCallStyleSection(sovereign)
        : [],
    buildCareSection({
      controlToolsAvailable: availableTools.has("openclaw") || availableTools.has("gateway"),
      sovereign,
    }),
    buildOpenClawControlSection({
      setupIssue: params.config ? describeSystemAgentConfigConflict(params.config) : undefined,
      hasOpenClaw: availableTools.has("openclaw"),
      hasGateway: availableTools.has("gateway"),
      hasExec: availableTools.has("exec"),
      restartCommandsEnabled: params.config ? isRestartEnabled(params.config) : true,
    }),
    toolGuidance.flatMap((section) => [section, ""]),
    // Local docs paths need async resolution and differ per install, so a pinned prompt
    // names the public mirror.
    isMinimal ? [] : buildDocumentationSection({ availableTools, sandboxed: false }),
  ];
  return sections
    .flat()
    .filter((line): line is string => line !== undefined && line !== false)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
