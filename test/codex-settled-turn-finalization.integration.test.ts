import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCodexSettledFinalizerTestFixture } from "../extensions/codex/test-api.js";
import {
  prepareSystemAgentRunAdmission,
  type AdmittedRunContext,
} from "../src/agents/admitted-run-context.js";
import {
  normalizeAgentRunAttemptTerminal,
  projectAgentRunAttemptTerminal,
} from "../src/agents/agent-run-terminal-outcome.js";
import { log as embeddedRunLog } from "../src/agents/embedded-agent-runner/logger.js";
import { resolveReplayInvalidFlag } from "../src/agents/embedded-agent-runner/run/incomplete-turn-resolution.js";
import { prepareTerminalWithSettledTurnFinalization } from "../src/agents/embedded-agent-runner/run/settled-turn-finalization.js";
import { createSettledFinalizationTestInput } from "../src/agents/embedded-agent-runner/run/settled-turn-finalization.test-support.js";
import { isEmbeddedRunTerminalTimeout } from "../src/agents/embedded-agent-runner/run/terminal-outcome.js";
import { resolveEmbeddedRunTerminal } from "../src/agents/embedded-agent-runner/run/terminal-resolution.js";
import { makeTerminalInput } from "../src/agents/embedded-agent-runner/run/terminal-resolution.test-support.js";
import { resolveEmbeddedRunTerminalTimeout } from "../src/agents/embedded-agent-runner/run/terminal-timeout.js";

const { createCodexSettledFinalizerTestFixture, registerCodexEventProjectorTestLifecycle } =
  await loadCodexSettledFinalizerTestFixture();

registerCodexEventProjectorTestLifecycle();

describe("registered Codex finalizer host silence contract", () => {
  let admission: ReturnType<typeof prepareSystemAgentRunAdmission>;
  let admittedRunContext: AdmittedRunContext;
  let fixture: Awaited<ReturnType<typeof createCodexSettledFinalizerTestFixture>>;

  beforeEach(async () => {
    admission = prepareSystemAgentRunAdmission({}, "run-settled", "main", "codex-finalizer-test");
    admittedRunContext = await admission.admit("embedded");
  });

  afterEach(() => admission.close());

  async function createInput(
    options: Parameters<typeof createCodexSettledFinalizerTestFixture>[0] & {
      timedOut?: boolean;
    } = {},
  ) {
    fixture = await createCodexSettledFinalizerTestFixture(options);
    const { attempt, params } = fixture;
    if (options.timedOut) {
      // Deadline ownership follows native projection; a timeout must block finalization.
      attempt.terminal = normalizeAgentRunAttemptTerminal({
        ...projectAgentRunAttemptTerminal(attempt.terminal),
        timedOut: true,
      });
    }
    const input = createSettledFinalizationTestInput(attempt, admittedRunContext);
    input.finalization.harness = fixture.harness;
    input.finalization.preparedAttempt = { ...input.finalization.preparedAttempt, ...params };
    input.finalization.modelApi = params.model.api;
    input.terminalBase.provider = params.provider;
    input.terminalBase.model = params.modelId;
    input.terminalBase.activeErrorContext = { provider: params.provider, model: params.modelId };
    Object.assign(input.terminalBase.runParams, {
      trigger: "heartbeat",
      terminalReplyExpectation: "required",
      sourceReplyDeliveryMode: "automatic",
    });
    return input;
  }

  function returnBoundedText(text: string) {
    const result = {
      text,
      items: [],
      submittedInput: [{ type: "text" as const, text: fixture.params.prompt, text_elements: [] }],
      model: "synthetic-finalizer-model",
      nativeSelection: { model: "synthetic-finalizer-model", modelProvider: "openai" },
      managedHooksEnabled: false,
    };
    fixture.runBounded.mockResolvedValue(result);
    return result;
  }

  it.each([
    { text: " NO_REPLY\n", expectation: "required", calls: 1 },
    { text: "NO_REPLY", expectation: "required", calls: 1 },
    { text: "NO_REPLY", expectation: "result-required", calls: 2 },
    { text: " ", expectation: "required", calls: 2 },
    { text: undefined, expectation: "optional", calls: 0 },
  ] as const)(
    "preserves the provider failure after $expectation $text output",
    async ({ text, expectation, calls }) => {
      const input = await createInput();
      const runAttempt = vi.spyOn(input.finalization.harness, "runAttempt");
      input.terminalBase.runParams.terminalReplyExpectation = expectation;
      if (text !== undefined) {
        returnBoundedText(text);
      }
      const result = await prepareTerminalWithSettledTurnFinalization(input);
      expect(fixture.runBounded).toHaveBeenCalledTimes(calls);
      expect(result.finalizationOutcome).toBe(calls === 0 ? "not-attempted" : "failed");
      expect(result.attempt).toBe(input.initial.attempt);
      expect(result.terminalState).toBe(input.initial.terminalState);
      expect(result.attempt.terminal).toMatchObject({ kind: "failed" });
      expect(result.terminalState.outcome.error).toContain("Provider overloaded");
      if (calls === 0) {
        expect(runAttempt).not.toHaveBeenCalled();
        expect(fixture.mirror).not.toHaveBeenCalled();
        return;
      }
      expect(fixture.runBounded).toHaveBeenCalledWith(
        expect.objectContaining({
          isolation: "private-stdio",
          requireNoExternalCapabilities: true,
        }),
      );
      // Native tool-only failures have no completed assistant to prepare a
      // payload from; terminal resolution owns their provider guidance.
      const terminalInput = makeTerminalInput({
        ...result.prepared,
        attempt: result.attempt,
        attemptAssistant: result.attemptAssistant,
        terminalState: result.terminalState,
        runParams: input.terminalBase.runParams,
        settledTurnFinalizationOutcome: result.finalizationOutcome,
        replayState: { hadPotentialSideEffects: true, replayInvalid: true },
        resolveReplayInvalid: () => true,
      });
      const resolved = await resolveEmbeddedRunTerminal(terminalInput);
      expect(terminalInput.sessionPromptState.activateInternalPrompt).not.toHaveBeenCalled();
      expect(resolved.action).toBe("complete");
      if (resolved.action !== "complete") {
        throw new Error("Provider failure must settle without replay");
      }
      expect(resolved.result.meta).toMatchObject({
        stopReason: "error",
        replayInvalid: true,
        error: { message: expect.stringContaining("Provider overloaded"), fallbackSafe: false },
      });
      expect(resolved.result.payloads).toEqual([
        expect.objectContaining({ text: expect.stringMatching(/try again/i), isError: true }),
      ]);
      expect(resolved.result.payloads?.[0]?.text).toContain(
        "some tool actions may have already been executed",
      );
      expect(runAttempt).not.toHaveBeenCalled();
      expect(fixture.mirror).not.toHaveBeenCalled();
    },
  );

  it("replaces provider failure with the ordinary finalizer answer", async () => {
    const text = "The command completed and returned: settled.";
    const input = await createInput();
    input.terminalBase.runParams.terminalReplyExpectation = "result-required";
    const runAttempt = vi.spyOn(input.finalization.harness, "runAttempt");
    returnBoundedText(text);

    const result = await prepareTerminalWithSettledTurnFinalization(input);

    expect(fixture.runBounded).toHaveBeenCalledOnce();
    expect(result.finalizationOutcome).toBe("answered");
    expect(result.attempt.terminal).toEqual({ kind: "ok" });
    expect(result.terminalState.outcome.error).toBeUndefined();
    expect(result.attempt.assistantTexts).toEqual([text]);
    expect(result.attempt.preparedTerminalReply).toEqual({
      text,
      terminalReply: { disposition: "visible", text },
    });
    expect(result.prepared.payloadsWithToolMedia).toEqual([expect.objectContaining({ text })]);
    expect(result.prepared.payloadsWithToolMedia?.some((payload) => payload.isError)).toBe(false);
    expect(runAttempt).not.toHaveBeenCalled();
    expect(fixture.mirror).toHaveBeenCalledOnce();
    expect(fixture.mirror.mock.calls[0]?.[0].messages).toEqual([
      expect.objectContaining({ role: "assistant", content: [{ type: "text", text }] }),
    ]);
  });

  it.each(["failedTool", "timedOut", "cancelled"] as const)(
    "preserves tool failures and interruption ownership despite authored silence: %j",
    async (failure) => {
      const input = await createInput({
        failedTool: failure === "failedTool",
        timedOut: failure === "timedOut",
      });
      const boundedResult = returnBoundedText("NO_REPLY");
      if (failure === "cancelled") {
        const controller = new AbortController();
        input.finalization.abortSignal = controller.signal;
        fixture.runBounded.mockImplementation(async () => {
          controller.abort(new Error("cancelled"));
          return boundedResult;
        });
      }

      const result = await prepareTerminalWithSettledTurnFinalization(input);

      expect(fixture.runBounded).toHaveBeenCalledTimes(failure === "timedOut" ? 0 : 1);
      expect(result.finalizationOutcome).toBe(failure === "timedOut" ? "not-attempted" : "failed");
      expect(result.attempt).toBe(input.initial.attempt);
      if (failure === "failedTool") {
        expect(result.attempt.lastToolError).toEqual(input.initial.attempt.lastToolError);
      }
      if (failure === "timedOut") {
        expect(isEmbeddedRunTerminalTimeout(result.terminalState.outcome)).toBe(true);
        expect(result.prepared.timedOutDuringPrompt).toBe(true);
        expect(result.prepared.payloadsWithToolMedia ?? []).toEqual([]);
        // The run loop presents timeout errors after finalization preparation.
        const setTerminalLifecycleMeta = vi.fn();
        const timeout = resolveEmbeddedRunTerminalTimeout({
          terminalPrepared: result.prepared,
          attempt: result.attempt,
          terminalState: result.terminalState,
          resolveReplayInvalid: (incompleteTurnText) =>
            resolveReplayInvalidFlag({ attempt: result.attempt, incompleteTurnText }),
          setTerminalLifecycleMeta,
          startedAtMs: Date.now(),
        });
        expect(timeout?.payloads).toEqual([
          { text: expect.stringContaining("timed out"), isError: true },
        ]);
        expect(timeout?.meta).toMatchObject({
          replayInvalid: true,
          modelFallbackStopReason: "agent_run_terminal_timeout",
          error: { kind: "incomplete_turn", fallbackSafe: false },
        });
        expect(setTerminalLifecycleMeta).toHaveBeenCalledOnce();
        expect(setTerminalLifecycleMeta).toHaveBeenCalledWith(
          expect.objectContaining({ replayInvalid: true, livenessState: "blocked" }),
        );
      } else if (failure === "failedTool") {
        expect(result.prepared.payloadsWithToolMedia?.[0]).toMatchObject({ isError: true });
      }
      expect(fixture.mirror).not.toHaveBeenCalled();
    },
  );

  describe("for a sovereign agent (openclaw#1321)", () => {
    // The finalizer asks for a new answer in the agent's name, from a code-owned prompt and an
    // empty base, so it never carries the agent's sovereign files. An enforce agent refuses it
    // before any handoff, and the host's settled-tool fallback keeps the reply.
    const config = {
      agents: {
        entries: {
          main: { sovereignPrompts: { mode: "enforce" as const } },
          off: { sovereignPrompts: { mode: "off" as const } },
          plain: {},
        },
      },
    };
    const generated = "A generated answer the agent never authored.";

    async function createAgentInput(
      agentId: string,
      options: Parameters<typeof createInput>[0] = {},
    ) {
      const input = await createInput({ terminalStatus: "completed", ...options });
      Object.assign(input.finalization.preparedAttempt, { config, agentId });
      input.terminalBase.runParams.trigger = "user";
      return input;
    }

    async function resolveTerminal(
      input: Awaited<ReturnType<typeof createInput>>,
      result: Awaited<ReturnType<typeof prepareTerminalWithSettledTurnFinalization>>,
    ) {
      const resolved = await resolveEmbeddedRunTerminal(
        makeTerminalInput({
          ...result.prepared,
          attempt: result.attempt,
          attemptAssistant: result.attemptAssistant,
          terminalState: result.terminalState,
          runParams: input.terminalBase.runParams,
          settledTurnFinalizationOutcome: result.finalizationOutcome,
          replayState: { hadPotentialSideEffects: true, replayInvalid: true },
          resolveReplayInvalid: () => true,
        }),
      );
      if (resolved.action !== "complete") {
        throw new Error("A settled turn must complete without replay");
      }
      return resolved.result;
    }

    it("refuses before any handoff and keeps the reply", async () => {
      const input = await createAgentInput("main");
      returnBoundedText(generated);
      const warn = vi.spyOn(embeddedRunLog, "warn");

      const result = await prepareTerminalWithSettledTurnFinalization(input);

      // No auth handoff, no bounded app-server turn, no transcript write.
      expect(fixture.authHandoff).not.toHaveBeenCalled();
      expect(fixture.runBounded).not.toHaveBeenCalled();
      expect(fixture.mirror).not.toHaveBeenCalled();
      expect(result.finalizationOutcome).toBe("failed");
      expect(result.attempt).toBe(input.initial.attempt);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "sovereign prompts refused: code=route_unconverted route=codex:settled-turn-finalization",
        ),
      );
      // Settled-tool fallback: a failed finalization ends the turn with the host notice.
      const terminal = await resolveTerminal(input, result);
      expect(terminal.meta.error).toMatchObject({ kind: "incomplete_turn" });
      expect(terminal.payloads).toEqual([
        expect.objectContaining({
          text: expect.stringContaining("No answer was returned"),
          isError: true,
        }),
      ]);
      expect(JSON.stringify(terminal)).not.toContain(generated);
    });

    it("finalizes an off agent exactly as an agent with no sovereign setting", async () => {
      const runs = [];
      for (const agentId of ["off", "plain"]) {
        const input = await createAgentInput(agentId);
        returnBoundedText(generated);
        const result = await prepareTerminalWithSettledTurnFinalization(input);
        const { signal: _signal, historyItems, ...request } = fixture.runBounded.mock.lastCall![0];
        runs.push({
          request,
          history: historyItems?.length,
          mirrored: fixture.mirror.mock.lastCall?.[0].messages.map(
            ({ timestamp: _timestamp, ...message }) => message,
          ),
          outcome: result.finalizationOutcome,
          texts: result.attempt.assistantTexts,
        });
      }
      expect(runs[0]).toMatchObject({ outcome: "answered", texts: [generated] });
      expect(runs[0]).toEqual(runs[1]);
    });

    it("forwards the enforce agent's own settled answer without the finalizer", async () => {
      const answer = "The command printed settled.";
      const input = await createAgentInput("main", { answer });

      const result = await prepareTerminalWithSettledTurnFinalization(input);

      expect(result.finalizationOutcome).toBe("not-attempted");
      expect(fixture.authHandoff).not.toHaveBeenCalled();
      expect(fixture.runBounded).not.toHaveBeenCalled();
      const terminal = await resolveTerminal(input, result);
      expect(terminal.meta.error).toBeUndefined();
      expect(terminal.payloads).toEqual([expect.objectContaining({ text: answer })]);
    });
  });
});
