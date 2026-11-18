// Gateway start loads each enforce agent's sovereign generation (#1321, design § 6.1, § 10.2):
// before connections attach, one content-free status entry per agent, a broken agent
// refused without taking the Gateway down, and the status method reporting both.
import fs from "node:fs";
import { expect, it, vi } from "vitest";
import {
  describeSovereignPromptStatus,
  resetSovereignPromptRuntimeForTests,
} from "../agents/sovereign-prompts/runtime.js";
import {
  SENTINEL,
  writeAgentGeneration,
} from "../agents/sovereign-prompts/sovereign-fixture.test-support.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { getFreePort } from "../test-utils/ports.js";
import { healthHandlers } from "./server-methods/health.js";
import { startGatewayServerCore } from "./server-start.js";
import { createPluginEnabledGatewayTestEnv } from "./test-helpers.env.js";

it("loads sovereign generations at start, refuses only the broken agent and stays up", async () => {
  resetSovereignPromptRuntimeForTests();
  const token = "sovereign-startup-token";
  const state = await createOpenClawTestState({
    label: "sovereign-startup",
    env: createPluginEnabledGatewayTestEnv(),
  });
  const agentDir = (id: string) => {
    const dir = state.path(`sovereign-agents/${id}`);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  };
  const good = agentDir("good");
  writeAgentGeneration(good, "good");
  const broken = agentDir("broken");
  writeAgentGeneration(broken, "broken", { files: { "safety-section.md": "" } });
  const config: OpenClawConfig = {
    agents: {
      ownership: "explicit",
      entries: {
        main: {},
        good: { agentDir: good, sovereignPrompts: { mode: "enforce" } },
        broken: { agentDir: broken, sovereignPrompts: { mode: "enforce" } },
      },
    },
    gateway: { auth: { mode: "token", token } },
  };
  let server: Awaited<ReturnType<typeof startGatewayServerCore>> | undefined;
  try {
    await state.writeConfig(config);
    server = await startGatewayServerCore(await getFreePort(), {
      bind: "loopback",
      auth: { mode: "token", token },
      controlUiEnabled: false,
    });
    await server.startupSettled;
    // Nothing rendered a prompt, so these entries come from the start-time load.
    const status = describeSovereignPromptStatus();
    expect(status).toEqual([
      expect.objectContaining({ agentId: "good", state: "loaded" }),
      expect.objectContaining({ agentId: "broken", state: "refused", code: "required_empty" }),
    ]);
    const respond = vi.fn();
    await healthHandlers.status?.({
      req: {} as never,
      params: {},
      respond: respond as never,
      context: {} as never,
      client: { connect: { role: "operator", scopes: ["operator.read"] } } as never,
      isWebchatConnect: () => false,
    });
    const payload = respond.mock.calls[0]?.[1] as { sovereignPrompts?: unknown } | undefined;
    expect(payload?.sovereignPrompts).toEqual(status);
    const printed = JSON.stringify(payload?.sovereignPrompts);
    expect(printed).not.toContain(SENTINEL);
    expect(printed).not.toContain(good);
  } finally {
    await server?.close({ reason: "sovereign startup test complete" });
    await state.cleanup();
    resetSovereignPromptRuntimeForTests();
  }
}, 90_000);
