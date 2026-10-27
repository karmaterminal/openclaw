import { describe, expect, it } from "vitest";
import { resolveEmbeddedRunTerminal } from "../../agents/embedded-agent-runner/run/terminal-resolution.js";
import { makeTerminalInput } from "../../agents/embedded-agent-runner/run/terminal-resolution.test-support.js";
import { prepareReadyReply } from "./get-reply-run-context.test-support.js";

describe("silent continuation event reply expectation", () => {
  it("does not require a visible answer from a silent-wake return in a subagent", async () => {
    const prepared = await prepareReadyReply({
      sessionKey: "agent:main:subagent:silent-wake-proof",
      opts: {
        continuationTrigger: "delegate-return",
        internalEventExecution: {
          deliver: false,
          onStarted() {},
          onTerminal() {},
        },
      },
    });

    expect(prepared.terminalReplyExpectation).toBe("optional");
    const terminal = makeTerminalInput({
      runParams: { terminalReplyExpectation: prepared.terminalReplyExpectation },
    });
    expect((await resolveEmbeddedRunTerminal(terminal)).action).toBe("complete");
    expect(terminal.sessionPromptState.activateInternalPrompt).not.toHaveBeenCalled();
  });

  it("still requires an answer for a normal return in the same session", async () => {
    const prepared = await prepareReadyReply({
      sessionKey: "agent:main:subagent:silent-wake-proof",
      opts: {
        continuationTrigger: "delegate-return",
        internalEventExecution: {
          onStarted() {},
          onTerminal() {},
        },
      },
    });

    expect(prepared.terminalReplyExpectation).toBe("required");
  });
});
