import { describe, expect, it } from "vitest";
import { buildSubagentLaunchRequest } from "./subagent-spawn-launch-request.js";

describe("buildSubagentLaunchRequest observability context", () => {
  it("forwards the frozen diagnostic context outside model-visible child text", () => {
    const diagnosticContext = {
      proof: {
        runId: "0123456789abcdef",
        rowId: "R-OBS-PROOF-MARKER",
        candidateSha: "a".repeat(40),
        harnessRef: "b".repeat(40),
      },
    } as const;
    const built = buildSubagentLaunchRequest({
      childDepth: 1,
      maxSpawnDepth: 4,
      spawnMode: "run",
      task: "inspect the telemetry boundary",
      spawnedByKey: "agent:main:main",
      toolSpawnMetadata: {},
      childSessionKey: "agent:main:subagent:observed",
      collect: false,
      childIdem: "child-observed",
      deliverInitialChildRunDirectly: false,
      childSystemPrompt: "child prompt",
      runTimeoutSeconds: 60,
      lightContext: true,
      expectsCompletionMessage: true,
      swarmMaxConcurrent: 1,
      diagnosticContext,
    });

    expect(built.childLaunch.request).toMatchObject({ diagnosticContext });
    expect(JSON.stringify(built.childLaunch.request.message)).not.toContain(
      diagnosticContext.proof.rowId,
    );
    expect(JSON.stringify(built.childLaunch.request.extraSystemPrompt)).not.toContain(
      diagnosticContext.proof.rowId,
    );
  });
});
