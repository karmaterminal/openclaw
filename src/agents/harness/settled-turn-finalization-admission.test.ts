// One core admission for every settled-turn finalizer (openclaw#1321). A finalizer writes a
// new answer in the agent's name from a code-owned prompt with no system prompt, so for a
// sovereign agent it refuses before preparation and dispatch, whatever the harness.
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { log as embeddedRunLog } from "../embedded-agent-runner/logger.js";
import { useFinalizationAdmission } from "../embedded-agent-runner/run/settled-finalization-harness.test-support.js";
import { prepareTerminalWithSettledTurnFinalization } from "../embedded-agent-runner/run/settled-turn-finalization.js";
import { createSettledFinalizationTestInput } from "../embedded-agent-runner/run/settled-turn-finalization.test-support.js";
import {
  settledBatch,
  textAssistant,
} from "../embedded-agent-runner/run/settled-turn-fixtures.test-support.js";
import { resolveEmbeddedRunTerminal } from "../embedded-agent-runner/run/terminal-resolution.js";
import { makeTerminalInput } from "../embedded-agent-runner/run/terminal-resolution.test-support.js";
import {
  loadSovereignPromptsForProcess,
  resetSovereignPromptRuntimeForTests,
} from "../sovereign-prompts/runtime.js";
import {
  useSovereignTempDirs,
  writeAgentGeneration,
} from "../sovereign-prompts/sovereign-fixture.test-support.js";
import { makeEmbeddedRunnerAttempt } from "../test-helpers/embedded-agent-runner-e2e-fixtures.js";
import { createOpenClawAgentHarness } from "./builtin-openclaw.js";

const runEmbeddedAttempt = vi.hoisted(() => vi.fn());
// mock-isolation: The embedded runner is the built-in finalizer's model handoff; each call is
// one generated answer, which the admission must prevent for a sovereign agent.
vi.mock("../embedded-agent-runner/run/attempt.js", () => ({ runEmbeddedAttempt }));

const getContext = useFinalizationAdmission([runEmbeddedAttempt], "finalizer-admission-test");
const tempDirs = useSovereignTempDirs(afterEach);
afterEach(() => {
  resetSovereignPromptRuntimeForTests();
  vi.restoreAllMocks();
});

const generated = "A generated answer the agent never authored.";
const config = {
  agents: {
    entries: {
      main: { sovereignPrompts: { mode: "enforce" } },
      off: { sovereignPrompts: { mode: "off" } },
      plain: {},
    },
  },
} as OpenClawConfig;

/** A settled tool turn; with `answer`, the turn authored its final answer after the tool. */
function settledTurn(answer?: string) {
  const batch = settledBatch(["tool-read", "read"]);
  const authored = answer === undefined ? undefined : textAssistant(answer);
  const messagesSnapshot = authored
    ? [...batch.messagesSnapshot, authored]
    : batch.messagesSnapshot;
  return makeEmbeddedRunnerAttempt({
    ...batch,
    ...(authored
      ? {
          lastAssistant: authored,
          currentAttemptAssistant: authored,
          currentAttemptCompletedAssistant: authored,
          assistantTexts: [answer!],
        }
      : {}),
    messagesSnapshot,
    sessionIdUsed: "session-settled",
    toolMetas: [{ toolName: "read", isError: false, replaySafe: true }],
    settledTurnFinalizationContext: { source: "openclaw-transcript", messages: messagesSnapshot },
    assistantTurns: 1,
  });
}

function createInput(
  agentId: string | undefined,
  options: { answer?: string; config?: OpenClawConfig; harness?: "builtin" | "plugin" } = {},
) {
  const input = createSettledFinalizationTestInput(settledTurn(options.answer), getContext());
  if (options.harness !== "plugin") {
    input.finalization.harness = createOpenClawAgentHarness();
  }
  Object.assign(input.finalization.preparedAttempt, {
    config: options.config ?? config,
    agentId,
    provider: "openai",
    modelId: "gpt-5.6-luna",
    model: { id: "gpt-5.6-luna", provider: "openai", api: "openai-responses" },
  });
  Object.assign(input.terminalBase.runParams, {
    trigger: "user",
    sourceReplyDeliveryMode: "automatic",
  });
  return input;
}

/** What the built-in finalizer's embedded runner returns for one generated answer. */
function generatedFinalization() {
  const assistant = textAssistant(generated, { stopReason: "stop" });
  return makeEmbeddedRunnerAttempt({
    lastAssistant: assistant,
    currentAttemptAssistant: assistant,
    currentAttemptCompletedAssistant: assistant,
    assistantTexts: [generated],
    messagesSnapshot: [assistant],
    replayMetadata: { hadPotentialSideEffects: false, replaySafe: true },
  });
}

async function resolveTerminal(
  input: ReturnType<typeof createInput>,
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

/** Runs the finalization step with a finalizer ready to generate, and expects the refusal. */
async function expectRefused(
  input: ReturnType<typeof createInput>,
  route: string,
  finalizer: Mock = runEmbeddedAttempt,
) {
  runEmbeddedAttempt.mockResolvedValue(generatedFinalization());
  const warn = vi.spyOn(embeddedRunLog, "warn");
  const result = await prepareTerminalWithSettledTurnFinalization(input);

  // Zero finalizer handoffs: the refusal comes before preparation and dispatch.
  expect(finalizer).not.toHaveBeenCalled();
  expect(result.finalizationOutcome).toBe("failed");
  expect(result.attempt).toBe(input.initial.attempt);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining(`sovereign prompts refused: code=route_unconverted route=${route}`),
  );
  // The turn keeps its reply obligation: it ends incomplete, with the host's notice.
  const terminal = await resolveTerminal(input, result);
  expect(terminal.meta.error).toMatchObject({ kind: "incomplete_turn" });
  expect(terminal.payloads).toEqual([
    expect.objectContaining({
      text: expect.stringContaining("No answer was returned"),
      isError: true,
    }),
  ]);
  expect(JSON.stringify(terminal)).not.toContain(generated);
}

describe("settled-turn finalizer admission for a sovereign agent", () => {
  it("refuses the embedded finalizer before any model handoff", async () => {
    await expectRefused(createInput("main"), "openclaw:settled-turn-finalization");
  });

  it("refuses another harness's finalizer before it is called", async () => {
    const input = createInput("main", { harness: "plugin" });
    vi.mocked(input.finalization.harness.finalizeSettledTurn!).mockResolvedValue({
      assistant: textAssistant(generated, { stopReason: "stop" }),
    });

    await expectRefused(
      input,
      "test-harness:settled-turn-finalization",
      vi.mocked(input.finalization.harness.finalizeSettledTurn!),
    );
  });

  it("refuses an agent loaded as enforce after config turns it off, until restart", async () => {
    const agentDir = tempDirs.make("openclaw-finalizer-admission-");
    writeAgentGeneration(agentDir, "main");
    const withMode = (mode: "enforce" | "off") =>
      ({
        agents: { entries: { main: { agentDir, sovereignPrompts: { mode } } } },
      }) as OpenClawConfig;
    loadSovereignPromptsForProcess(withMode("enforce"), {
      log: { info: () => {}, warn: () => {} },
    });

    await expectRefused(
      createInput("main", { config: withMode("off") }),
      "openclaw:settled-turn-finalization",
    );
  });

  it.each([undefined, "", "%%%"])(
    "refuses a finalizer whose agent id is %j while any agent is enforce",
    async (agentId) => {
      await expectRefused(createInput(agentId), "openclaw:settled-turn-finalization");
    },
  );

  it("finalizes an off agent exactly as an agent with no sovereign setting", async () => {
    const runs = [];
    for (const agentId of ["off", "plain"]) {
      runEmbeddedAttempt.mockReset().mockResolvedValue(generatedFinalization());
      const result = await prepareTerminalWithSettledTurnFinalization(createInput(agentId));
      expect(runEmbeddedAttempt).toHaveBeenCalledOnce();
      // What reaches the model; agent-scoped authority and fixture clocks differ by design.
      const { prompt, operation, provider, modelId, model, promptCacheKey, disableTools } =
        runEmbeddedAttempt.mock.calls[0]![0];
      const messages = runEmbeddedAttempt.mock.calls[0]![0].settledTurnFinalizationMessages.map(
        ({ timestamp: _timestamp, ...message }: { timestamp: number }) => message,
      );
      runs.push({
        request: { prompt, operation, provider, modelId, model, promptCacheKey, disableTools },
        messages,
        outcome: result.finalizationOutcome,
        texts: result.attempt.assistantTexts,
      });
    }
    expect(runs[0]).toMatchObject({ outcome: "answered", texts: [generated] });
    expect(runs[0]).toEqual(runs[1]);
  });

  it("forwards the enforce agent's own settled answer without the finalizer", async () => {
    const answer = "The read tool returned the note.";
    const input = createInput("main", { answer });

    const result = await prepareTerminalWithSettledTurnFinalization(input);

    expect(result.finalizationOutcome).toBe("not-attempted");
    expect(runEmbeddedAttempt).not.toHaveBeenCalled();
    const terminal = await resolveTerminal(input, result);
    expect(terminal.meta.error).toBeUndefined();
    expect(terminal.payloads).toEqual([expect.objectContaining({ text: answer })]);
  });
});
