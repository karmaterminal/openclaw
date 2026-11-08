/**
 * Code-owned registry of sovereign prompt slots (#1321).
 *
 * The whole main-assembly namespace is declared from phase A on, so a prince can
 * place files ahead of the code. A file for an unconverted slot is validated and
 * digested like any other, but its position still renders from code. Names outside
 * this namespace are refused (`unknown_slot`); phase D adds its own namespaces.
 */
import {
  SYSTEM_PROMPT_CACHE_BOUNDARY,
  SYSTEM_PROMPT_RELOCATABLE_BOUNDARY,
  SYSTEM_PROMPT_RELOCATABLE_BOUNDARY_END,
} from "@openclaw/ai/internal/shared";

type SovereignPromptPhase = "A" | "B" | "C";

type SovereignPromptSlot = {
  /** Stable id, `<key stem>/<fragment>`. */
  slot: string;
  /** The key file or `<key stem>.d/<fragment>.md`, plus gate-selected variants. */
  files: readonly string[];
  required: boolean;
  phase: SovereignPromptPhase;
  /** Closed list of `{{oc:<fact>}}` placeholders the slot's gate guarantees. */
  facts: readonly string[];
};

function slot(
  id: string,
  phase: SovereignPromptPhase,
  files: readonly string[],
  options: { required?: boolean; facts?: readonly string[] } = {},
): SovereignPromptSlot {
  return {
    slot: id,
    files,
    required: options.required ?? false,
    phase,
    facts: options.facts ?? [],
  };
}

const TOOL = "tool-section.d";
const EXECUTION = "execution-section.d";
const SAFETY = "safety-section.d";

// Slots of the loader design § 4.4. Inventory rows and S/D positions arrive with the
// renderer wiring, which pins them by test.
const SOVEREIGN_PROMPT_SLOTS: readonly SovereignPromptSlot[] = [
  // Phase A: the four #1001 keys.
  slot("identity/opening", "A", ["identity-section.md"], { required: true }),
  slot("identity/model", "A", ["identity-section.d/model.md"]),
  slot("execution/bias", "A", ["execution-section.md"]),
  slot("execution/default-execution", "A", [`${EXECUTION}/default-execution.md`]),
  slot("execution/automations-promotion", "A", [`${EXECUTION}/automations-promotion.md`]),
  slot("execution/status-polling", "A", [`${EXECUTION}/status-polling.md`]),
  slot("execution/session-lookup", "A", [`${EXECUTION}/session-lookup.md`]),
  slot("execution/spawn-collection", "A", [
    `${EXECUTION}/spawn-collection.yield.md`,
    `${EXECUTION}/spawn-collection.events.md`,
  ]),
  slot("tool/call-style", "A", ["tool-section.md"], { required: true }),
  slot("tool/workspace-only", "A", [`${TOOL}/workspace-only.md`]),
  slot("tool/tooling", "A", [`${TOOL}/tooling.md`]),
  slot("tool/automations-entry", "A", [`${TOOL}/automations-entry.md`]),
  slot("tool/mcp-framing", "A", [`${TOOL}/mcp-framing.md`]),
  slot("tool/fallback-rule", "A", [
    `${TOOL}/fallback-rule.main.md`,
    `${TOOL}/fallback-rule.other.md`,
  ]),
  slot("tool/long-wait", "A", [`${TOOL}/long-wait.md`]),
  slot("tool/screen-turn", "A", [`${TOOL}/screen-turn.md`]),
  slot("tool/acp-routing", "A", [`${TOOL}/acp-routing.md`]),
  slot("tool/process-input", "A", [`${TOOL}/process-input.md`]),
  slot("tool/media-dedupe", "A", [`${TOOL}/media-dedupe.md`], { facts: ["tool:current"] }),
  slot("tool/acp-thread", "A", [`${TOOL}/acp-thread.md`, `${TOOL}/acp-thread.discord.md`]),
  slot("tool/exec-approval", "A", [
    `${TOOL}/exec-approval.native-ui.md`,
    `${TOOL}/exec-approval.chat.md`,
  ]),
  slot("safety/care", "A", ["safety-section.md"], { required: true }),
  slot("safety/credentials", "A", [
    `${SAFETY}/credentials.control-tools.md`,
    `${SAFETY}/credentials.no-control-tools.md`,
  ]),
  slot("safety/sandbox-acp", "A", [`${SAFETY}/sandbox-acp.md`]),
  slot("safety/sandbox-elevated-send", "A", [`${SAFETY}/sandbox-elevated-send.md`]),
  slot("safety/sandbox-elevated-advice", "A", [`${SAFETY}/sandbox-elevated-advice.md`]),
  // Phase B: the remaining main-assembly keys. Variants the design leaves unnamed are
  // declared when their phase converts them.
  slot("promised-work/main", "B", ["promised-work-section.md"]),
  slot("runtime-context/main", "B", ["runtime-context-section.md"]),
  slot("bootstrap/full", "B", ["bootstrap-section.md"]),
  slot("bootstrap/limited", "B", ["bootstrap-section.d/limited.md"]),
  slot("project-context/main", "B", ["project-context-section.md"]),
  ...["personal-user", "precedence-soul", "precedence-memory", "precedence-user"].map((name) =>
    slot(`project-context/${name}`, "B", [`project-context-section.d/${name}.md`]),
  ),
  slot("openclaw-control/main", "B", ["openclaw-control-section.md"]),
  slot("skills/main", "B", ["skills-section.md"]),
  slot("skill-workshop/main", "B", ["skill-workshop-section.md"]),
  slot("documentation/main", "B", ["documentation-section.md"]),
  slot("ultra/main", "B", ["ultra-section.md"]),
  slot("delegation/main", "B", ["delegation-section.md"]),
  slot("delegation/session-routing", "B", ["delegation-section.d/session-routing.md"]),
  slot("delegation/child-collection", "B", ["delegation-section.d/child-collection.md"]),
  slot("trust/main", "B", ["trust-section.md"]),
  slot("ui-presentation/main", "B", ["ui-presentation-section.md"]),
  slot("control-ui/main", "B", ["control-ui-section.md"]),
  slot("messaging/main", "B", ["messaging-section.md"]),
  slot("messaging/target-rule", "B", [
    "messaging-section.d/target-rule.explicit.md",
    "messaging-section.d/target-rule.source-default.md",
  ]),
  slot("reply-format/main", "B", ["reply-format-section.md"]),
  slot("voice/main", "B", ["voice-section.md"]),
  slot("reactions/main", "B", [
    "reactions-section.md",
    "reactions-section.minimal.md",
    "reactions-section.extensive.md",
  ]),
  slot("incognito/main", "B", ["incognito-section.md"]),
  slot("progress-card/main", "B", ["progress-card-section.md"]),
  slot("permission-change/main", "B", ["permission-change-section.md"]),
  // Phase C: continuation keys, coordinated with the continuation line's owners.
  slot("continuation/main", "C", ["continuation-section.md"]),
  slot("continuation/delegate-hint", "C", ["continuation-section.d/delegate-hint.md"]),
  slot("continuation-chain/main", "C", ["continuation-chain-section.md"]),
];

// Phase A is this loader line's conversion. Nothing renders from a snapshot until the
// renderer wiring lands; until then `enforce` is refused (`enforce_unwired`).
const CONVERTED_PHASES: ReadonlySet<SovereignPromptPhase> = new Set(["A"]);

type SovereignPromptFileEntry = {
  path: string;
  slot: SovereignPromptSlot;
  converted: boolean;
};

const FILES_BY_PATH: ReadonlyMap<string, SovereignPromptFileEntry> = new Map(
  SOVEREIGN_PROMPT_SLOTS.flatMap((entry) =>
    entry.files.map((file) => [
      file,
      { path: file, slot: entry, converted: CONVERTED_PHASES.has(entry.phase) },
    ]),
  ),
);

/** Fragment directories (`<key stem>.d`) the registry declares. */
export const SOVEREIGN_PROMPT_FRAGMENT_DIRS: ReadonlySet<string> = new Set(
  [...FILES_BY_PATH.keys()].flatMap((file) =>
    file.includes("/") ? [file.slice(0, file.indexOf("/"))] : [],
  ),
);

export const SOVEREIGN_PROMPT_REQUIRED_FILES: readonly string[] = SOVEREIGN_PROMPT_SLOTS.filter(
  (entry) => entry.required,
).flatMap((entry) => entry.files);

/** Matches by exact string, so a manifest path is never joined from untrusted input. */
export function lookupSovereignPromptFile(path: string): SovereignPromptFileEntry | undefined {
  return FILES_BY_PATH.get(path);
}

/** Prefix of the slot-and-digest marker that replaces a rendered span on echo surfaces. */
const SOVEREIGN_REDACTION_MARKER_PREFIX = "<!-- openclaw:sovereign";

/** Code markers a sovereign body may never contain, matched anywhere as code matches them. */
const RESERVED_MARKERS: readonly string[] = [
  SYSTEM_PROMPT_CACHE_BOUNDARY.trim(),
  SYSTEM_PROMPT_RELOCATABLE_BOUNDARY.trim(),
  SYSTEM_PROMPT_RELOCATABLE_BOUNDARY_END.trim(),
  "openclaw:attempt:",
  SOVEREIGN_REDACTION_MARKER_PREFIX,
  // extensions/anthropic/cli-tool-naming.ts skips its append when the prompt contains this.
  "## OpenClaw tool names in Claude Code",
];

/** Headings code string-matches; a body line equal to one would be mistaken for the section. */
const RESERVED_HEADINGS: ReadonlySet<string> = new Set([
  "# Project Context",
  "## Skills",
  "## Delegation",
]);

// appendModelIdentitySystemPrompt (src/agents/system-prompt.ts) rewrites every line that
// starts with this after whitespace, so the per-run fact must stay on its code-owned line.
const MODEL_IDENTITY_PREFIX = "Current model identity:";

/** True when a body carries a code marker or a line code would match as its own. */
export function containsReservedSovereignToken(raw: string, normalized: string): boolean {
  return (
    RESERVED_MARKERS.some((marker) => raw.includes(marker)) ||
    normalized
      .split("\n")
      .some(
        (line) => RESERVED_HEADINGS.has(line) || line.trimStart().startsWith(MODEL_IDENTITY_PREFIX),
      )
  );
}

const PLACEHOLDER_OPEN = "{{oc:";
const PLACEHOLDER = /^\{\{oc:([a-z]+:[a-z0-9_]+(?:[.-][a-z0-9_]+)*)\}\}/;

/** Returns the first placeholder problem in a body, or undefined when every token is valid. */
export function findSovereignPlaceholderProblem(
  text: string,
  facts: readonly string[],
): "placeholder_invalid" | "placeholder_unknown" | undefined {
  for (
    let at = text.indexOf(PLACEHOLDER_OPEN);
    at >= 0;
    at = text.indexOf(PLACEHOLDER_OPEN, at + 1)
  ) {
    const fact = PLACEHOLDER.exec(text.slice(at, at + 128))?.[1];
    if (!fact) {
      return "placeholder_invalid";
    }
    if (!facts.includes(fact)) {
      return "placeholder_unknown";
    }
  }
  return undefined;
}
