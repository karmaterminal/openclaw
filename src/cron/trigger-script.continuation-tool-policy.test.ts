import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createCronScriptRuntimeFixture as createCronScriptRuntime } from "./trigger-script.test-helpers.js";

const mocks = vi.hoisted(() => ({
  createOpenClawCodingTools: vi.fn(() => []),
}));

vi.mock("../agents/agent-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/agent-tools.js")>();
  return {
    ...actual,
    createOpenClawCodingTools: mocks.createOpenClawCodingTools,
  };
});

describe("cron trigger script continuation tool policy", () => {
  beforeEach(() => {
    mocks.createOpenClawCodingTools.mockClear();
  });

  it("disables continuation only for trigger evaluation and preserves payload capability", async () => {
    const config: OpenClawConfig = {
      agents: {
        defaults: {
          continuation: { enabled: true },
        },
      },
      plugins: { enabled: false },
    };
    const runtime = createCronScriptRuntime({
      config,
      runHeadless: vi.fn(async () => ({
        status: "completed" as const,
        value: { fire: false },
        output: [],
        toolCallCount: 0,
      })),
    });

    await expect(
      runtime.evaluateTrigger({
        jobId: "continuation-policy",
        script: "return { fire: false };",
        state: null,
        toolsAllow: ["*"],
      }),
    ).resolves.toMatchObject({ kind: "evaluated", fire: false });
    await runtime.executePayload({
      jobId: "continuation-policy",
      script: "return { ok: true };",
      state: null,
      toolsAllow: ["*"],
    });

    expect(mocks.createOpenClawCodingTools).toHaveBeenCalledTimes(2);
    expect(mocks.createOpenClawCodingTools.mock.calls[0]?.[0]).toMatchObject({
      disableContinuationTools: true,
      allowDelegateOnlyContinuationTools: false,
    });
    expect(mocks.createOpenClawCodingTools.mock.calls[1]?.[0]).toMatchObject({
      disableContinuationTools: false,
      allowDelegateOnlyContinuationTools: true,
    });
  });
});
