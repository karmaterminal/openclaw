import type { z } from "zod";
import type { AgentSandboxConfig } from "./types.agents-shared.js";
import type { AgentDefaultsSchema } from "./zod-schema.agent-defaults.js";

type SchemaAgentDefaultsConfig = NonNullable<z.input<typeof AgentDefaultsSchema>>;

export type AgentContextInjection = NonNullable<SchemaAgentDefaultsConfig["contextInjection"]>;
export type OptionalBootstrapFileName = NonNullable<
  SchemaAgentDefaultsConfig["skipOptionalBootstrapFiles"]
>[number];
export type SubagentDelegationMode = NonNullable<
  NonNullable<SchemaAgentDefaultsConfig["subagents"]>["delegationMode"]
>;
export type ModelSelectionScope = NonNullable<SchemaAgentDefaultsConfig["modelSelectionScope"]>;
export type AgentThinkingLevel = NonNullable<SchemaAgentDefaultsConfig["thinkingDefault"]>;

export type AgentModelEntryConfig = NonNullable<SchemaAgentDefaultsConfig["models"]>[string];

export type AgentModelPolicyConfig = NonNullable<SchemaAgentDefaultsConfig["modelPolicy"]>;

export type AgentContextPruningConfig = NonNullable<SchemaAgentDefaultsConfig["contextPruning"]>;

export type AgentContextLimitsConfig = NonNullable<SchemaAgentDefaultsConfig["contextLimits"]>;

export type AgentDefaultsConfig = Omit<SchemaAgentDefaultsConfig, "sandbox"> & {
  sandbox?: AgentSandboxConfig;
  /** Agent self-elected turn continuation (CONTINUE_WORK signal). */
  continuation?: {
    enabled?: boolean;
    defaultDelayMs?: number;
    minDelayMs?: number;
    maxDelayMs?: number;
    maxChainLength?: number;
    costCapTokens?: number;
    /** Maximum number of continue_delegate tool calls per agent turn (default: 5). */
    maxDelegatesPerTurn?: number;
    /**
     * Maximum concurrent undelivered continue_work flows per session
     * (default: 32). Enforced at enqueue; bounds the multi-continue_work flood
     * independently of maxChainLength (lineage depth).
     */
    maxPendingWork?: number;
    /**
     * Context-pressure awareness threshold (exclusive (0.0, 1.0]). When the session's token
     * usage exceeds this fraction of the context window, a [system:context-pressure]
     * event is injected pre-run so the agent can elect evacuation. Disabled when
     * unset. Recommended: 0.8 (80%).
     */
    contextPressureThreshold?: number;
    /**
     * Early-warning band as a fraction of contextPressureThreshold (default: 0.3125,
     * which fires at 25% when the threshold is 0.8). Set to 0 to opt out.
     */
    earlyWarningBand?: number;
    /**
     * Busy-skip exponential backoff bounds for the continue_work re-arm (rate-cap,
     * not a safety invariant). `baseMs` (default 1000) is the first re-arm delay,
     * multiplied by `factor` (default 2) per consecutive busy-skip up to
     * `ceilingMs` (default: maxDelayMs). The ceiling is the give-up rate-cap —
     * the flow keeps deferring at this rate forever, never dropped.
     */
    busySkipBackoff?: {
      /** First re-arm delay in ms (default 1000). */
      baseMs?: number;
      /** Maximum re-arm delay / give-up rate-cap in ms (default: maxDelayMs). */
      ceilingMs?: number;
      /** Exponential growth factor per consecutive busy-skip (default 2, must be > 1). */
      factor?: number;
    };
    /**
     * Orphan-reap confidence-gate floor in ms. An unended subagent run is
     * treated as confident-terminal (reap-eligible) only after it ages past this
     * cutoff; unset uses the subagent-registry default (2h). The per-run timeout
     * is always respected. Safety invariants (uncertain→quiesce,
     * never-wrongful-reap) are fixed — only this confidence window is tunable.
     */
    orphanReapStaleCutoffMs?: number;
    /**
     * Cross-session delegate targeting policy.
     * - `"disabled"` (default): delegates can return to the dispatching session or
     *   use `fanoutMode: "tree"` for lineage-only routing. Non-self `targetSessionKey`,
     *   `targetSessionKeys` containing any non-self session, and `fanoutMode: "all"`
     *   are rejected with a tool error.
     * - `"enabled"`: all targeting modes are available, including cross-session
     *   `targetSessionKey`, `targetSessionKeys`, and `fanoutMode: "all"`.
     *
     * `fanoutMode: "tree"` (lineage-only return) is always allowed regardless of this setting.
     * Self-targeting (`targetSessionKey` matching the dispatching session) is always allowed.
     */
    crossSessionTargeting?: "disabled" | "enabled";
  };
};
export type AgentCompactionMode = NonNullable<AgentCompactionConfig["mode"]>;
export type AgentCompactionIdentifierPolicy = NonNullable<
  AgentCompactionConfig["identifierPolicy"]
>;
export type AgentCompactionConfig = NonNullable<SchemaAgentDefaultsConfig["compaction"]>;
