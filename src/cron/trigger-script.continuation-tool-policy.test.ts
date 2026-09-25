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

  it.each([
    ["evaluation then payload", ["evaluation", "payload"]],
    ["payload then evaluation", ["payload", "evaluation"]],
  ] as const)(
    "keeps continuation policy separate for %s on the same cached job",
    async (_name, order) => {
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

      for (const invocation of order) {
        if (invocation === "evaluation") {
          await expect(
            runtime.evaluateTrigger({
              jobId: "continuation-policy",
              script: "return { fire: false };",
              state: null,
              toolsAllow: ["*"],
            }),
          ).resolves.toMatchObject({ kind: "evaluated", fire: false });
        } else {
          await runtime.executePayload({
            jobId: "continuation-policy",
            script: "return { ok: true };",
            state: null,
            toolsAllow: ["*"],
          });
        }
      }

      expect(mocks.createOpenClawCodingTools).toHaveBeenCalledTimes(2);
      const expectedPolicy = {
        evaluation: {
          disableContinuationTools: true,
          allowDelegateOnlyContinuationTools: false,
        },
        payload: {
          disableContinuationTools: false,
          allowDelegateOnlyContinuationTools: true,
        },
      } as const;
      for (const [index, invocation] of order.entries()) {
        expect(mocks.createOpenClawCodingTools.mock.calls[index]?.[0]).toMatchObject(
          expectedPolicy[invocation],
        );
      }
    },
  );
});
