import { describe, expect, it } from "vitest";
import { resolveEmbeddedRunTerminal } from "../../agents/embedded-agent-runner/run/terminal-resolution.js";
import { makeTerminalInput } from "../../agents/embedded-agent-runner/run/terminal-resolution.test-support.js";
import { prepareReadyReply } from "./get-reply-run-context.test-support.js";
import { baseParams } from "./get-reply-run.test-support.js";

describe("silent continuation event reply expectation", () => {
  it("does not retry an empty non-subagent silent-wake return", async () => {
    const base = baseParams();
    const prepared = await prepareReadyReply({
      sessionKey: "agent:main:main",
      sessionCtx: { ...base.sessionCtx, InternalEventReplyExpectation: "optional" },
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

  it("keeps a subagent's upward result required even when delivery is silent", async () => {
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

    expect(prepared.terminalReplyExpectation).toBe("required");
  });

  it("does not change another silent producer's terminal policy", async () => {
    const prepared = await prepareReadyReply({
      sessionKey: "agent:main:main",
      opts: {
        internalEventExecution: { deliver: false, onStarted() {}, onTerminal() {} },
      },
    });
    expect(prepared.terminalReplyExpectation).toBe("required");
  });
});
