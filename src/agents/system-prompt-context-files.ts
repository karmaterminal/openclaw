import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import type { EmbeddedContextFile } from "./embedded-agent-helpers/context-file.js";
import type { SovereignPromptRender } from "./sovereign-prompts/runtime.js";

export const PERSONAL_USER_CONTEXT_INSTRUCTIONS =
  "The personal users/<profile-id>/USER.md belongs to this session's selected person (assigned human owner, otherwise human creator). It supplements shared USER.md and overrides conflicting shared preferences, not higher-priority rules. Other participants do not change this personal context.";

const CONTEXT_FILE_ORDER = new Map<string, number>([
  ["agents.md", 10],
  ["soul.md", 20],
  ["identity.md", 30],
  ["user.md", 40],
  ["tools.md", 50],
  ["bootstrap.md", 60],
  ["memory.md", 70],
]);

const DEFAULT_HEARTBEAT_PROMPT_CONTEXT_BLOCK =
  /Default heartbeat prompt:\r?\n`(?:Read HEARTBEAT\.md if it exists|Follow the heartbeat monitor scratch context when provided\.)[^`\r\n]*HEARTBEAT_OK\.`/gu;
function normalizeContextFilePath(pathValue: string): string {
  return pathValue.trim().replace(/\\/g, "/");
}

export function isBootstrapContextFile(pathValue: string): boolean {
  return /(^|[\\/])BOOTSTRAP\.md$/iu.test(pathValue.trim());
}

function sanitizeContextFileContentForPrompt(content: string): string {
  // Old workspace templates otherwise route Claude subscriptions to paid extra usage.
  return content.replaceAll(DEFAULT_HEARTBEAT_PROMPT_CONTEXT_BLOCK, "").replace(/\n{3,}/g, "\n\n");
}

export function prepareContextFilesForPrompt<T extends EmbeddedContextFile>(
  contextFiles: readonly T[],
  options: {
    order?: ReadonlyMap<string, number>;
    caseInsensitivePathOrder?: boolean;
    trimBasename?: boolean;
  } = {},
) {
  return contextFiles
    .map((file) => {
      const path = normalizeContextFilePath(file.path);
      const rawBasename = path.slice(path.lastIndexOf("/") + 1);
      const basename =
        options.trimBasename === false
          ? rawBasename.toLowerCase()
          : normalizeLowercaseStringOrEmpty(rawBasename);
      return {
        file,
        path,
        basename,
        order: (options.order ?? CONTEXT_FILE_ORDER).get(basename) ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .toSorted((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      if (a.basename !== b.basename) {
        return a.basename.localeCompare(b.basename);
      }
      // Preserve loader precedence for shared USER defaults and the personal overlay.
      if (a.basename === "user.md") {
        return 0;
      }
      return options.caseInsensitivePathOrder
        ? a.path.toLowerCase().localeCompare(b.path.toLowerCase())
        : a.path.localeCompare(b.path);
    });
}

/** Per-file framing fragments of a sovereign prompt agent's `project-context-section.d/`. */
const SOVEREIGN_CONTEXT_FILE_FRAMING = {
  "soul.md": "project-context-section.d/precedence-soul.md",
  "memory.md": "project-context-section.d/precedence-memory.md",
  "user.md": "project-context-section.d/precedence-user.md",
} as const;

/**
 * The workspace-file framing. The heading and each file's own heading and content stay
 * code-owned; for a sovereign prompt agent the framing prose comes from its snapshot.
 */
export function buildProjectContextSection(
  files: ReturnType<typeof prepareContextFilesForPrompt>,
  sovereign?: SovereignPromptRender,
) {
  if (files.length === 0) {
    return [];
  }
  const lines = ["# Project Context", ""];
  const present = (basename: string) => files.some((file) => file.basename === basename);
  const personalUser = files.some(({ file }) => file.personalUser);
  if (sovereign) {
    const framing = [
      sovereign.slot("project-context-section.md"),
      ...Object.entries(SOVEREIGN_CONTEXT_FILE_FRAMING).map(([basename, fragment]) =>
        present(basename) ? sovereign.slot(fragment) : undefined,
      ),
      personalUser ? sovereign.slot("project-context-section.d/personal-user.md") : undefined,
    ];
    lines.push(...framing.filter((line): line is string => line !== undefined));
  } else {
    lines.push("Loaded project context:");
    for (const [basename, guidance] of Object.entries({
      "soul.md": "SOUL.md: persona/tone. Follow it unless higher-priority instructions override.",
      "memory.md":
        "MEMORY.md: durable non-profile facts and decisions; use when relevant unless higher-priority instructions override.",
      "user.md":
        "USER.md: durable user preferences and profile directives; follow unless higher-priority instructions override.",
    })) {
      if (present(basename)) {
        lines.push(guidance);
      }
    }
    if (personalUser) {
      lines.push(PERSONAL_USER_CONTEXT_INSTRUCTIONS);
    }
  }
  lines.push("");
  for (const { file } of files) {
    lines.push(`## ${file.path}`, "", sanitizeContextFileContentForPrompt(file.content), "");
  }
  return lines;
}
