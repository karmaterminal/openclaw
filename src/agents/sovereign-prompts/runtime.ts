import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { registerSovereignRenderedInstance } from "../../logging/sovereign-redaction.js";
/**
 * Process registry of loaded sovereign prompt snapshots (openclaw#1321, design § 4.6, § 6).
 *
 * Each `enforce` agent's generation is read once per process: at Gateway start before
 * agent work is admitted, or at the first render in any other process that renders
 * prompts. The registry is read-only afterwards, so a generation changes only with a
 * restart (§ 6.3), and an `enforce` agent the registry never loaded fails `not_loaded`.
 * An agent loaded as `enforce` stays `enforce` until restart, whatever later config says.
 */
import { createSubsystemLogger, type SubsystemLogger } from "../../logging/subsystem.js";
import { normalizeAgentIdStrict } from "../../routing/session-key.js";
import { resolveGlobalSingleton } from "../../shared/global-singleton.js";
import { listAgentEntries } from "../agent-roster.js";
import { resolveAgentConfig } from "../agent-scope-config.js";
import {
  loadSovereignPromptSnapshot,
  resolveSovereignPromptTarget,
  toSovereignPromptRefusal,
} from "./loader.js";
import { lookupSovereignPromptFile, resolveSovereignPlaceholders } from "./registry.js";
import {
  describeSovereignPromptsLoaded,
  describeSovereignPromptsRefused,
  SovereignPromptRefusal,
  type SovereignPromptSnapshot,
} from "./snapshot.js";

type SovereignAgentState =
  | { state: "loaded"; snapshot: SovereignPromptSnapshot }
  | { state: "refused"; refusal: SovereignPromptRefusal };

// Duplicated runtime chunks (core and the plugin SDK) share one registry. An in-process
// Gateway restart clears it, and the next start loads every generation again.
const runtime = resolveGlobalSingleton<{ agents: Map<string, SovereignAgentState> | undefined }>(
  Symbol.for("openclaw.sovereignPrompts.runtime"),
  () => ({ agents: undefined }),
  (value) => {
    value.agents = undefined;
  },
);

/**
 * Routes whose prompt carrier a test proves receives the loaded text (the embedded
 * OpenClaw renderer, and Codex `baseInstructions`). Every other route is refused for an
 * `enforce` agent, so no run there falls back to stock text (§ 7.3).
 */
const CONVERTED_ROUTES: ReadonlySet<string> = new Set(["openclaw", "codex"]);

function strictAgentId(agentId: string | undefined): string | undefined {
  const normalized = agentId?.trim() ? normalizeAgentIdStrict(agentId) : undefined;
  return normalized?.ok ? normalized.value : undefined;
}

function configuredMode(config: OpenClawConfig | undefined, agentId: string) {
  return (
    (config ? resolveAgentConfig(config, agentId)?.sovereignPrompts?.mode : undefined) ?? "off"
  );
}

function isSovereignAgentId(config: OpenClawConfig | undefined, agentId: string): boolean {
  return runtime.agents?.has(agentId) || configuredMode(config, agentId) === "enforce";
}

/**
 * Whether this process has any sovereign agent: `enforce` in current config, or `enforce`
 * when the registry loaded, which holds until restart even if config later turns it off.
 */
function hasSovereignAgent(config: OpenClawConfig | undefined): boolean {
  return Boolean(
    runtime.agents?.size ||
    (config &&
      listAgentEntries(config).some((entry) => entry.sovereignPrompts?.mode === "enforce")),
  );
}

function loadAgent(
  config: OpenClawConfig,
  agentId: string,
  env: NodeJS.ProcessEnv,
): SovereignAgentState {
  try {
    const target = resolveSovereignPromptTarget(config, agentId, env);
    return {
      state: "loaded",
      snapshot: loadSovereignPromptSnapshot({
        agentId: target.agentId,
        target: { root: target.root },
      }),
    };
  } catch (error) {
    // An unexpected throw refuses this agent too, so Gateway start goes on (§ 4.6, question
    // 1); its native message is dropped, since it can carry a path or content (§ 5.3).
    return { state: "refused", refusal: toSovereignPromptRefusal(error) };
  }
}

/**
 * Loads every configured `enforce` agent once for this process and logs one
 * content-free line per agent. Later calls return the same registry.
 */
export function loadSovereignPromptsForProcess(
  config: OpenClawConfig,
  options: { env?: NodeJS.ProcessEnv; log?: Pick<SubsystemLogger, "info" | "warn"> } = {},
): ReadonlyMap<string, SovereignAgentState> {
  if (runtime.agents) {
    return runtime.agents;
  }
  const log = options.log ?? createSubsystemLogger("agents/sovereign-prompts");
  const agents = new Map<string, SovereignAgentState>();
  for (const entry of listAgentEntries(config)) {
    if (entry.sovereignPrompts?.mode !== "enforce") {
      continue;
    }
    const agentId = strictAgentId(entry.id);
    const state: SovereignAgentState = agentId
      ? loadAgent(config, agentId, options.env ?? process.env)
      : { state: "refused", refusal: new SovereignPromptRefusal("agent_unknown") };
    const key = agentId ?? entry.id;
    agents.set(key, state);
    if (state.state === "loaded") {
      const { line, fields } = describeSovereignPromptsLoaded(state.snapshot);
      log.info(line, fields);
    } else {
      // A refusal fails that agent only; the process and every other agent keep working.
      const { line, fields } = describeSovereignPromptsRefused(key, state.refusal);
      log.warn(line, fields);
    }
  }
  runtime.agents = agents;
  return agents;
}

/**
 * True when a render for this call comes from a snapshot or is refused, never from code
 * text: the named agent is sovereign, or the call names no valid agent while this process
 * has a sovereign agent, as the renderer chokepoint decides it. Reads no file.
 */
export function isSovereignPromptAgent(
  config: OpenClawConfig | undefined,
  agentId: string | undefined,
): boolean {
  const id = strictAgentId(agentId);
  return id ? isSovereignAgentId(config, id) : hasSovereignAgent(config);
}

/**
 * The renderer chokepoint's lookup (§ 4.6): `undefined` for an agent that renders code
 * text, the frozen snapshot for a loaded `enforce` agent, and a thrown content-free
 * refusal for a refused or unloaded `enforce` agent, or for a call that names no valid
 * agent while this process has any sovereign agent. A missing id is a run-identity
 * failure, so it is never filled in from a default owner: that owner's text, or stock,
 * could stand in for the agent whose id was lost. Owner-scoped operations resolve their
 * owner before calling and pass it.
 */
export function resolveSovereignPromptSnapshot(params: {
  config?: OpenClawConfig;
  agentId?: string;
}): SovereignPromptSnapshot | undefined {
  const agentId = strictAgentId(params.agentId);
  if (!agentId) {
    if (hasSovereignAgent(params.config)) {
      throw new SovereignPromptRefusal("agent_unknown");
    }
    return undefined;
  }
  if (!isSovereignAgentId(params.config, agentId)) {
    return undefined;
  }
  const agents =
    runtime.agents ?? (params.config ? loadSovereignPromptsForProcess(params.config) : undefined);
  const state = agents?.get(agentId);
  if (!state) {
    // Added as `enforce` after this process loaded its generations (hot reload, § 6.3).
    throw new SovereignPromptRefusal("not_loaded");
  }
  if (state.state === "refused") {
    throw new SovereignPromptRefusal(state.refusal.code, state.refusal.details);
  }
  return state.snapshot;
}

/** Fails a run routed where no test proves the loaded text reaches the model (§ 7.3). */
export function assertSovereignPromptRoute(params: {
  config?: OpenClawConfig;
  agentId?: string;
  route: string;
}): void {
  if (
    !CONVERTED_ROUTES.has(params.route) &&
    isSovereignPromptAgent(params.config, params.agentId)
  ) {
    throw new SovereignPromptRefusal("route_unconverted", { route: params.route });
  }
}

/**
 * The run-level route for a harness attempt. Codex ring-zero threads pin an empty base
 * and `none` threads carry its own identity line, so neither carries the loaded identity.
 */
export function resolveSovereignPromptHarnessRoute(params: {
  harnessId: string;
  ringZero: boolean;
  promptMode?: string;
}): string {
  if (params.harnessId === "codex" && params.ringZero) {
    return "codex:ring-zero";
  }
  if (params.harnessId === "codex" && params.promptMode === "none") {
    return "codex:none";
  }
  return params.harnessId;
}

/** Fails a whole-prompt replacement at `site` for an `enforce` agent (§ 7.1, question 6). */
export function assertSovereignPromptNotReplaced(
  config: OpenClawConfig | undefined,
  agentId: string | undefined,
  site: string,
): void {
  if (isSovereignPromptAgent(config, agentId)) {
    throw new SovereignPromptRefusal("sovereign_override_denied", { site });
  }
}

/** A provider transform may add text but never alter a rendered sovereign span (§ 7.1). */
export function assertSovereignSpansIntact(prompt: string, instances: readonly string[]): void {
  if (instances.some((instance) => !prompt.includes(instance))) {
    throw new SovereignPromptRefusal("transform_altered");
  }
}

/** One render's view of a snapshot: converted bodies, each registered for redaction. */
export type SovereignPromptRender = {
  readonly agentId: string;
  readonly setDigest: string;
  /** The normalized body of a converted registry file; `undefined` when the file is absent. */
  slot(file: string, facts?: Readonly<Record<string, string>>): string | undefined;
  /** Re-registers every instance as `rewrite` ships it (blind workspace paths). */
  rewrite(rewrite: (text: string) => string): void;
  /** What this render placed, in render order. */
  readonly instances: readonly string[];
};

export function beginSovereignPromptRender(
  snapshot: SovereignPromptSnapshot,
): SovereignPromptRender {
  const rendered: { slot: string; text: string }[] = [];
  return {
    agentId: snapshot.agentId,
    setDigest: snapshot.setDigest,
    slot(file, facts) {
      const entry = lookupSovereignPromptFile(file);
      if (!entry?.slot.converted) {
        throw new Error(`Not a converted sovereign prompt file: ${file}`);
      }
      const body = snapshot.body(file);
      if (body === undefined) {
        return undefined;
      }
      const text = resolveSovereignPlaceholders(body, facts ?? {});
      registerSovereignRenderedInstance(text, entry.slot.slot);
      rendered.push({ slot: entry.slot.slot, text });
      return text;
    },
    rewrite(rewrite) {
      for (const instance of rendered) {
        instance.text = rewrite(instance.text);
        registerSovereignRenderedInstance(instance.text, instance.slot);
      }
    },
    get instances() {
      return rendered.map(({ text }) => text);
    },
  };
}

/** Gateway status: each loaded agent's generation and digest, or its refusal code. */
export function describeSovereignPromptStatus() {
  if (!runtime.agents) {
    return undefined;
  }
  return [...runtime.agents].map(([agentId, entry]) =>
    entry.state === "loaded"
      ? {
          agentId,
          state: "loaded" as const,
          generation: entry.snapshot.generation,
          setDigest: entry.snapshot.setDigest,
          files: entry.snapshot.files.length,
          bytes: entry.snapshot.bytes,
        }
      : Object.assign({ agentId, state: "refused" as const }, entry.refusal.toJSON()),
  );
}

export function resetSovereignPromptRuntimeForTests(): void {
  runtime.agents = undefined;
}
