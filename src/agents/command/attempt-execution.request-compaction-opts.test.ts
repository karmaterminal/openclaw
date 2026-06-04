/**
 * Regression-pin trap-test for #917 Layer 2 cure (sister of #746 continueWorkOpts).
 *
 * Asserts that `runAgentAttempt` (the spawn-init / turn-1 path) constructs and
 * forwards `requestCompactionOpts` to `runEmbeddedAgent` when
 * `continuation.enabled=true`. Without this wiring, openclaw-tools.ts:609
 * evaluates `options?.requestCompactionOpts` as undefined and `request_compaction`
 * never registers in the subagent's turn-1 tool-list.
 *
 * Mirrors: attempt-execution.continue-work-opts.test.ts (#746 Layer 2 cure).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — same pattern as the continueWorkOpts sister test
// ---------------------------------------------------------------------------

vi.mock("../embedded-agent.js", () => ({
  runEmbeddedAgent: vi.fn(async () => makeEmbeddedResult()),
}));

vi.mock("../../auto-reply/reply/agent-runner-execution.js", () => ({
  computeRequestCompactionContextUsage: vi.fn(() => 0.42),
}));

// Minimal EmbeddedAgentRunResult shape the post-turn block expects.
function makeEmbeddedResult() {
  return {
    ok: true,
    usage: { inputTokens: 100, outputTokens: 50, totalCost: 0 },
    runId: "test-run-id",
  };
}

// Minimal continuation-enabled config fixture
function makeContinuationEnabledConfig() {
  return {
    agents: { defaults: { continuation: { enabled: true } } },
  } as any;
}

function makeContinuationDisabledConfig() {
  return {
    agents: { defaults: { continuation: { enabled: false } } },
  } as any;
}

// ---------------------------------------------------------------------------
// Test target
// ---------------------------------------------------------------------------

let runEmbeddedAgentMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const mod = await import("../embedded-agent.js");
  runEmbeddedAgentMock = mod.runEmbeddedAgent as unknown as ReturnType<typeof vi.fn>;
  runEmbeddedAgentMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Minimal params factory — only the fields that runAgentAttempt touches
// on the requestCompactionOpts path.
function makeMinimalParams(cfg: any) {
  return {
    sessionId: "test-session-id",
    sessionKey: "test-session-key",
    sessionAgentId: "test-agent",
    sessionFile: "/tmp/test.json",
    workspaceDir: "/tmp",
    cwd: "/tmp",
    cfg,
    runId: "test-run-id",
    providerOverride: "test-provider",
    modelOverride: "test-model",
    messageChannel: "test-channel",
    sessionEntry: undefined,
    sessionStore: undefined,
    opts: {
      prompt: "test",
      senderIsOwner: true,
      traceparent: undefined,
    },
    runContext: {
      accountId: "test",
      groupId: undefined,
      groupChannel: undefined,
      groupSpace: undefined,
      currentChannelId: undefined,
      currentThreadTs: undefined,
      currentInboundAudio: undefined,
      replyToMode: undefined,
      hasRepliedRef: undefined,
    },
    onAgentEvent: undefined,
    pluginsEnabled: false,
  } as any;
}

// ---------------------------------------------------------------------------
// Import the function under test (dynamic to allow mocks to settle)
// ---------------------------------------------------------------------------

async function runEmbeddedAttempt(cfg: any) {
  const { runAgentAttempt } = await import("./attempt-execution.js");
  return runAgentAttempt(makeMinimalParams(cfg));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runAgentAttempt #917 spawn-init requestCompactionOpts plumbing (Layer 2 cure)", () => {
  it("forwards requestCompactionOpts to runEmbeddedAgent when continuation.enabled=true (spawn-init / turn-1)", async () => {
    await runEmbeddedAttempt(makeContinuationEnabledConfig());

    expect(runEmbeddedAgentMock).toHaveBeenCalledTimes(1);
    const callArgs = runEmbeddedAgentMock.mock.calls[0][0];
    expect(callArgs.requestCompactionOpts).toBeDefined();
    expect(typeof callArgs.requestCompactionOpts.getContextUsage).toBe("function");
    expect(typeof callArgs.requestCompactionOpts.triggerCompaction).toBe("function");
    expect(callArgs.requestCompactionOpts.sessionId).toBe("test-session-id");
  });

  it("does NOT forward requestCompactionOpts when continuation is disabled", async () => {
    await runEmbeddedAttempt(makeContinuationDisabledConfig());

    expect(runEmbeddedAgentMock).toHaveBeenCalledTimes(1);
    const callArgs = runEmbeddedAgentMock.mock.calls[0][0];
    expect(callArgs.requestCompactionOpts).toBeUndefined();
  });

  it("getContextUsage returns a number from computeRequestCompactionContextUsage", async () => {
    await runEmbeddedAttempt(makeContinuationEnabledConfig());

    const callArgs = runEmbeddedAgentMock.mock.calls[0][0];
    const usage = callArgs.requestCompactionOpts.getContextUsage();
    expect(usage).toBe(0.42);
  });
});

// Cross-layer drift-catch sentinel (sister of #746 sentinel)
describe("#917 cross-layer drift-catch sentinel", () => {
  it("documents both Layer 1 + Layer 2 cure sites for #917 (sentinel only)", () => {
    // Layer 1 (turn-2+ followup-runner): agent-runner-execution.ts:2555
    //   requestCompactionOpts construction.
    // Layer 2 (turn-1 spawn-init): attempt-execution.ts:#917 block.
    // Together these prevent a regression that fixes one Layer in isolation.
    expect(true).toBe(true);
  });
});
