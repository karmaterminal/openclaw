// Echo surfaces never carry sovereign text (#1321, design § 5.4). A real render registers
// its instances; each write point then hands out a copy with slot-and-digest markers.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../test/helpers/temp-dir.js";
import type { OpenClawConfig } from "../../config/types.js";
import {
  getSecretRedactionRegistryRevision,
  hasRegisteredSecretValuesForRedaction,
} from "../../logging/secret-redaction-registry.js";
import { resetSovereignRedactionForTests } from "../../logging/sovereign-redaction.js";
import * as runtimeStoreWriter from "../../trajectory/runtime-store-writer.js";
import { createTrajectoryRuntimeRecorder } from "../../trajectory/runtime.js";
import { redactAgentDiagnosticPayload } from "../diagnostic-redaction.js";
import { observeEmbeddedAttemptPrompt } from "../embedded-agent-runner/run/attempt-prompt-support.js";
import { runBeforeAgentRunGate } from "../harness/before-agent-run.js";
import { runAgentHarnessLlmInputHook } from "../harness/lifecycle-hook-helpers.js";
import { buildConfiguredAgentSystemPrompt } from "../system-prompt-config.js";
import { resetSovereignPromptRuntimeForTests } from "./runtime.js";
import {
  expectNoSentinelFilesSince,
  SENTINEL,
  sovereignAgentsConfig,
  writeAgentGeneration,
} from "./sovereign-fixture.test-support.js";

const startedAt = Date.now();
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
afterAll(() => expectNoSentinelFilesSince(startedAt));
afterEach(() => {
  vi.restoreAllMocks();
  resetSovereignPromptRuntimeForTests();
  resetSovereignRedactionForTests();
});

const MARKER = /<!-- openclaw:sovereign identity\/opening sha256:[0-9a-f]{12} bytes:\d+ -->/;
let prompt = "";

beforeEach(async () => {
  const agentDir = tempDirs.make("openclaw-sovereign-echo-");
  writeAgentGeneration(agentDir, "main");
  const config = sovereignAgentsConfig({ main: { agentDir, mode: "enforce" } }) as OpenClawConfig;
  prompt = await buildConfiguredAgentSystemPrompt({
    config,
    agentId: "main",
    workspaceDir: "/openclaw-sovereign-fixture/workspace",
    toolNames: ["exec"],
  });
  expect(prompt).toContain(SENTINEL);
});

/** The plugin's view: markers in place of each span, code text around them unchanged. */
function expectMarkedCopy(seen: unknown) {
  expect(typeof seen).toBe("string");
  expect(seen).not.toContain(SENTINEL);
  expect(seen).toMatch(MARKER);
  expect(seen).toContain("## Tool Call Style\n<!-- openclaw:sovereign tool/call-style sha256:");
}

describe.skipIf(process.platform === "win32")("sovereign echo surfaces", () => {
  it("llm_input (embedded and harness) and before_agent_run hand plugins marked copies", async () => {
    const llmInput = vi.fn(async (_event: { systemPrompt?: string }) => {});
    observeEmbeddedAttemptPrompt({
      attempt: {
        modelId: "model-1",
        provider: "provider-1",
        runId: "run-1",
        sessionId: "session-1",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp/workspace",
      },
      cacheTrace: null,
      contextTokenBudget: 32_000,
      diagnosticTrace: { traceId: "1".repeat(32), spanId: "2".repeat(16) },
      effectivePrompt: "hello",
      effectiveTools: [],
      hookAgentId: "main",
      hookMessagesForCurrentPrompt: [],
      hookRunner: { hasHooks: () => true, runLlmInput: llmInput },
      imageCount: 0,
      isRawModelRun: false,
      llmBoundaryPromptForPrecheck: "hello",
      promptForModel: "hello",
      reserveTokens: 0,
      runTrace: { traceId: "1".repeat(32), spanId: "3".repeat(16) },
      sessionMessages: [],
      skipPromptSubmission: false,
      streamStrategy: "provider-stream",
      systemPromptForHook: prompt,
      systemPromptText: prompt,
      toolSearchCompacted: false,
      tools: [],
      trajectoryRecorder: null,
      transcriptLeafId: null,
      transport: "sse",
      uncompactedEffectiveTools: [],
    });
    expectMarkedCopy(llmInput.mock.calls[0]?.[0].systemPrompt);

    const harnessLlmInput = vi.fn(async (_event: { systemPrompt?: string }) => {});
    const event = {
      runId: "run-1",
      sessionId: "session-1",
      provider: "codex",
      model: "gpt-fixture",
      systemPrompt: prompt,
      prompt: "hello",
      historyMessages: [],
      imagesCount: 0,
    };
    runAgentHarnessLlmInputHook({
      event,
      ctx: { runId: "run-1", agentId: "main" },
      hookRunner: { hasHooks: () => true, runLlmInput: harnessLlmInput } as never,
    });
    expectMarkedCopy(harnessLlmInput.mock.calls[0]?.[0].systemPrompt);
    // The caller's own event, which the model call still uses, is untouched.
    expect(event.systemPrompt).toBe(prompt);

    const beforeAgentRun = vi.fn(async (_event: { systemPrompt?: string }) => undefined);
    await runBeforeAgentRunGate(
      { hasHooks: () => true, runBeforeAgentRun: beforeAgentRun },
      { prompt: "hello", messages: [], systemPrompt: prompt },
      { runId: "run-1", agentId: "main" },
    );
    expectMarkedCopy(beforeAgentRun.mock.calls[0]?.[0].systemPrompt);
  });

  it("the trajectory sink and diagnostic payloads hold markers; the secret registry is untouched", async () => {
    const secretRevision = getSecretRedactionRegistryRevision();
    const lines: string[] = [];
    vi.spyOn(runtimeStoreWriter, "createSqliteTrajectoryRuntimeSink").mockResolvedValueOnce({
      write: (_event, line) => lines.push(line),
      flush: async () => {},
      describeFlushState: () => undefined,
    });
    const recorder = await createTrajectoryRuntimeRecorder({
      sessionId: "session-1",
      sessionFile: "/tmp/session.jsonl",
      env: { OPENCLAW_TRAJECTORY: "1" },
    });
    // A provider SDK error is a class instance whose message and body echo the request; a
    // payload can also reference one object twice. Sinks project both to plain data.
    const providerError = () =>
      Object.assign(new Error(`request rejected: ${prompt}`), { body: { system: prompt } });
    const shared = { system: prompt };
    recorder?.recordEvent("context.compiled", { systemPrompt: prompt, messages: [{ prompt }] });
    recorder?.recordEvent("model.failed", {
      error: providerError(),
      first: shared,
      second: shared,
    });
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).not.toContain(SENTINEL);
      expect(line).toMatch(MARKER);
    }

    const diagnostic = JSON.stringify(
      redactAgentDiagnosticPayload({
        system: prompt,
        error: providerError(),
        first: shared,
        second: shared,
      }),
    );
    expect(diagnostic).not.toContain(SENTINEL);
    expect(diagnostic).toMatch(MARKER);
    // Sovereign instances never enter, or evict from, the credential registry.
    expect(getSecretRedactionRegistryRevision()).toBe(secretRevision);
    expect(hasRegisteredSecretValuesForRedaction()).toBe(false);
  });
});
