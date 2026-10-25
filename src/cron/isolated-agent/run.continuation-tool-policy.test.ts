import { describe, expect, it } from "vitest";
import { withContinuationOpts } from "../../agents/agent-tools.options.js";
import { makeIsolatedAgentParamsFixture } from "./job-fixtures.js";
import { setupRunCronIsolatedAgentTurnSuite } from "./run.suite-helpers.js";
import {
  loadRunCronIsolatedAgentTurn,
  mockRunCronFallbackPassthrough,
  runEmbeddedAgentMock,
} from "./run.test-harness.js";

const runCronIsolatedAgentTurn = await loadRunCronIsolatedAgentTurn();

describe("runCronIsolatedAgentTurn continuation tool policy", () => {
  setupRunCronIsolatedAgentTurnSuite({ fast: true });

  it.each(["cron", "event"] as const)(
    "disables continuation tools for a %s job instead of advertising callbacks cron cannot service",
    async (trigger) => {
      mockRunCronFallbackPassthrough();

      const result = await runCronIsolatedAgentTurn(
        makeIsolatedAgentParamsFixture({
          cfg: {
            agents: {
              defaults: {
                continuation: { enabled: true },
              },
            },
          },
          trigger,
        }),
      );

      expect(result.status).toBe("ok");
      expect(runEmbeddedAgentMock).toHaveBeenCalledOnce();
      // The cron run's own parameters, read by the continuation tool gate that builds its tools.
      const runParams = runEmbeddedAgentMock.mock.calls[0]?.[0];
      expect(runParams).toMatchObject({ trigger });
      expect(withContinuationOpts(runParams, {}).disableContinuationTools).toBe(true);
      // The same run outside the cron runner keeps its continuation tools.
      expect(
        withContinuationOpts({ ...runParams, trigger: "user" }, {}).disableContinuationTools,
      ).toBe(false);
    },
  );
});
