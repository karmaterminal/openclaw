// Drives a fenced embedded run's terminal fallback, including the
// message-tool-only recovery notice, through the real session store and
// transcript writer after harness-owned finalization fails (#1438).
// Runs in the forked database-worker shard: only a main-thread caller takes the
// worker transcript lock that the Gateway uses.
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getReplyPayloadMetadata } from "../../../auto-reply/reply-payload.js";
import { replaceSessionEntry } from "../../../config/sessions/session-accessor.js";
import { useTempSessionsFixture } from "../../../config/sessions/test-helpers.js";
import { SessionTranscriptWriterClaimReboundError } from "../../../config/sessions/transcript-write-context.js";
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
const NOTICE_TEXT = "I lost that turn before I could answer. Please resend if it still matters.";

type FencedInput = ReturnType<typeof createSettledFinalizationTestInput>;
type FencedAttempt = ReturnType<typeof makeEmbeddedRunnerAttempt>;

describe("fenced settled-turn fallback through the real transcript writer", () => {
  const fixture = useTempSessionsFixture("settled-finalization-fenced-");
  let admission: ReturnType<typeof prepareSystemAgentRunAdmission>;

  beforeEach(() => {
    admission = prepareSystemAgentRunAdmission({}, "run-settled", "main", "fenced-fallback");
  });
  afterEach(() => admission.close());

  async function prepareFencedRun(configure: (input: FencedInput, attempt: FencedAttempt) => void) {
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
    configure(input, attempt);
    const appendedTranscript = async () =>
      (await readVisibleSessionTranscriptMessageEntries(target)).slice(prefix.length);
    return { input, target, appendedTranscript };
  }

  it("persists and returns the fallback when the run still owns the writer claim", async () => {
    const { input, appendedTranscript } = await prepareFencedRun((run) => {
      run.terminalBase.runParams.sourceReplyDeliveryMode = "automatic";
    });

    const result = await prepareTerminalWithSettledTurnFinalization(input);

    expect(result.prepared.payloadsWithToolMedia).toEqual([
      expect.objectContaining({ text: FALLBACK_TEXT }),
    ]);
    expect(result.attempt.assistantTranscriptOwned).toBe(true);
    expect(await appendedTranscript()).toMatchObject([
      { message: { role: "assistant", content: [{ type: "text", text: FALLBACK_TEXT }] } },
    ]);
  });

  describe("message-tool-only recovery notice", () => {
    it("delivers one fixed notice across source suppression under the run's writer authority", async () => {
      const { input, target, appendedTranscript } = await prepareFencedRun(() => {});

      const result = await prepareTerminalWithSettledTurnFinalization(input);

      expect(result.prepared.payloadsWithToolMedia).toEqual([
        expect.objectContaining({ text: NOTICE_TEXT }),
      ]);
      expect(getReplyPayloadMetadata(result.prepared.payloadsWithToolMedia![0]!)).toMatchObject({
        deliverDespiteSourceReplySuppression: true,
        sessionWriterDeliveryAuthority: {
          expectedSessionId: target.sessionId,
          expectedLifecycleRevision: "revision-a",
          expectedWriterRunId: "run-settled",
          sessionKey: target.sessionKey,
        },
      });
      // The notice is host text, never an undelivered model answer to recover.
      expect(result.prepared.finalAssistantVisibleText).toBe("");
      expect(result.attempt.assistantTranscriptIdempotencyKey).toBe(
        "run-settled:settled-finalization-fallback",
      );
      expect(await appendedTranscript()).toMatchObject([
        { message: { role: "assistant", content: [{ type: "text", text: NOTICE_TEXT }] } },
      ]);
    });

    it("records the notice once when the same run settles twice", async () => {
      const { input, appendedTranscript } = await prepareFencedRun(() => {});

      await prepareTerminalWithSettledTurnFinalization(input);
      await prepareTerminalWithSettledTurnFinalization(input);

      expect(await appendedTranscript()).toMatchObject([
        { message: { role: "assistant", content: [{ type: "text", text: NOTICE_TEXT }] } },
      ]);
    });

    it.each([
      {
        name: "the seat opted out",
        configure: (input: FencedInput) => {
          input.finalization.preparedAttempt.config = {
            agents: { defaults: { settledTurnFallbackNotice: false } },
          };
        },
      },
      {
        name: "a heartbeat turn",
        configure: (input: FencedInput) => {
          input.terminalBase.runParams.trigger = "heartbeat";
        },
      },
      {
        name: "an internal system turn",
        configure: (input: FencedInput) => {
          input.terminalBase.runParams.inputProvenance = {
            kind: "internal_system",
            sourceTool: "main_session_restart_recovery",
          };
        },
      },
      {
        name: "an ambient room event",
        configure: (input: FencedInput) => {
          input.terminalBase.runParams.currentInboundEventKind = "room_event";
        },
      },
      {
        name: "a turn whose model already used the message tool",
        configure: (_input: FencedInput, attempt: FencedAttempt) => {
          attempt.didSendViaMessagingTool = true;
        },
      },
    ])("keeps the fallback private for $name", async ({ configure }) => {
      const { input, appendedTranscript } = await prepareFencedRun(configure);

      const result = await prepareTerminalWithSettledTurnFinalization(input);

      expect(result.prepared.payloadsWithToolMedia).toEqual([
        expect.objectContaining({ text: FALLBACK_TEXT }),
      ]);
      expect(
        getReplyPayloadMetadata(result.prepared.payloadsWithToolMedia![0]!)
          ?.deliverDespiteSourceReplySuppression,
      ).toBeUndefined();
      expect(await appendedTranscript()).toMatchObject([
        { message: { content: [{ type: "text", text: FALLBACK_TEXT }] } },
      ]);
    });

    it("sends nothing when the source reply was already delivered", async () => {
      const { input, appendedTranscript } = await prepareFencedRun((run) => {
        run.terminalBase.runParams.resolveReplyDelivery = async () => "delivered";
      });

      const result = await prepareTerminalWithSettledTurnFinalization(input);

      expect(result.prepared.payloadsWithToolMedia ?? []).toEqual([]);
      expect(await appendedTranscript()).toEqual([]);
    });

    it("sends nothing when the run is cancelled during finalization", async () => {
      const controller = new AbortController();
      const { input, appendedTranscript } = await prepareFencedRun((run) => {
        run.finalization.abortSignal = controller.signal;
        run.finalization.harness.finalizeSettledTurn = vi.fn(async () => {
          controller.abort(new Error("cancelled by user"));
          throw new Error("finalization cancelled");
        });
      });

      const result = await prepareTerminalWithSettledTurnFinalization(input);

      expect(result.finalizationOutcome).toBe("failed");
      expect(result.prepared.payloadsWithToolMedia ?? []).not.toContainEqual(
        expect.objectContaining({ text: NOTICE_TEXT }),
      );
      expect(await appendedTranscript()).toEqual([]);
    });

    it("sends nothing after another run rebinds the session writer", async () => {
      const { input, target, appendedTranscript } = await prepareFencedRun(() => {});
      await replaceSessionEntry(target, {
        sessionId: target.sessionId,
        updatedAt: 2,
        lifecycleRevision: "revision-a",
        activeWriterRunId: "replacement-run",
      });

      await expect(prepareTerminalWithSettledTurnFinalization(input)).rejects.toBeInstanceOf(
        SessionTranscriptWriterClaimReboundError,
      );
      expect(await appendedTranscript()).toEqual([]);
    });
  });
});
