// CLI runs refuse a sovereign prompt agent up front (#1321, design § 7.3): no test proves a
// CLI transport carries its text, and a node-host placement would send it off the Gateway
// host. The refusal comes before hooks, preparation or any CLI process.
import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.js";
import { prepareSystemAgentRunAdmission } from "./admitted-run-context.js";
import type { CliOutput } from "./cli-output-contracts.js";
import { runCliAgent } from "./cli-runner.js";
import { buildPreparedCliRunContext } from "./cli-runner.test-helpers.js";
import type { PreparedCliRunContext, RunCliAgentParams } from "./cli-runner/types.js";

const { prepareCliRunContext, executePreparedCliRun } = vi.hoisted(() => ({
  prepareCliRunContext: vi.fn<(params: RunCliAgentParams) => Promise<PreparedCliRunContext>>(),
  executePreparedCliRun: vi.fn<(context: PreparedCliRunContext) => Promise<CliOutput>>(),
}));

vi.mock("./cli-runner/prepare.runtime.js", () => ({ prepareCliRunContext }));
vi.mock("./cli-runner/execute.runtime.js", () => ({ executePreparedCliRun }));
vi.mock("../plugins/hook-runner-global.js", () => ({ getGlobalHookRunner: () => null }));

describe("CLI runs for a sovereign prompt agent", () => {
  it("refuse route_unconverted before hooks, preparation or a CLI process", async () => {
    const config = {
      agents: { entries: { main: { sovereignPrompts: { mode: "enforce" } } } },
    } as OpenClawConfig;
    const context = buildPreparedCliRunContext({
      provider: "google-gemini-cli",
      model: "transport-alias",
      backend: { sessionMode: "none" },
      runId: "cli-sovereign-route",
      config,
    });
    const admission = prepareSystemAgentRunAdmission(config, "cli-sovereign-route", "main", "test");
    const onExecutionStarted = vi.fn(async () => {});
    try {
      await expect(
        runCliAgent({
          ...context.params,
          agentId: "main",
          config,
          admittedRunContext: await admission.admit("embedded"),
          onExecutionStarted,
        }),
      ).rejects.toMatchObject({
        name: "SovereignPromptRefusal",
        code: "route_unconverted",
        details: { route: "cli" },
      });
    } finally {
      admission.close();
    }
    expect(onExecutionStarted).not.toHaveBeenCalled();
    expect(prepareCliRunContext).not.toHaveBeenCalled();
    expect(executePreparedCliRun).not.toHaveBeenCalled();
  });
});
