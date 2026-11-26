// Sovereign prompt reload is restart-only (#1321, design § 6.3): a generation loads once per
// process, so a switch change plans a restart; an agent added by hot reload stays hot and
// the runtime refuses it `not_loaded` until that restart (runtime.test.ts).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createEmptyPluginRegistry } from "../plugins/registry.js";
import { resetPluginRuntimeStateForTest, setActivePluginRegistry } from "../plugins/runtime.js";
import { diffGatewayReloadPaths } from "./config-diff.js";
import {
  buildGatewayReloadPlan,
  listConfigReloadRefinementPrefixes,
} from "./config-reload-plan.js";

const configWith = (entries: Record<string, Record<string, unknown>>) =>
  ({ agents: { entries } }) as OpenClawConfig;

function plan(prev: OpenClawConfig, next: OpenClawConfig) {
  const changed = diffGatewayReloadPaths(prev, next, listConfigReloadRefinementPrefixes());
  return buildGatewayReloadPlan(changed, { previousConfig: prev, candidateConfig: next });
}

describe("sovereign prompt reload policy", () => {
  beforeEach(() => setActivePluginRegistry(createEmptyPluginRegistry()));
  afterEach(() => resetPluginRuntimeStateForTest());

  it.each([
    [{}, { sovereignPrompts: { mode: "enforce" } }],
    [{ sovereignPrompts: { mode: "enforce" } }, { sovereignPrompts: { mode: "off" } }],
    [{ sovereignPrompts: { mode: "enforce" } }, {}],
  ])("a switch change on an existing agent plans a restart (%j -> %j)", (before, after) => {
    const result = plan(
      configWith({ main: { agentDir: "/agents/main", ...before } }),
      configWith({ main: { agentDir: "/agents/main", ...after } }),
    );
    expect(result.restartGateway).toBe(true);
    expect(
      result.restartReasons.every((path) =>
        path.startsWith("agents.entries.main.sovereignPrompts"),
      ),
    ).toBe(true);
  });

  it("a newly added enforce agent stays hot; the runtime guard refuses it until restart", () => {
    const result = plan(
      configWith({ main: { agentDir: "/agents/main" } }),
      configWith({
        main: { agentDir: "/agents/main" },
        late: { agentDir: "/agents/late", sovereignPrompts: { mode: "enforce" } },
      }),
    );
    expect(result.restartGateway).toBe(false);
  });
});
