// Drives a fenced embedded run's terminal fallback through the real session
// store and transcript writer after harness-owned finalization fails (#1438).
// Runs in the forked database-worker shard: only a main-thread caller takes the
// worker transcript lock that the Gateway uses.
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replaceSessionEntry } from "../../../config/sessions/session-accessor.js";
import { useTempSessionsFixture } from "../../../config/sessions/test-helpers.js";
import {
  appendSessionTranscriptMessageByIdentity,
  readVisibleSessionTranscriptMessageEntries,
} from "../../../plugin-sdk/session-transcript-runtime.js";
import { prepareSystemAgentRunAdmission } from "../../admitted-run-context.js";
import {
  buildEmbeddedRunnerAssistant,
  createResolvedEmbeddedRunnerModel,
  makeEmbeddedRunnerAttempt,
} from "../../test-helpers/embedded-agent-runner-e2e-fixtures.js";
import { prepareTerminalWithSettledTurnFinalization } from "./settled-turn-finalization.js";
import { createSettledFinalizationTestInput } from "./settled-turn-finalization.test-support.js";

const FALLBACK_TEXT =
  "The tool run finished, but no final summary was produced. I did not repeat any completed actions.";

describe("fenced settled-turn fallback through the real transcript writer", () => {
  const fixture = useTempSessionsFixture("settled-finalization-fenced-");
  let admission: ReturnType<typeof prepareSystemAgentRunAdmission>;

  beforeEach(() => {
    admission = prepareSystemAgentRunAdmission({}, "run-settled", "main", "fenced-fallback");
  });
  afterEach(() => admission.close());

  it("persists and returns the fallback when the run still owns the writer claim", async () => {
    const admittedRunContext = await admission.admit("embedded");
    const toolCall = buildEmbeddedRunnerAssistant({
      provider: "openai",
      model: "gpt-5.6-sol",
      stopReason: "toolUse",
      content: [{ type: "toolCall", id: "completed-read", name: "read", arguments: {} }],
    });
    const messages = [
      { role: "user" as const, content: "Look at this and summarize.", timestamp: 1 },
      toolCall,
      {
        role: "toolResult" as const,
        toolCallId: "completed-read",
        toolName: "read",
        content: [{ type: "text" as const, text: "read-once" }],
        isError: false,
        timestamp: 3,
      },
    ];
    const attempt = makeEmbeddedRunnerAttempt({
      sessionIdUsed: "session-settled",
      assistantTexts: [],
      lastAssistant: toolCall,
      currentAttemptAssistant: toolCall,
      currentAttemptCompletedAssistant: undefined,
      messagesSnapshot: messages,
      toolMetas: [{ toolName: "read", toolCallId: "completed-read", replaySafe: true }],
      itemLifecycle: { startedCount: 1, completedCount: 1, activeCount: 0 },
    });
    attempt.settledTurnFinalizationContext = Object.freeze({ source: "unavailable" });
    const storePath = path.join(fs.realpathSync(fixture.sessionsDir()), "sessions.json");
    const target = {
      agentId: "main",
      sessionId: "session-settled",
      sessionKey: "agent:main:discord:channel:1466192485440164011",
      storePath,
    };
    // The admitted run is still the session's active writer: nothing rebound it.
    await replaceSessionEntry(target, {
      sessionId: target.sessionId,
      updatedAt: 1,
      lifecycleRevision: "revision-a",
      activeWriterRunId: "run-settled",
    });
    const fencedTarget = {
      ...target,
      expectedLifecycleRevision: "revision-a",
      expectedWriterRunId: "run-settled",
    };
    for (const message of messages) {
      await appendSessionTranscriptMessageByIdentity({ ...fencedTarget, message });
    }
    const prefix = await readVisibleSessionTranscriptMessageEntries(target);
    const input = createSettledFinalizationTestInput(attempt, admittedRunContext);
    input.terminalBase.runParams.trigger = "user";
    input.terminalBase.runParams.sourceReplyDeliveryMode = "automatic";
    input.terminalBase.runParams.sessionKey = target.sessionKey;
    Object.assign(
      input.finalization.preparedAttempt,
      createResolvedEmbeddedRunnerModel("openai", "gpt-5.6-sol"),
      {
        provider: "openai",
        modelId: "gpt-5.6-sol",
        agentId: "main",
        sessionKey: target.sessionKey,
        sessionTarget: fencedTarget,
        authProfileStore: { version: 1, profiles: {} },
        resolvedApiKey: "synthetic-unused-host-key",
      },
    );
    input.finalization.harness.finalizeSettledTurn = vi.fn(async () => {
      throw new Error("Codex settled-turn finalization context is unavailable");
    });

    const result = await prepareTerminalWithSettledTurnFinalization(input);

    expect(result.prepared.payloadsWithToolMedia).toEqual([
      expect.objectContaining({ text: FALLBACK_TEXT }),
    ]);
    expect(result.attempt.assistantTranscriptOwned).toBe(true);
    const transcript = await readVisibleSessionTranscriptMessageEntries(target);
    expect(transcript.slice(prefix.length)).toMatchObject([
      { message: { role: "assistant", content: [{ type: "text", text: FALLBACK_TEXT }] } },
    ]);
  });
});
