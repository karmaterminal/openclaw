// Owner-boundary fossil: an empty Codex answer, the host's visible-answer retry,
// a tool in the retried native turn, then settled-turn finalization. Only the
// native app-server wire and the bounded finalizer model call are synthetic;
// capture, mirror, SQLite projection, and the registered harness finalizer are real.
import path from "node:path";
import {
  embeddedAgentLog,
  type EmbeddedRunAttemptParamsV2 as EmbeddedRunAttemptParams,
} from "openclaw/plugin-sdk/agent-harness-runtime";
import { createTestPluginApi } from "openclaw/plugin-sdk/plugin-test-api";
import { createPluginRuntimeMock } from "openclaw/plugin-sdk/plugin-test-runtime";
import { expect, it, vi } from "vitest";
import plugin from "../../index.js";
import * as boundedTurn from "./bounded-turn.js";
import type { JsonObject } from "./protocol.js";
import {
  createCodexRuntimePlanFixture,
  createParams,
  createStartedThreadHarness,
  runCodexAppServerAttempt,
  setupRunAttemptTestHooks,
  tempDir,
  threadStartResult,
  turnStartResult,
} from "./run-attempt-test-harness.js";
import { CodexSettledTurnContext } from "./settled-turn-context.js";
import {
  attachSqliteSessionTarget,
  readTranscriptMessagesByIdentity,
} from "./sqlite-session.test-helpers.js";

setupRunAttemptTestHooks();

const THREAD_ID = "thread-1";
const ORIGINAL_REQUEST = "Send the amber inventory update to Alice, then confirm it was sent.";
// The host's empty-response retry prompt (incomplete-turn-recovery.ts), activated
// through activateInternalPrompt, which also sets suppressNextUserMessagePersistence.
const EMPTY_RESPONSE_RETRY_PROMPT =
  "The previous attempt did not produce a user-visible answer. Continue from the current state and produce the visible answer now. Do not restart from scratch.";
// The host's settled-tool finalization request (incomplete-turn-recovery.ts).
const SETTLED_FINALIZATION_PROMPT =
  "The previous assistant turn completed its tool calls but did not produce a user-visible answer. Continue from the current transcript and produce the final user-visible answer now. Do not repeat completed tool calls or restart from scratch. Tools are unavailable in this step: it is a text-only pass, so reply with plain text and do not attempt any tool call.";
const FINAL_ANSWER = "Sent the amber inventory update to Alice.";

const emptyAnswer = (id: string): JsonObject => ({ type: "agentMessage", id, text: "" });
const sendCommand = (workspaceDir: string, status: "inProgress" | "completed"): JsonObject => ({
  type: "commandExecution",
  id: "send-update",
  command: "echo sent-to-alice",
  cwd: workspaceDir,
  processId: status === "completed" ? 42 : null,
  source: "agent",
  status,
  commandActions: [],
  aggregatedOutput: status === "completed" ? "sent-to-alice\n" : null,
  exitCode: status === "completed" ? 0 : null,
  durationMs: status === "completed" ? 12 : null,
});

it.each([
  {
    label: "the empty-response visible-answer continuation",
    // Same run: the host retries the admitted request with an internal prompt.
    followUp: {
      runId: "run-1",
      prompt: EMPTY_RESPONSE_RETRY_PROMPT,
      suppressNextUserMessagePersistence: true,
    },
    // Internal control prompts are model-only context, never user transcript turns.
    expectedUserTurns: [ORIGINAL_REQUEST],
  },
  {
    label: "an ordinary follow-up user turn (control)",
    followUp: {
      runId: "run-2",
      prompt: "Check that Alice received the amber inventory update.",
      suppressNextUserMessagePersistence: false,
    },
    expectedUserTurns: [ORIGINAL_REQUEST, "Check that Alice received the amber inventory update."],
  },
])(
  "finalizes a settled tool turn on the same native thread after $label",
  async ({ followUp, expectedUserTurns }) => {
    const sessionFile = path.join(tempDir, "empty-retry-session.jsonl");
    const workspaceDir = path.join(tempDir, "empty-retry-workspace");
    const storePath = path.join(tempDir, "empty-retry.sqlite");
    let nativeTurns = 0;
    const harness = createStartedThreadHarness(
      async (method) => {
        if (method === "thread/resume") {
          return threadStartResult(THREAD_ID);
        }
        if (method === "turn/start") {
          return turnStartResult(`turn-${++nativeTurns}`);
        }
        return undefined;
      },
      { persistedThreads: [] },
    );
    const warn = vi.spyOn(embeddedAgentLog, "warn").mockImplementation(() => undefined);
    const runBounded = vi.spyOn(boundedTurn, "runBoundedCodexAppServerTurn").mockResolvedValue({
      text: FINAL_ANSWER,
      items: [],
      model: "synthetic-finalizer-model",
      nativeSelection: { model: "synthetic-finalizer-model", modelProvider: "openai" },
      managedHooksEnabled: false,
    });

    // Turn 1: the admitted request; the model stops with an empty answer and no tools.
    const first = createParams(sessionFile, workspaceDir, { prompt: ORIGINAL_REQUEST });
    await attachSqliteSessionTarget(first, storePath, "session-1");
    const firstRun = runCodexAppServerAttempt(first);
    await firstRun.waitForTurnAccepted();
    // Native events arrive in wire order; local projection must not delay terminal receipt.
    await Promise.all([
      harness.notify(nativeItem("item/started", "turn-1", emptyAnswer("empty-1"))),
      harness.notify(nativeItem("item/completed", "turn-1", emptyAnswer("empty-1"))),
      harness.completeTurn({ threadId: THREAD_ID, turnId: "turn-1" }),
    ]);
    const firstResult = await firstRun;
    expect(firstResult.terminal).toEqual({ kind: "ok" });
    expect(firstResult.assistantTexts.every((text) => !text.trim())).toBe(true);
    expect(firstResult.currentAttemptAssistant?.stopReason).toBe("stop");
    expect(firstResult.toolMetas).toEqual([]);
    expect(firstResult.settledTurnFinalizationContext).toBeUndefined();

    // Turn 2 on the same native thread: one completed tool, then another empty answer.
    const second = createParams(sessionFile, workspaceDir, followUp);
    second.sessionTarget = first.sessionTarget;
    second.suppressNextUserMessagePersistence = followUp.suppressNextUserMessagePersistence;
    const secondRun = runCodexAppServerAttempt(second);
    await secondRun.waitForTurnAccepted();
    await Promise.all([
      harness.notify(nativeItem("item/started", "turn-2", sendCommand(workspaceDir, "inProgress"))),
      harness.notify(
        nativeItem("item/completed", "turn-2", sendCommand(workspaceDir, "completed")),
      ),
      harness.notify(nativeItem("item/started", "turn-2", emptyAnswer("empty-2"))),
      harness.notify(nativeItem("item/completed", "turn-2", emptyAnswer("empty-2"))),
      harness.completeTurn({ threadId: THREAD_ID, turnId: "turn-2" }),
    ]);
    const settled = await secondRun;
    expect(settled.terminal).toEqual({ kind: "ok" });
    expect(settled.assistantTexts.every((text) => !text.trim())).toBe(true);
    expect(settled.replayMetadata).toMatchObject({ hadPotentialSideEffects: true });

    // The host hands the settled attempt to the registered harness finalizer.
    const registerAgentHarness =
      vi.fn<ReturnType<typeof createTestPluginApi>["registerAgentHarness"]>();
    plugin.register(
      createTestPluginApi({
        id: "codex",
        runtime: createPluginRuntimeMock(),
        registerAgentHarness,
      }),
    );
    const codexHarness = registerAgentHarness.mock.calls[0]![0];
    const finalizationAttempt: EmbeddedRunAttemptParams = {
      ...second,
      prompt: SETTLED_FINALIZATION_PROMPT,
      runtimePlan: {
        ...createCodexRuntimePlanFixture(),
        auth: {
          providerForAuth: "openai",
          authProfileProviderForAuth: "openai",
          modelRoute: {
            provider: "openai",
            modelId: second.modelId,
            api: "openai-responses",
            baseUrl: "https://api.openai.com/v1",
            authRequirement: "api-key",
            requestTransportOverrides: "none",
          },
        },
      },
      resolvedApiKey: "synthetic-finalizer-key",
      authProfileStore: { version: 1, profiles: {} },
      timeoutMs: 60_000,
    };
    const finalization = await codexHarness.finalizeSettledTurn!({
      attempt: finalizationAttempt,
      settledAttempt: settled,
    }).then(
      (result) => ({ answer: readAssistantText(result.assistant) }),
      (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }),
    );

    const warnings = (message: string) =>
      warn.mock.calls.flatMap(([logged, meta]) => (logged === message ? [meta] : []));
    // One observation keeps the whole recovery chain in a RED diff.
    expect({
      captureFailures: warnings("codex settled-turn finalization context capture failed"),
      unavailable: warnings("codex settled-turn finalization context is unavailable").map(
        (meta) => ({ turnId: (meta as JsonObject).turnId, reason: (meta as JsonObject).reason }),
      ),
      contextSource: settled.settledTurnFinalizationContext?.source,
      finalization,
      boundedFinalizerTurns: runBounded.mock.calls.length,
      // Recovery never starts another native turn, so the tool cannot run twice.
      nativeTurnStarts: harness.requests.filter(({ method }) => method === "turn/start").length,
    }).toEqual({
      captureFailures: [],
      unavailable: [],
      contextSource: "harness",
      finalization: { answer: FINAL_ANSWER },
      boundedFinalizerTurns: 1,
      nativeTurnStarts: 2,
    });

    const context = settled.settledTurnFinalizationContext;
    if (!(context instanceof CodexSettledTurnContext)) {
      throw new Error("Expected verified settled-turn evidence from the harness");
    }
    // The evidence carries the admitted request and the completed tool exactly once.
    expect(JSON.stringify(context.data)).toContain(ORIGINAL_REQUEST);
    expect(context.data.filter((item) => readItemType(item) === "function_call")).toHaveLength(1);
    expect(context.data.at(-1)).toEqual({
      type: "function_call_output",
      call_id: "send-update",
      output: "sent-to-alice\n",
    });
    expect(runBounded).toHaveBeenCalledWith(
      expect.objectContaining({ historyItems: context.data, requireNoExternalCapabilities: true }),
    );
    const transcript = await readTranscriptMessagesByIdentity(second);
    expect(transcript.filter((message) => message.role === "user").map(readTextContent)).toEqual(
      expectedUserTurns,
    );
    expect(
      transcript.filter((message) => message.role === "toolResult").map(readTextContent),
    ).toEqual(["sent-to-alice\n"]);
    expect(transcript.at(-1)).toMatchObject({ role: "assistant" });
    expect(readTextContent(transcript.at(-1)!)).toBe(FINAL_ANSWER);
  },
);

function nativeItem(
  method: "item/started" | "item/completed",
  turnId: string,
  item: JsonObject,
): { method: "item/started" | "item/completed"; params: JsonObject } {
  return { method, params: { threadId: THREAD_ID, turnId, item } };
}

function readItemType(item: unknown): unknown {
  return item !== null && typeof item === "object" && "type" in item ? item.type : undefined;
}

function readAssistantText(message: unknown): string {
  return message !== null && typeof message === "object"
    ? readTextContent(message as Record<string, unknown>)
    : "";
}

function readTextContent(message: Record<string, unknown>): string {
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content)
    ? content
        .flatMap((part: unknown) =>
          part !== null &&
          typeof part === "object" &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string"
            ? [part.text]
            : [],
        )
        .join("")
    : "";
}
