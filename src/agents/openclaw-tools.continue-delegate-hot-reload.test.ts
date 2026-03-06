import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeCompactionDelegates,
  consumePendingDelegates,
  pendingDelegateCount,
} from "../auto-reply/continuation-delegate-store.js";
import { createPerSenderSessionConfig } from "./test-helpers/session-config.js";

let configOverride: ReturnType<(typeof import("../config/config.js"))["loadConfig"]> = {
  session: createPerSenderSessionConfig(),
  agents: {
    defaults: {
      continuation: {
        enabled: true,
        maxDelegatesPerTurn: 5,
      },
    },
  },
};

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => configOverride,
    resolveGatewayPort: () => 18789,
  };
});

import "./test-helpers/fast-core-tools.js";
import { createOpenClawTools } from "./openclaw-tools.js";

describe("continue_delegate maxDelegatesPerTurn hot reload", () => {
  const sessionKey = "agent:main:telegram:dm:continue-delegate-hot-reload";

  beforeEach(() => {
    configOverride = {
      session: createPerSenderSessionConfig(),
      agents: {
        defaults: {
          continuation: {
            enabled: true,
            maxDelegatesPerTurn: 5,
          },
        },
      },
    };
    consumePendingDelegates(sessionKey);
    consumeCompactionDelegates(sessionKey);
  });

  it("re-reads maxDelegatesPerTurn at execution time without recreating the tool", async () => {
    const tool = createOpenClawTools({
      agentSessionKey: sessionKey,
      config: configOverride,
    }).find((candidate) => candidate.name === "continue_delegate");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("missing continue_delegate tool");
    }

    for (let i = 0; i < 5; i += 1) {
      const result = await tool.execute(`call-${i}`, { task: `delegate ${i + 1}` });
      expect(result.details).toMatchObject({ status: "scheduled", delegatesThisTurn: i + 1 });
    }

    const rejected = await tool.execute("call-rejected", { task: "delegate 6" });
    expect(rejected.details).toMatchObject({
      status: "error",
      limit: 5,
      dispatched: 5,
    });
    expect(pendingDelegateCount(sessionKey)).toBe(5);

    configOverride = {
      session: createPerSenderSessionConfig(),
      agents: {
        defaults: {
          continuation: {
            enabled: true,
            maxDelegatesPerTurn: 10,
          },
        },
      },
    };

    const accepted = await tool.execute("call-accepted", { task: "delegate 6" });
    expect(accepted.details).toMatchObject({
      status: "scheduled",
      delegatesThisTurn: 6,
      delegateIndex: 6,
    });
    expect(pendingDelegateCount(sessionKey)).toBe(6);
  });
});
