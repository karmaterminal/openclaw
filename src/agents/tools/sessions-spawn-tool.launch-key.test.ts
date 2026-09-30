import "./sessions-spawn-tool.mocks.test-support.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { supportedSpawnModelChoice } from "../subagents/spawn/subagent-spawn.test-helpers.js";

const { hoisted } = await import("./sessions-spawn-tool.mocks.test-support.js");

let createSessionsSpawnTool: typeof import("./sessions-spawn-tool.js").createSessionsSpawnTool;
let acpRuntimeRegistry: typeof import("../../acp/runtime/registry.js");

describe("sessions_spawn tool continuation launch key", () => {
  beforeAll(async () => {
    ({ createSessionsSpawnTool } = await import("./sessions-spawn-tool.js"));
    acpRuntimeRegistry = await import("../../acp/runtime/registry.js");
  });

  beforeEach(() => {
    hoisted.prepareModelChoiceMock.mockReset().mockImplementation(supportedSpawnModelChoice);
    acpRuntimeRegistry.testing.resetAcpRuntimeBackendsForTests();
    hoisted.spawnSubagentDirectMock.mockReset().mockResolvedValue({
      status: "accepted",
      context: "isolated",
      childSessionKey: "agent:main:subagent:1",
      runId: "run-subagent",
    });
    hoisted.spawnAcpDirectMock.mockReset().mockResolvedValue({
      status: "accepted",
      childSessionKey: "agent:codex:acp:1",
      runId: "run-acp",
    });
    hoisted.registerSubagentRunMock.mockReset();
    hoisted.inProcessCreationMock.mockReset();
    hoisted.runSubagentProgressMock.mockClear();
  });

  it("exposes no continuation launch key and never forwards a model-supplied one", async () => {
    const tool = createSessionsSpawnTool();
    const schema = tool.parameters as { properties: Record<string, unknown> };
    const launchKeyFields = [
      "continuationChildRunId",
      "childRunId",
      "runId",
      "idempotencyKey",
      "launchKey",
    ];
    for (const field of launchKeyFields) {
      expect(schema.properties).not.toHaveProperty(field);
    }
    const reservedKey = "continuation:record-1:1";

    await tool.execute(
      "model-launch-key",
      Object.fromEntries([
        ["task", "spawn with a smuggled key"],
        ...launchKeyFields.map((field) => [field, reservedKey]),
      ]),
    );

    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledOnce();
    const [spawnParams, spawnContext] = hoisted.spawnSubagentDirectMock.mock.calls[0] ?? [];
    for (const field of launchKeyFields) {
      expect(spawnParams).not.toHaveProperty(field);
      expect(spawnContext).not.toHaveProperty(field);
    }
    expect(JSON.stringify([spawnParams, spawnContext])).not.toContain(reservedKey);
  });
});
