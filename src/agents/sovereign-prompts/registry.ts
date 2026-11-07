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
  /** Inventory rows the slot replaces. */
  rows: readonly string[];
  /** `S<n>` above the cache boundary, `D<n>` below it. */
  position: string;
  required: boolean;
  phase: SovereignPromptPhase;
  /** Closed list of `{{oc:<fact>}}` placeholders the slot's gate guarantees. */
  facts: readonly string[];
};

function slot(
  id: string,
  phase: SovereignPromptPhase,
  position: string,
  rows: readonly string[],
  files: readonly string[],
  options: { required?: boolean; facts?: readonly string[] } = {},
): SovereignPromptSlot {
  return {
    slot: id,
    files,
    rows,
    position,
    required: options.required ?? false,
    phase,
    facts: options.facts ?? [],
  };
}

const TOOL = "tool-section.d";
const EXECUTION = "execution-section.d";
const SAFETY = "safety-section.d";

/** Slots in assembly order within each phase, as listed in the loader design § 4.4. */
const SOVEREIGN_PROMPT_SLOTS: readonly SovereignPromptSlot[] = [
  // Phase A: the four #1001 keys.
  slot("identity/opening", "A", "S1", ["M02", "M01"], ["identity-section.md"], { required: true }),
  slot("execution/bias", "A", "S3", ["M03"], ["execution-section.md"]),
  slot("tool/workspace-only", "A", "S8", ["M07"], [`${TOOL}/workspace-only.md`]),
  slot("tool/tooling", "A", "D1", ["M15"], [`${TOOL}/tooling.md`]),
  slot("tool/automations-entry", "A", "D1", ["M70"], [`${TOOL}/automations-entry.md`]),
  slot("tool/mcp-framing", "A", "D1", ["M71"], [`${TOOL}/mcp-framing.md`]),
  slot(
    "tool/fallback-rule",
    "A",
    "D1",
    ["M72"],
    [`${TOOL}/fallback-rule.main.md`, `${TOOL}/fallback-rule.other.md`],
  ),
  slot("tool/long-wait", "A", "D3", ["M21"], [`${TOOL}/long-wait.md`]),
  slot("tool/screen-turn", "A", "D3", ["M23"], [`${TOOL}/screen-turn.md`]),
  slot("execution/default-execution", "A", "D3", ["M22"], [`${EXECUTION}/default-execution.md`]),
  slot(
    "execution/automations-promotion",
    "A",
    "D3",
    ["M24"],
    [`${EXECUTION}/automations-promotion.md`],
  ),
  slot("tool/acp-routing", "A", "D6", ["M26"], [`${TOOL}/acp-routing.md`]),
  slot("execution/status-polling", "A", "D7", ["M27"], [`${EXECUTION}/status-polling.md`]),
  slot("execution/session-lookup", "A", "D7", ["M27"], [`${EXECUTION}/session-lookup.md`]),
  slot("tool/process-input", "A", "D8", ["M28"], [`${TOOL}/process-input.md`]),
  slot(
    "execution/spawn-collection",
    "A",
    "D9",
    ["M29"],
    [`${EXECUTION}/spawn-collection.yield.md`, `${EXECUTION}/spawn-collection.events.md`],
  ),
  slot("tool/media-dedupe", "A", "D10", ["M30"], [`${TOOL}/media-dedupe.md`], {
    facts: ["tool:current"],
  }),
  slot("tool/call-style", "A", "D11", ["M31"], ["tool-section.md"], { required: true }),
  slot("safety/care", "A", "D12", ["M32"], ["safety-section.md"], { required: true }),
  slot(
    "safety/credentials",
    "A",
    "D12",
    ["M33"],
    [`${SAFETY}/credentials.control-tools.md`, `${SAFETY}/credentials.no-control-tools.md`],
  ),
  slot("safety/sandbox-acp", "A", "D19", ["M39"], [`${SAFETY}/sandbox-acp.md`]),
  slot("safety/sandbox-elevated-send", "A", "D19", ["M39"], [`${SAFETY}/sandbox-elevated-send.md`]),
  slot(
    "safety/sandbox-elevated-advice",
    "A",
    "D19",
    ["M39"],
    [`${SAFETY}/sandbox-elevated-advice.md`],
  ),
  slot(
    "tool/acp-thread",
    "A",
    "D21",
    ["M40"],
    [`${TOOL}/acp-thread.md`, `${TOOL}/acp-thread.discord.md`],
  ),
  slot(
    "tool/exec-approval",
    "A",
    "D27",
    ["M48"],
    [`${TOOL}/exec-approval.native-ui.md`, `${TOOL}/exec-approval.chat.md`],
  ),
  slot("identity/model", "A", "D40", ["M63"], ["identity-section.d/model.md"]),
  // Phase B: the remaining main-assembly keys. Variants the design leaves unnamed are
  // declared when their phase converts them.
  slot("promised-work/main", "B", "S4", ["M04"], ["promised-work-section.md"]),
  slot("runtime-context/main", "B", "S6", ["M05"], ["runtime-context-section.md"]),
  slot("bootstrap/full", "B", "S10", ["M08"], ["bootstrap-section.md"]),
  slot("bootstrap/limited", "B", "S10", ["M09"], ["bootstrap-section.d/limited.md"]),
  slot("project-context/main", "B", "S14", ["M13"], ["project-context-section.md"]),
  ...["personal-user", "precedence-soul", "precedence-memory", "precedence-user"].map((name) =>
    slot(`project-context/${name}`, "B", "S14", ["M14"], [`project-context-section.d/${name}.md`]),
  ),
  slot(
    "delegation/session-routing",
    "B",
    "D9",
    ["M42"],
    ["delegation-section.d/session-routing.md"],
  ),
  slot("openclaw-control/main", "B", "D13", ["M34"], ["openclaw-control-section.md"]),
  slot("skills/main", "B", "D14", ["M35"], ["skills-section.md"]),
  slot("skill-workshop/main", "B", "D15", ["M36"], ["skill-workshop-section.md"]),
  slot("documentation/main", "B", "D18", ["M38"], ["documentation-section.md"]),
  slot("ultra/main", "B", "D22", ["M41"], ["ultra-section.md"]),
  slot("delegation/main", "B", "D23", ["M43"], ["delegation-section.md"]),
  slot("trust/main", "B", "D28", ["M49"], ["trust-section.md"]),
  slot("ui-presentation/main", "B", "D29", ["M50"], ["ui-presentation-section.md"]),
  slot("control-ui/main", "B", "D31", ["M52"], ["control-ui-section.md"]),
  slot("messaging/main", "B", "D32", ["M53"], ["messaging-section.md"]),
  slot(
    "messaging/target-rule",
    "B",
    "D32",
    ["M73"],
    [
      "messaging-section.d/target-rule.explicit.md",
      "messaging-section.d/target-rule.source-default.md",
    ],
  ),
  slot(
    "delegation/child-collection",
    "B",
    "D32",
    ["M44"],
    ["delegation-section.d/child-collection.md"],
  ),
  slot("reply-format/main", "B", "D33", ["M55"], ["reply-format-section.md"]),
  slot("voice/main", "B", "D34", ["M56"], ["voice-section.md"]),
  slot("incognito/main", "B", "D35", ["M65"], ["incognito-section.md"]),
  slot("progress-card/main", "B", "D35", ["M66"], ["progress-card-section.md"]),
  slot(
    "reactions/main",
    "B",
    "D36",
    ["M58"],
    ["reactions-section.md", "reactions-section.minimal.md", "reactions-section.extensive.md"],
  ),
  slot("permission-change/main", "B", "PERMISSION", ["M68"], ["permission-change-section.md"]),
  // Phase C: continuation keys, coordinated with the continuation line's owners.
  slot(
    "continuation/delegate-hint",
    "C",
    "D5",
    ["M25"],
    ["continuation-section.d/delegate-hint.md"],
  ),
  slot("continuation/main", "C", "D39", ["M60"], ["continuation-section.md"]),
  slot("continuation-chain/main", "C", "D39", ["M61"], ["continuation-chain-section.md"]),
];

/** Phases whose slots this build renders from the snapshot. */
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

/** Code markers a sovereign body may never contain. */
const RESERVED_MARKERS: readonly string[] = [
  SYSTEM_PROMPT_CACHE_BOUNDARY.trim(),
  SYSTEM_PROMPT_RELOCATABLE_BOUNDARY.trim(),
  SYSTEM_PROMPT_RELOCATABLE_BOUNDARY_END.trim(),
  "openclaw:attempt:",
  SOVEREIGN_REDACTION_MARKER_PREFIX,
];

/** Headings code string-matches; a body line equal to one would be mistaken for the section. */
const RESERVED_HEADINGS: ReadonlySet<string> = new Set([
  "# Project Context",
  "## Skills",
  "## Delegation",
  // Owned by extensions/anthropic/cli-tool-naming.ts; its presence skips that transform.
  "## OpenClaw tool names in Claude Code",
]);

/** True when raw text carries a code marker, or a normalized line equals a code-matched heading. */
export function containsReservedSovereignToken(raw: string, normalized: string): boolean {
  return (
    RESERVED_MARKERS.some((marker) => raw.includes(marker)) ||
    normalized.split("\n").some((line) => RESERVED_HEADINGS.has(line))
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
