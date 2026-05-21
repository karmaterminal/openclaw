import { afterEach, describe, expect, it, vi } from "vitest";

// Same mock shape as openclaw-tools.continuation-registration.test.ts so we
// don't drag the disk-backed config loader or plugin runtime into this file.
let mockConfig: Record<string, unknown> = {
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

import { __testing, createOpenClawTools } from "./openclaw-tools.js";

const CONTINUATION_TOOLS = ["continue_work", "continue_delegate", "request_compaction"] as const;

function buildRequestCompactionOpts() {
  return {
    sessionId: "test-session-x718",
    getContextUsage: () => 0.85,
    triggerCompaction: vi.fn(async () => ({ ok: true, compacted: true })),
  };
}

function buildContinueWorkOpts() {
  return { requestContinuation: vi.fn() };
}

function continuationToolNames(tools: Array<{ name: string }>): string[] {
  return tools
    .map((t) => t.name)
    .filter((name): name is (typeof CONTINUATION_TOOLS)[number] =>
      (CONTINUATION_TOOLS as readonly string[]).includes(name),
    );
}

describe("createOpenClawTools — #718 continuation registration uses resolvedConfig (default/dep-provided config path)", () => {
  afterEach(() => {
    __testing.setDepsForTest();
  });

  // RED proof: bug surface is `options?.config?.agents?.defaults?.continuation?.enabled`.
  // When the caller omits options.config and instead relies on the dependency-injected
  // config (openClawToolsDeps.config), the gates evaluate undefined and silently skip
  // registering ALL THREE continuation tools — even though resolvedConfig itself enables
  // continuation. The fix: gates must check `resolvedConfig?.agents?.defaults?.continuation?.enabled`.
  it("registers all 3 continuation tools when continuation.enabled is true via dep-provided config (no options.config supplied)", () => {
    __testing.setDepsForTest({
      config: {
        session: { mainKey: "main", scope: "per-sender" },
        agents: { defaults: { continuation: { enabled: true } } },
      } as never,
    });

    const tools = createOpenClawTools({
      agentSessionKey: "main",
      disablePluginTools: true,
      disableMessageTool: true,
      // NOTE: deliberately NO `config:` field — exercise the resolvedConfig fall-through
      // to openClawToolsDeps.config. This is the production path for callers that rely
      // on the module-level dependency-injected config.
      continueWorkOpts: buildContinueWorkOpts(),
      requestCompactionOpts: buildRequestCompactionOpts(),
    });

    const names = continuationToolNames(tools);
    expect(names).toContain("continue_work");
    expect(names).toContain("continue_delegate");
    expect(names).toContain("request_compaction");
  }, 240_000);

  it("registers continue_delegate alone via dep-provided config when only continuation.enabled=true (no opts threaded)", () => {
    __testing.setDepsForTest({
      config: {
        session: { mainKey: "main", scope: "per-sender" },
        agents: { defaults: { continuation: { enabled: true } } },
      } as never,
    });

    const tools = createOpenClawTools({
      agentSessionKey: "main",
      disablePluginTools: true,
      disableMessageTool: true,
      // No options.config, no continueWorkOpts, no requestCompactionOpts.
      // Per the asymmetric design (see openclaw-tools.ts:503-518): continue_delegate fires
      // through TaskFlow and only needs continuation.enabled — so it MUST register via the
      // dep-provided config path. continue_work + request_compaction stay off (no closures).
    });

    const names = continuationToolNames(tools);
    expect(names).toContain("continue_delegate");
    expect(names).not.toContain("continue_work");
    expect(names).not.toContain("request_compaction");
  });

  it("registers nothing via dep-provided config when continuation.enabled is unset", () => {
    __testing.setDepsForTest({
      config: {
        session: { mainKey: "main", scope: "per-sender" },
        // no agents.defaults.continuation
      } as never,
    });

    const tools = createOpenClawTools({
      agentSessionKey: "main",
      disablePluginTools: true,
      disableMessageTool: true,
      continueWorkOpts: buildContinueWorkOpts(),
      requestCompactionOpts: buildRequestCompactionOpts(),
    });

    expect(continuationToolNames(tools)).toEqual([]);
  });

  it("options.config still wins when supplied (resolvedConfig = options.config ?? openClawToolsDeps.config)", () => {
    __testing.setDepsForTest({
      config: {
        session: { mainKey: "main", scope: "per-sender" },
        agents: { defaults: { continuation: { enabled: false } } },
      } as never,
    });

    const tools = createOpenClawTools({
      agentSessionKey: "main",
      disablePluginTools: true,
      disableMessageTool: true,
      // options.config overrides dep-provided config and enables continuation.
      config: {
        session: { mainKey: "main", scope: "per-sender" },
        agents: { defaults: { continuation: { enabled: true } } },
      } as never,
      continueWorkOpts: buildContinueWorkOpts(),
      requestCompactionOpts: buildRequestCompactionOpts(),
    });

    const names = continuationToolNames(tools);
    expect(names).toContain("continue_work");
    expect(names).toContain("continue_delegate");
    expect(names).toContain("request_compaction");
  });
});
