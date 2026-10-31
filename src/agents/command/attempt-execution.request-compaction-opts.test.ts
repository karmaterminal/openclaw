/**
 * Regression coverage for spawn-init requestCompactionOpts wiring.
 *
 * `runAgentAttempt` constructs and forwards a `requestCompactionOpts` closure
 * to `runEmbeddedAgent` whenever continuation is enabled. Without this wiring,
 * `createOpenClawTools` sees no request-compaction callbacks on turn 1, so the
 * `request_compaction` tool never registers for newly spawned subagents.
 *
 * The sibling `continueWorkOpts` closure already uses the same spawn-init path.
 * These tests keep request-compaction plumbing aligned with it so subagents can
 * both schedule a next turn and reclaim context when pressure rises.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { createTestPreparedRunAdmission } from "../admitted-run-context.test-support.js";
import type { RunEmbeddedAgentParams } from "../embedded-agent-runner/run/params.js";
import type { EmbeddedAgentRunResult } from "../embedded-agent.js";
import { createOpenClawContinuationTools } from "../openclaw-tools.continuation.js";
import { runAgentAttempt } from "./attempt-execution.js";

const runEmbeddedAgentMock = vi.hoisted(() => vi.fn());
const runCliAgentMock = vi.hoisted(() => vi.fn());
const releaseQueuedCompactionTolerantMock = vi.hoisted(() => vi.fn());
const compactEmbeddedAgentSessionMock = vi.hoisted(() => vi.fn());

// mock-isolation: CLI agent runs are recorded without spawning a CLI process.
vi.mock("../cli-runner.js", () => ({
  runCliAgent: runCliAgentMock,
}));

// Spy on the post-compaction release while keeping the rest of the module real
// (computeRequestCompactionContextUsage is used by the closure under test).
vi.mock("../../auto-reply/reply/agent-runner-post-compaction-release.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../auto-reply/reply/agent-runner-post-compaction-release.js")
  >("../../auto-reply/reply/agent-runner-post-compaction-release.js");
  return {
    ...actual,
    releaseQueuedCompactionTolerant: releaseQueuedCompactionTolerantMock,
  };
});

// Intercept the dynamic import inside triggerCompaction so the closure can be
// driven without performing a real compaction.
// mock-isolation: Compaction is recorded without loading the compaction runtime (context engines, plugins, harness).
vi.mock("../embedded-agent-runner/compact.queued.js", () => ({
  compactEmbeddedAgentSession: compactEmbeddedAgentSessionMock,
}));

// mock-isolation: Provider ids normalize locally; the real module imports the catalog lookup and model config resolvers.
vi.mock("../model-selection.js", () => ({
  isCliProvider: (provider: string) =>
    provider.trim().toLowerCase() === "claude-cli" || provider.trim().toLowerCase() === "codex-cli",
  normalizeProviderId: (provider: string) => provider.trim().toLowerCase(),
}));

// mock-isolation: No auth aliases apply; the real map reads provider plugin metadata.
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

// mock-isolation: Embedded agent runs are scripted; no agent session or provider runs.
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

describe("runAgentAttempt spawn-init requestCompactionOpts plumbing", () => {
  let tmpDir: string;
  let sessionEntry: SessionEntry;
  let sessionStore: Record<string, SessionEntry>;
  let storePath: string;
  const sessionKey = "agent:main:subagent:917-trap";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-917-trap-"));
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

  async function runEmbeddedAttempt(
    cfg: OpenClawConfig,
    opts: Partial<Parameters<typeof runAgentAttempt>[0]["opts"]> = {},
  ) {
    await runAgentAttempt({
      preparedRunAdmission: createTestPreparedRunAdmission("run-test"),
      pluginGeneration: undefined,
      providerOverride: "anthropic",
      originalProvider: "anthropic",
      modelOverride: "claude-sonnet-4.7",
      modelRoutingProvenance: {
        requestedProvider: "anthropic",
        requestedModel: "claude-sonnet-4.7",
        stage: "initial",
      },
      cfg,
      sessionEntry,
      sessionId: sessionEntry.sessionId,
      sessionKey,
      sessionAgentId: "main",
      lifecycleGeneration: "test-generation",
      sessionFile: path.join(tmpDir, "session.jsonl"),
      workspaceDir: tmpDir,
      body: "trap-test prompt",
      isFallbackRetry: false,
      resolvedThinkLevel: "medium",
      timeoutMs: 1_000,
      runId: "run-917-trap",
      opts: { message: "trap-test prompt", ...opts },
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

  it("forwards requestCompactionOpts to runEmbeddedAgent when continuation.enabled=true (spawn-init / turn-1)", async () => {
    await runEmbeddedAttempt(makeContinuationEnabledConfig());

    expect(runEmbeddedAgentMock).toHaveBeenCalledTimes(1);
    const callArgs = runEmbeddedAgentMock.mock.calls[0]?.[0] as
      | {
          requestCompactionOpts?: {
            sessionId?: string;
            ownerAgentId?: string;
            getContextUsage?: unknown;
            triggerCompaction?: unknown;
          };
        }
      | undefined;
    expect(callArgs).toBeDefined();
    // If this is undefined, request_compaction never registers in the
    // subagent's turn-1 tool list even though continuation is enabled.
    expect(callArgs?.requestCompactionOpts).toBeDefined();
    expect(typeof callArgs?.requestCompactionOpts?.getContextUsage).toBe("function");
    expect(typeof callArgs?.requestCompactionOpts?.triggerCompaction).toBe("function");
    expect(callArgs?.requestCompactionOpts?.sessionId).toBe(sessionEntry.sessionId);
    expect(callArgs?.requestCompactionOpts?.ownerAgentId).toBe("main");
  });

  it("does NOT forward requestCompactionOpts when continuation is disabled", async () => {
    await runEmbeddedAttempt(makeContinuationDisabledConfig());

    expect(runEmbeddedAgentMock).toHaveBeenCalledTimes(1);
    const callArgs = runEmbeddedAgentMock.mock.calls[0]?.[0] as
      | { requestCompactionOpts?: unknown }
      | undefined;
    expect(callArgs?.requestCompactionOpts).toBeUndefined();
  });

  // bootstrap#1727: a live runner's first turn has no fresh token totals yet. The
  // rejection must say usage is unmeasured, not that this is an inventory-only path.
  // This also drives the runner's real getContextUsage closure through the tool.
  it("rejects a first-turn request_compaction as unmeasured, not as an inventory-only path", async () => {
    const triggerCompaction = vi.fn();
    let result: { content?: unknown; details?: unknown } | undefined;
    runEmbeddedAgentMock.mockImplementationOnce(
      async ({ requestCompactionOpts }: Pick<RunEmbeddedAgentParams, "requestCompactionOpts">) => {
        const tool = createOpenClawContinuationTools({
          config: makeContinuationEnabledConfig(),
          agentSessionKey: sessionKey,
          sessionId: sessionEntry.sessionId,
          runId: "run-917-trap",
          requestCompactionOpts: requestCompactionOpts && {
            ...requestCompactionOpts,
            triggerCompaction,
          },
        }).find((candidate) => candidate.name === "request_compaction");
        result = await tool?.execute("call-first-turn", { reason: "first-turn pressure check" });
        return makeEmbeddedResult();
      },
    );

    await runEmbeddedAttempt(makeContinuationEnabledConfig());

    expect(result?.details).toMatchObject({
      status: "rejected",
      guard: "context_unmeasured",
      cause: "no_fresh_usage",
      reason: expect.stringContaining("not been measured"),
    });
    expect(JSON.stringify(result?.content)).not.toContain("inventory-only");
    expect(triggerCompaction).not.toHaveBeenCalled();
  });

  // A successful turn-1 volitional compaction must run the same
  // `releaseQueuedCompactionTolerant` step used by followup turns so staged
  // `continue_delegate(mode="post-compaction")` work is dispatched.
  it("triggerCompaction releases queued post-compaction delegates after a successful compaction", async () => {
    releaseQueuedCompactionTolerantMock.mockReset();
    compactEmbeddedAgentSessionMock.mockReset();
    const compactionResult = { ok: true, compacted: true, reason: undefined };
    compactEmbeddedAgentSessionMock.mockResolvedValue(compactionResult);

    await runEmbeddedAttempt(makeContinuationEnabledConfig());
    const triggerCompaction = (
      runEmbeddedAgentMock.mock.calls[0]?.[0] as {
        requestCompactionOpts?: {
          triggerCompaction: (req: { trigger: string; runId?: string }) => Promise<unknown>;
        };
      }
    )?.requestCompactionOpts?.triggerCompaction;
    expect(typeof triggerCompaction).toBe("function");

    const result = await triggerCompaction!({ trigger: "volitional", runId: "run-917-trap" });
    expect(result).toEqual({ ok: true, compacted: true, reason: undefined });

    expect(releaseQueuedCompactionTolerantMock).toHaveBeenCalledTimes(1);
    const releaseArgs = releaseQueuedCompactionTolerantMock.mock.calls[0]?.[0] as {
      compactionResult?: unknown;
      sessionKey?: string;
      storePath?: string;
      followupRun?: { run?: { config?: unknown; sessionId?: string; workspaceDir?: string } };
    };
    expect(releaseArgs.compactionResult).toBe(compactionResult);
    expect(releaseArgs.sessionKey).toBe(sessionKey);
    expect(releaseArgs.storePath).toBe(storePath);
    // The synthesized FollowupRun carries the fields the dispatch path reads.
    expect(releaseArgs.followupRun?.run?.config).toBeDefined();
    expect(releaseArgs.followupRun?.run?.sessionId).toBe(sessionEntry.sessionId);
    expect(releaseArgs.followupRun?.run?.workspaceDir).toBe(tmpDir);
  });

  it("triggerCompaction releases once and reports a degraded committed summary", async () => {
    releaseQueuedCompactionTolerantMock.mockReset();
    compactEmbeddedAgentSessionMock.mockReset();
    compactEmbeddedAgentSessionMock.mockResolvedValue({
      ok: true,
      compacted: true,
      result: {
        summary: "best available summary",
        firstKeptEntryId: "entry-1",
        tokensBefore: 100,
        details: { readFiles: [], modifiedFiles: [], qualityDegraded: true },
      },
    });

    await runEmbeddedAttempt(makeContinuationEnabledConfig());
    const triggerCompaction = (
      runEmbeddedAgentMock.mock.calls[0]?.[0] as {
        requestCompactionOpts?: {
          triggerCompaction: (req: { trigger: string }) => Promise<unknown>;
        };
      }
    )?.requestCompactionOpts?.triggerCompaction;

    expect(await triggerCompaction!({ trigger: "volitional" })).toEqual({
      ok: true,
      compacted: true,
      reason: undefined,
      qualityDegraded: true,
    });
    expect(releaseQueuedCompactionTolerantMock).toHaveBeenCalledTimes(1);
  });

  it("triggerCompaction does NOT release when compaction did not apply", async () => {
    releaseQueuedCompactionTolerantMock.mockReset();
    compactEmbeddedAgentSessionMock.mockReset();
    compactEmbeddedAgentSessionMock.mockResolvedValue({
      ok: true,
      compacted: false,
      reason: "below-threshold",
    });

    await runEmbeddedAttempt(makeContinuationEnabledConfig());
    const triggerCompaction = (
      runEmbeddedAgentMock.mock.calls[0]?.[0] as {
        requestCompactionOpts?: {
          triggerCompaction: (req: { trigger: string }) => Promise<unknown>;
        };
      }
    )?.requestCompactionOpts?.triggerCompaction;

    await triggerCompaction!({ trigger: "volitional" });
    expect(releaseQueuedCompactionTolerantMock).not.toHaveBeenCalled();
  });

  it("does not release post-compaction delegates after cancellation wins", async () => {
    const abort = new AbortController();
    let resolveCompaction: ((result: { ok: boolean; compacted: boolean }) => void) | undefined;
    compactEmbeddedAgentSessionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCompaction = resolve;
      }),
    );

    await runEmbeddedAttempt(makeContinuationEnabledConfig(), { abortSignal: abort.signal });
    const triggerCompaction = (
      runEmbeddedAgentMock.mock.calls[0]?.[0] as {
        requestCompactionOpts?: {
          triggerCompaction: (req: { trigger: string }) => Promise<unknown>;
        };
      }
    )?.requestCompactionOpts?.triggerCompaction;
    const pending = triggerCompaction!({ trigger: "volitional" });
    abort.abort("test cancellation during compaction");
    resolveCompaction?.({ ok: true, compacted: true });

    await pending;
    expect(releaseQueuedCompactionTolerantMock).not.toHaveBeenCalled();
  });
});
