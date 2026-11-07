// The sovereign switch through real config files: validation keeps "enforce" off this
// build (#1321), so neither `config validate` nor the sovereign command admits it.
import fs from "node:fs";
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

// Never created: the refusal must not need, or print, the agent's sovereign location.
const AGENT_DIR = "/openclaw-sovereign-fixture/agent";
const REFUSAL =
  'agents.entries.main.sovereignPrompts.mode: Only "off" is accepted in this build: "enforce" needs the phase A prompt wiring from the next slice. Set "off" or remove the setting.';

const configWith = (sovereignPrompts?: Record<string, unknown>) =>
  `${JSON.stringify({
    agents: {
      entries: { main: { agentDir: AGENT_DIR, ...(sovereignPrompts && { sovereignPrompts }) } },
    },
  })}\n`;

describe("sovereignPrompts.mode in real config", () => {
  // Deploy runs exactly this, before it stops anything.
  it("config validate refuses enforce with a content-free message", async () => {
    const raw = configWith({ mode: "enforce" });
    await withFile("sovereign-config-", raw, async ({ configPath }) => {
      await expect(invoke(["config", "validate"])).rejects.toMatchObject({
        name: "ExitError",
        code: 1,
      });
      expect(errors.join("\n")).toContain(REFUSAL);
      expect(errors.join("\n")).not.toContain(AGENT_DIR);
      expect(fs.readFileSync(configPath, "utf8")).toBe(raw);
    });
  });

  it.each([{ mode: "off" }, {}, undefined])("config validate accepts %j", async (sovereign) => {
    await withFile("sovereign-config-", configWith(sovereign), async () => {
      await invoke(["config", "validate"]);
      expect(logs.join("\n")).toContain("Config valid");
    });
  });

  it("the sovereign command's config guard refuses enforce before its action", async () => {
    await withFile("sovereign-config-", configWith({ mode: "enforce" }), async () => {
      const output = createTestRuntime();
      const commandPath = ["sovereign", "paths"];
      await expect(
        ensureCliExecutionBootstrap({
          runtime: output.runtime,
          commandPath,
          startupPolicy: resolveCliStartupPolicy({ commandPath, jsonOutputMode: false }),
        }),
      ).rejects.toThrow("__exit__:1");
      expect(output.errors.join("\n")).toContain(REFUSAL);
      expect(output.errors.join("\n")).not.toContain("enforce_unwired");
    });
  });
});
