/**
 * Regression-pin trap-test for #746 Layer 2 cure (PR #892 complement).
 *
 * Asserts that `runAgentAttempt` (the spawn-init / turn-1 path that subagent
 * gateway invocations land on via callSubagentGateway → agentCommandInternal →
 * runAgentAttempt → runEmbeddedAgent) forwards a `continueWorkOpts` closure to
 * `runEmbeddedAgent` whenever `cfg.agents.defaults.continuation.enabled === true`.
 *
 * Without this wiring, openclaw-tools.ts:592 evaluates
 * `options?.continueWorkOpts` as undefined on turn-1, the `continue_work` tool
 * never registers in the subagent's spawn-init tool-list, and subagent sessions
 * cannot self-elect another turn even though PR #892 cured the same gap on the
 * followup-runner (turn-2+) path. Silas `1511789172` empirical:
 * `CONTINUE_WORK STILL NOT AVAILABLE` post-PR-#892-merge.
 *
 * Cure-mechanism-distinction: same observable `turn 2/200` event can be
 * produced by either chain-hop (continue_delegate) or in-session continue_work.
 * This test pins the tool-list-introspection invariant (continueWorkOpts
 * present on turn-1) so the cure path can be verified independently of the
 * delivery mechanism.
 *
 * Trap-test-first per figs `1511789649` + Cael `1511790615`/`1511790113`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { EmbeddedAgentRunResult } from "../embedded-agent.js";
import { runAgentAttempt } from "./attempt-execution.js";

const runEmbeddedAgentMock = vi.hoisted(() => vi.fn());
const runCliAgentMock = vi.hoisted(() => vi.fn());

vi.mock("../cli-runner.js", () => ({
  runCliAgent: runCliAgentMock,
}));

vi.mock("../model-selection.js", () => ({
  isCliProvider: (provider: string) =>
    provider.trim().toLowerCase() === "claude-cli" || provider.trim().toLowerCase() === "codex-cli",
  normalizeProviderId: (provider: string) => provider.trim().toLowerCase(),
}));

vi.mock("../provider-auth-aliases.js", () => ({
  resolveProviderAuthAliasMap: () => ({}),
  resolveProviderIdForAuth: (provider: string) => provider.trim().toLowerCase(),
}));

vi.mock("../model-runtime-aliases.js", async () => {
  const actual = await vi.importActual<typeof import("../model-runtime-aliases.js")>(
    "../model-runtime-aliases.js",
  );
  return {
    ...actual,
    resolveCliRuntimeExecutionProvider: ({ provider }: { provider?: string }) => provider,
  };
});

vi.mock("../embedded-agent.js", () => ({
  runEmbeddedAgent: runEmbeddedAgentMock,
}));

function makeEmbeddedResult(): EmbeddedAgentRunResult {
  return {
    payloads: [{ text: "ok" }],
    meta: {
      durationMs: 1,
      finalAssistantVisibleText: "ok",
      agentMeta: {
        sessionId: "session-embedded",
        provider: "anthropic",
        model: "claude-sonnet-4.7",
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          total: 2,
        },
      },
    },
  };
}

function makeContinuationEnabledConfig(): OpenClawConfig {
  return {
    agents: {
      defaults: {
        continuation: {
          enabled: true,
          maxChainLength: 200,
          defaultDelayMs: 15000,
          minDelayMs: 5000,
          maxDelayMs: 86400000,
          costCapTokens: 50000000,
          maxDelegatesPerTurn: 500,
        },
      },
    },
  } as unknown as OpenClawConfig;
}

function makeContinuationDisabledConfig(): OpenClawConfig {
  return {
    agents: {
      defaults: {},
    },
  } as unknown as OpenClawConfig;
}

describe("runAgentAttempt #746 spawn-init continueWorkOpts plumbing (Layer 2 cure)", () => {
  let tmpDir: string;
  let sessionEntry: SessionEntry;
  let sessionStore: Record<string, SessionEntry>;
  let storePath: string;
  const sessionKey = "agent:main:subagent:746-trap";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-746-trap-"));
    storePath = path.join(tmpDir, "sessions.json");
    runEmbeddedAgentMock.mockReset();
    runCliAgentMock.mockReset();
    runEmbeddedAgentMock.mockResolvedValue(makeEmbeddedResult());
    sessionEntry = {
      sessionId: "session-embedded",
      updatedAt: Date.now(),
    } as SessionEntry;
    sessionStore = { [sessionKey]: sessionEntry };
    await fs.writeFile(storePath, JSON.stringify(sessionStore, null, 2), "utf-8");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function runEmbeddedAttempt(cfg: OpenClawConfig) {
    await runAgentAttempt({
      providerOverride: "anthropic",
      originalProvider: "anthropic",
      modelOverride: "claude-sonnet-4.7",
      cfg,
      sessionEntry,
      sessionId: sessionEntry.sessionId,
      sessionKey,
      sessionAgentId: "main",
      sessionFile: path.join(tmpDir, "session.jsonl"),
      workspaceDir: tmpDir,
      body: "trap-test prompt",
      isFallbackRetry: false,
      resolvedThinkLevel: "medium",
      timeoutMs: 1_000,
      runId: "run-746-trap",
      opts: {} as Parameters<typeof runAgentAttempt>[0]["opts"],
      runContext: {} as Parameters<typeof runAgentAttempt>[0]["runContext"],
      spawnedBy: undefined,
      messageChannel: undefined,
      skillsSnapshot: undefined,
      resolvedVerboseLevel: undefined,
      agentDir: tmpDir,
      onAgentEvent: vi.fn(),
      authProfileProvider: "anthropic",
      sessionStore,
      storePath,
      sessionHasHistory: false,
    });
  }

  it("forwards continueWorkOpts to runEmbeddedAgent when continuation.enabled=true (spawn-init / turn-1)", async () => {
    await runEmbeddedAttempt(makeContinuationEnabledConfig());

    expect(runEmbeddedAgentMock).toHaveBeenCalledTimes(1);
    const callArgs = runEmbeddedAgentMock.mock.calls[0]?.[0] as
      | { continueWorkOpts?: { requestContinuation?: unknown } }
      | undefined;
    expect(callArgs).toBeDefined();
    // RED: pre-cure this is undefined → continue_work never registers in
    //      the subagent's turn-1 tool-list.
    expect(callArgs?.continueWorkOpts).toBeDefined();
    expect(typeof callArgs?.continueWorkOpts?.requestContinuation).toBe("function");
  });

  it("does NOT forward continueWorkOpts when continuation is disabled", async () => {
    await runEmbeddedAttempt(makeContinuationDisabledConfig());

    expect(runEmbeddedAgentMock).toHaveBeenCalledTimes(1);
    const callArgs = runEmbeddedAgentMock.mock.calls[0]?.[0] as
      | { continueWorkOpts?: unknown }
      | undefined;
    expect(callArgs?.continueWorkOpts).toBeUndefined();
  });
});
