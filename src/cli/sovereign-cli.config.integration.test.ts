// The sovereign switch through real config files (#1321): validation accepts "off" and
// "enforce" and refuses anything else without naming the agent's sovereign location.
import { describe, expect, it } from "vitest";
import {
  createTestRuntime,
  useConfigCliIntegrationHarness,
} from "./config-cli.integration.test-harness.js";

// Register the harness metadata mock before loading the real config and command modules.
const { ensureCliExecutionBootstrap } = await import("./command-execution-startup.js");
const { resolveCliStartupPolicy } = await import("./command-startup-policy.js");
const {
  registeredRuntimeErrors: errors,
  registeredRuntimeLogs: logs,
  runRegisteredConfigCommand: invoke,
  withConfigFileHarness: withFile,
} = useConfigCliIntegrationHarness();

// Never created: validation must not need, or print, the agent's sovereign location.
const AGENT_DIR = "/openclaw-sovereign-fixture/agent";

const configWith = (sovereignPrompts?: Record<string, unknown>) =>
  `${JSON.stringify({
    agents: {
      entries: { main: { agentDir: AGENT_DIR, ...(sovereignPrompts && { sovereignPrompts }) } },
    },
  })}\n`;

describe("sovereignPrompts.mode in real config", () => {
  // Deploy runs exactly this, before it stops anything.
  it.each([{ mode: "enforce" }, { mode: "off" }, {}, undefined])(
    "config validate accepts %j",
    async (sovereign) => {
      await withFile("sovereign-config-", configWith(sovereign), async () => {
        await invoke(["config", "validate"]);
        expect(logs.join("\n")).toContain("Config valid");
      });
    },
  );

  it("config validate refuses an unknown mode without naming the agent's location", async () => {
    await withFile("sovereign-config-", configWith({ mode: "on" }), async () => {
      await expect(invoke(["config", "validate"])).rejects.toMatchObject({
        name: "ExitError",
        code: 1,
      });
      expect(errors.join("\n")).toContain("agents.entries.main.sovereignPrompts.mode");
      expect(errors.join("\n")).not.toContain(AGENT_DIR);
    });
  });

  it("the sovereign command's config guard admits enforce", async () => {
    await withFile("sovereign-config-", configWith({ mode: "enforce" }), async () => {
      const output = createTestRuntime();
      const commandPath = ["sovereign", "paths"];
      await ensureCliExecutionBootstrap({
        runtime: output.runtime,
        commandPath,
        startupPolicy: resolveCliStartupPolicy({ commandPath, jsonOutputMode: false }),
      });
      expect(output.errors).toEqual([]);
    });
  });
});
