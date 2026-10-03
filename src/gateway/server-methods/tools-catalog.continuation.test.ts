/**
 * Continuation coverage: the tools.catalog "Disable All" deny list must remove every
 * continuation tool from a real continuation-enabled agent tool set.
 */

import { expectDefined } from "@openclaw/normalization-core";
import { describe, expect, it, vi } from "vitest";
import { createOpenClawCodingTools } from "../../agents/agent-tools.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import * as userProfileList from "../../state/user-profile-list.js";
import { toolsCatalogHandlers } from "./tools-catalog.js";

const CONTINUATION_TOOL_NAMES = [
  "continue_work",
  "continue_delegate",
  "request_compaction",
] as const;

const OPENCLAW_ONLY_PLAN = {
  includeBaseCodingTools: false,
  includeShellTools: false,
  includeChannelTools: false,
  includeOpenClawTools: true,
  includePluginTools: false,
};

async function readCatalogToolIds(config: OpenClawConfig): Promise<string[]> {
  const respond = vi.fn();
  await expectDefined(
    toolsCatalogHandlers["tools.catalog"],
    'toolsCatalogHandlers["tools.catalog"] test invariant',
  )({
    params: { includePlugins: false },
    respond: respond as never,
    context: { getRuntimeConfig: () => config } as never,
    client: null,
    req: { type: "req", id: "req-1", method: "tools.catalog" },
    isWebchatConnect: () => false,
  });
  const [ok, payload] = respond.mock.calls[0] as [
    boolean,
    { groups: { tools: { id: string }[] }[] },
  ];
  expect(ok).toBe(true);
  return payload.groups.flatMap((group) => group.tools.map((tool) => tool.id));
}

function buildContinuationToolNames(config: OpenClawConfig): string[] {
  return createOpenClawCodingTools({
    config,
    agentId: "main",
    sessionKey: "agent:main:main",
    workspaceDir: "/tmp/openclaw-catalog-continuation-workspace",
    continueWorkOpts: { requestContinuation: () => {} },
    requestCompactionOpts: {
      sessionId: "s-main",
      getContextUsage: () => null,
      triggerCompaction: async () => ({ ok: false, compacted: false, reason: "test" }),
    },
    toolConstructionPlan: OPENCLAW_ONLY_PLAN,
  })
    .map((tool) => tool.name)
    .filter((name) => (CONTINUATION_TOOL_NAMES as readonly string[]).includes(name));
}

// Building the real openclaw tool family loads the full tool dependency graph.
describe("tools.catalog Disable All for continuation tools", { timeout: 240000 }, () => {
  it("denies every continuation tool in a continuation-enabled runtime tool set", async () => {
    const identityCount = vi
      .spyOn(userProfileList, "hasMultipleSessionSharingIdentities")
      .mockReturnValue(false);
    try {
      const baseConfig: OpenClawConfig = {
        agents: {
          defaults: { continuation: { enabled: true } },
          list: [{ id: "main" }],
        },
      };
      // Control: without the deny list the runtime registers all five tools.
      expect(buildContinuationToolNames(baseConfig).toSorted()).toEqual(
        [...CONTINUATION_TOOL_NAMES].toSorted(),
      );

      // The catalog's Disable All writes every catalog id into the agent deny list.
      const disabledConfig: OpenClawConfig = {
        agents: {
          defaults: { continuation: { enabled: true } },
          list: [{ id: "main", tools: { deny: await readCatalogToolIds(baseConfig) } }],
        },
      };
      expect(buildContinuationToolNames(disabledConfig)).toEqual([]);
    } finally {
      identityCount.mockRestore();
    }
  });
});
