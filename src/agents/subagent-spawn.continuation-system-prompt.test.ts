/**
 * Regression test for #715:
 *
 * `buildSubagentSystemPrompt` gates the `## Continuation Chaining` block on
 * `params.continuationEnabled` being truthy, but `subagent-spawn.ts` did not
 * thread the runtime config's `agents.defaults.continuation.enabled` flag
 * through to the call site. Result: production subagents never received the
 * continuation chaining guidance, even when continuation was enabled in
 * config.
 *
 * This test exercises the production caller path — spawnSubagentDirect →
 * buildSubagentSystemPrompt → gateway "agent" request's `extraSystemPrompt` —
 * so the bug is caught at the seam where it actually broke, not just by a
 * direct unit-call to buildSubagentSystemPrompt with hand-supplied params.
 */
import os from "node:os";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSubagentSpawnTestConfig,
  loadSubagentSpawnModuleForTest,
} from "./subagent-spawn.test-helpers.js";
import { buildSubagentSystemPrompt } from "./subagent-system-prompt.js";
import { installAcceptedSubagentGatewayMock } from "./test-helpers/subagent-gateway.js";

const hoisted = vi.hoisted(() => ({
  callGatewayMock: vi.fn(),
  configOverride: {} as Record<string, unknown>,
}));

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a non-array record");
  }
  return value as Record<string, unknown>;
}

function gatewayAgentRequestParams(): Record<string, unknown> {
  const agentCall = hoisted.callGatewayMock.mock.calls
    .map((call) => requireRecord(call[0]))
    .find((entry) => entry.method === "agent");
  if (!agentCall) {
    throw new Error("expected a gateway 'agent' request to have been made");
  }
  return requireRecord(agentCall.params);
}

describe("spawnSubagentDirect: continuation chaining prompt block (#715)", () => {
  let spawnSubagentDirect: typeof import("./subagent-spawn.js").spawnSubagentDirect;

  beforeAll(async () => {
    ({ spawnSubagentDirect } = await loadSubagentSpawnModuleForTest({
      callGatewayMock: hoisted.callGatewayMock,
      getRuntimeConfig: () => hoisted.configOverride,
      buildSubagentSystemPromptOverride: buildSubagentSystemPrompt,
      resolveSubagentSpawnModelSelection: () => "openai-codex/gpt-5.4",
      sessionStorePath: "/tmp/subagent-715-session-store.json",
      resetModules: false,
    }));
  });

  beforeEach(() => {
    hoisted.callGatewayMock.mockReset();
    installAcceptedSubagentGatewayMock(hoisted.callGatewayMock);
  });

  it("includes `## Continuation Chaining` in the spawned child's system prompt when config enables continuation", async () => {
    hoisted.configOverride = createSubagentSpawnTestConfig(os.tmpdir(), {
      agents: {
        defaults: {
          workspace: os.tmpdir(),
          continuation: {
            enabled: true,
          },
        },
      },
    });

    const result = await spawnSubagentDirect(
      {
        task: "do some chain-able work",
      },
      {
        agentSessionKey: "agent:main:main",
      },
    );

    expect(result.status).toBe("accepted");

    const agentParams = gatewayAgentRequestParams();
    const extraSystemPrompt = agentParams.extraSystemPrompt;
    expect(typeof extraSystemPrompt).toBe("string");
    expect(extraSystemPrompt as string).toContain("## Continuation Chaining");
    expect(extraSystemPrompt as string).toContain("[[CONTINUE_DELEGATE:");
  });

  it("omits `## Continuation Chaining` when config explicitly disables continuation", async () => {
    hoisted.configOverride = createSubagentSpawnTestConfig(os.tmpdir(), {
      agents: {
        defaults: {
          workspace: os.tmpdir(),
          continuation: {
            enabled: false,
          },
        },
      },
    });

    const result = await spawnSubagentDirect(
      {
        task: "do some chain-able work",
      },
      {
        agentSessionKey: "agent:main:main",
      },
    );

    expect(result.status).toBe("accepted");

    const agentParams = gatewayAgentRequestParams();
    const extraSystemPrompt = agentParams.extraSystemPrompt;
    expect(typeof extraSystemPrompt).toBe("string");
    expect(extraSystemPrompt as string).not.toContain("## Continuation Chaining");
  });
});
