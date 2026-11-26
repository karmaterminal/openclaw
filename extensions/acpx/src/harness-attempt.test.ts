import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentHarnessAttemptParamsV2 } from "openclaw/plugin-sdk/agent-harness-runtime";
import { SessionManager } from "openclaw/plugin-sdk/agent-sessions";
import { runInHarnessToolAuthorityForTest } from "openclaw/plugin-sdk/plugin-test-runtime";
import type * as TranscriptRuntime from "openclaw/plugin-sdk/session-transcript-runtime";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { AcpRuntimeTurnInput } from "../runtime-api.js";
import { runAcpHarnessAttempt } from "./harness-attempt.js";
import type { CompleteAcpRuntime } from "./runtime-proxy.js";

// mock-isolation: the native ACP session owns history; this file pins the turn text it is sent.
vi.mock("openclaw/plugin-sdk/session-transcript-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof TranscriptRuntime>()),
  appendSessionTranscriptMessageByIdentityStrict: async (params: { message: unknown }) => ({
    kind: "result",
    result: { message: params.message, anchor: { entryId: "assistant-entry" } },
  }),
}));
vi.spyOn(SessionManager, "openModelContextAsync").mockImplementation(async () =>
  SessionManager.inMemory(),
);

let workspace: string;
beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "acpx-harness-attempt-"));
  await writeFile(join(workspace, "SOUL.md"), "Speak like a patient astronomer.");
});
afterAll(() => rm(workspace, { recursive: true, force: true }));

async function runFirstTurn(config: AgentHarnessAttemptParamsV2["config"]) {
  const sent: string[] = [];
  const runtime = {
    ensureSession: async () => ({ sessionKey: "native", backend: "acpx", runtimeSessionName: "n" }),
    getStatus: async () => ({ models: { currentModelId: "fixture-model" } }),
    startTurn: (turn: AcpRuntimeTurnInput) => {
      sent.push(turn.text);
      return {
        promptStarted: Promise.resolve(),
        events: (async function* () {
          yield { type: "text_delta" as const, stream: "output" as const, text: "done" };
        })(),
        result: Promise.resolve({ status: "completed" as const }),
        cancel: async () => {},
        closeStream: async () => {},
      };
    },
  } as unknown as CompleteAcpRuntime;
  const input = {
    agentId: "main",
    sessionKey: "agent:main:main",
    sessionId: "acp-session",
    runId: "acp-run",
    prompt: "hello",
    provider: "acp-pi",
    modelId: "fixture-model",
    model: { api: "openai-responses", contextWindow: 128_000 },
    timeoutMs: 10_000,
    workspaceDir: workspace,
    config,
    userTurnTranscriptRecorder: {
      hasPersisted: () => true,
      isBlocked: () => false,
      getAdmissionReceipt: () => ({ entryId: "user-entry" }),
      persistApproved: async () => {},
    },
    hostCapabilities: { assertActive: () => {} },
  } as unknown as AgentHarnessAttemptParamsV2;
  const result = await runInHarnessToolAuthorityForTest(input, "acpx", (admitted) =>
    runAcpHarnessAttempt({
      input: admitted as AgentHarnessAttemptParamsV2,
      runtime,
      agent: "pi",
      harnessId: "acp-pi",
      label: "Pi",
      command: ["pi"],
      generationSignal: new AbortController().signal,
    }),
  );
  expect(result.terminal).toEqual({ kind: "ok" });
  return sent[0] ?? "";
}

// ACP agents never get the continuation tools; the reply runner parses the bracket tokens.
it.each([true, false])(
  "teaches the bracket-form continuation guide with the first turn (enabled: %s)",
  async (enabled) => {
    const text = await runFirstTurn({ agents: { defaults: { continuation: { enabled } } } });
    expect(text).toContain("Speak like a patient astronomer.");
    expect(text.includes("End your response with CONTINUE_WORK")).toBe(enabled);
    expect(text.includes("[[CONTINUE_DELEGATE: task description]]")).toBe(enabled);
  },
);
