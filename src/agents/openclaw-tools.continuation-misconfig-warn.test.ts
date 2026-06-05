import { beforeEach, describe, expect, it, vi } from "vitest";

const { warnSpy, debugSpy, infoSpy, errorSpy, traceSpy, fatalSpy, rawSpy } = vi.hoisted(() => ({
  warnSpy: vi.fn(),
  debugSpy: vi.fn(),
  infoSpy: vi.fn(),
  errorSpy: vi.fn(),
  traceSpy: vi.fn(),
  fatalSpy: vi.fn(),
  rawSpy: vi.fn(),
}));

vi.mock("../logging/subsystem.js", () => {
  return {
    createSubsystemLogger: (subsystem: string) => ({
      subsystem,
      isEnabled: () => true,
      trace: traceSpy,
      debug: debugSpy,
      info: infoSpy,
      warn: warnSpy,
      error: errorSpy,
      fatal: fatalSpy,
      raw: rawSpy,
      child: () => ({
        subsystem,
        isEnabled: () => true,
        trace: traceSpy,
        debug: debugSpy,
        info: infoSpy,
        warn: warnSpy,
        error: errorSpy,
        fatal: fatalSpy,
        raw: rawSpy,
        child: () => ({}) as never,
      }),
    }),
  };
});

const mockConfig: Record<string, unknown> = {
  session: { mainKey: "main", scope: "per-sender" },
};

vi.mock("../config/config.js", async () => {
  const actual = await vi.importActual<typeof import("../config/config.js")>("../config/config.js");
  return {
    ...actual,
    loadConfig: () => mockConfig,
    resolveGatewayPort: () => 18789,
  };
});

vi.mock("../plugins/tools.js", async () => {
  const actual = await vi.importActual<typeof import("../plugins/tools.js")>("../plugins/tools.js");
  return {
    ...actual,
    getPluginToolMeta: () => undefined,
  };
});

import { createOpenClawTools } from "./openclaw-tools.js";

function buildContinueWorkOpts() {
  return {
    requestContinuation: vi.fn(),
  };
}

function buildRequestCompactionOpts() {
  return {
    sessionId: "test-session-x5.1",
    getContextUsage: () => 0.85,
    triggerCompaction: vi.fn(async () => ({ ok: true, compacted: true })),
  };
}

describe("createOpenClawTools — silent partial-registration guard (karmaterminal/openclaw#619)", () => {
  beforeEach(() => {
    warnSpy.mockClear();
  });

  it("warns when continuation.enabled=true but neither continueWorkOpts nor requestCompactionOpts are supplied", () => {
    createOpenClawTools({
      agentSessionKey: "main",
      disablePluginTools: true,
      disableMessageTool: true,
      config: {
        session: { mainKey: "main", scope: "per-sender" },
        agents: { defaults: { continuation: { enabled: true } } },
      } as never,
    });

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0];
    expect(message).toContain("continuation.enabled=true");
    expect(message).toContain("only continue_delegate will register");
    expect(meta).toMatchObject({ agentSessionKey: "main" });
  });

  it("does NOT warn when continuation is fully configured", () => {
    createOpenClawTools({
      agentSessionKey: "main",
      disablePluginTools: true,
      disableMessageTool: true,
      config: {
        session: { mainKey: "main", scope: "per-sender" },
        agents: { defaults: { continuation: { enabled: true } } },
      } as never,
      continueWorkOpts: buildContinueWorkOpts(),
      requestCompactionOpts: buildRequestCompactionOpts(),
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does NOT warn when continuation.enabled is unset", () => {
    createOpenClawTools({
      agentSessionKey: "main",
      disablePluginTools: true,
      disableMessageTool: true,
      config: { session: { mainKey: "main", scope: "per-sender" } } as never,
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does NOT warn when only continueWorkOpts is supplied (request_compaction will not register, but continue_work IS registered — partial-registration concern only fires when neither is supplied)", () => {
    createOpenClawTools({
      agentSessionKey: "main",
      disablePluginTools: true,
      disableMessageTool: true,
      config: {
        session: { mainKey: "main", scope: "per-sender" },
        agents: { defaults: { continuation: { enabled: true } } },
      } as never,
      continueWorkOpts: buildContinueWorkOpts(),
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  // karmaterminal/openclaw#923 — inventoryOnly flag for inventory-build callsites
  // (gateway/tool-resolution.ts + skills/runtime/tool-dispatch.ts) that build the
  // tool catalog for inspection/dispatch lookup rather than for live execution.
  // The L627 warning is informational noise at those callsites since they don't
  // intend to execute the tools anyway; inventoryOnly: true suppresses it.
  it("does NOT warn when continuation.enabled=true but inventoryOnly: true is set (karmaterminal/openclaw#923 — inventory-build callsites)", () => {
    createOpenClawTools({
      agentSessionKey: "main",
      disablePluginTools: true,
      disableMessageTool: true,
      config: {
        session: { mainKey: "main", scope: "per-sender" },
        agents: { defaults: { continuation: { enabled: true } } },
      } as never,
      inventoryOnly: true,
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("DOES warn when inventoryOnly is false (default) and callbacks missing — preserves prior behavior at non-inventory callsites", () => {
    createOpenClawTools({
      agentSessionKey: "main",
      disablePluginTools: true,
      disableMessageTool: true,
      config: {
        session: { mainKey: "main", scope: "per-sender" },
        agents: { defaults: { continuation: { enabled: true } } },
      } as never,
      inventoryOnly: false,
    });

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message] = warnSpy.mock.calls[0];
    expect(message).toContain("continuation.enabled=true");
    expect(message).toContain("inventoryOnly: true");
  });
});
