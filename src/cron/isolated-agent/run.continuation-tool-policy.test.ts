import { describe, expect, it } from "vitest";
import { withContinuationOpts } from "../../agents/agent-tools.options.js";
import { makeIsolatedAgentJobFixture, makeIsolatedAgentParamsFixture } from "./job-fixtures.js";
import { setupRunCronIsolatedAgentTurnSuite } from "./run.suite-helpers.js";
import {
  loadRunCronIsolatedAgentTurn,
  mockRunCronFallbackPassthrough,
  runEmbeddedAgentMock,
} from "./run.test-harness.js";

const runCronIsolatedAgentTurn = await loadRunCronIsolatedAgentTurn();

describe("runCronIsolatedAgentTurn continuation tool policy", () => {
  setupRunCronIsolatedAgentTurnSuite({ fast: true });

  // A persistent hook runs here in its own hook session, not a cron-run session: the exclusion
  // follows the runner, which services no continuation, not the session key (#1578).
  it.each([
    ["cron", "cron", "isolated", "cron:test"],
    ["event", "event", "isolated", "cron:test"],
    ["persistent hook", "event", "session:hook:gmail:msg-1", "hook:gmail:msg-1"],
  ] as const)(
    "disables continuation tools for a %s job instead of advertising callbacks cron cannot service",
    async (_label, trigger, sessionTarget, sessionKey) => {
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
          sessionKey,
          job: makeIsolatedAgentJobFixture({ sessionTarget }),
        }),
      );

      expect(result.status).toBe("ok");
      expect(runEmbeddedAgentMock).toHaveBeenCalledOnce();
      // The cron run's own parameters, read by the continuation tool gate that builds its tools.
      const runParams = runEmbeddedAgentMock.mock.calls[0]?.[0];
      expect(runParams).toMatchObject({ trigger, sessionKey: expect.stringContaining(sessionKey) });
      expect(withContinuationOpts(runParams, {}).disableContinuationTools).toBe(true);
      // The same run outside the cron runner keeps its continuation tools.
      expect(
        withContinuationOpts({ ...runParams, trigger: "user" }, {}).disableContinuationTools,
      ).toBe(false);
    },
  );
});
