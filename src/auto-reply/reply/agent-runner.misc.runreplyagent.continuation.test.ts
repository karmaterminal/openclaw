import fs from "node:fs/promises";
import path from "node:path";
// Tests continuation-owned run-reply-agent behaviors (silent continuation replies, post-compaction notices).
import { createRequireRecord } from "openclaw/plugin-sdk/test-fixtures";
import { describe, expect, it, vi } from "vitest";
import { setRuntimeConfigSnapshot } from "../../config/config.js";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import { peekSystemEvents } from "../../infra/system-events.js";
import {
  rootDir,
  runEmbeddedAgentMock,
  setupAgentRunnerTestHooks,
  tempDirs,
} from "./agent-runner.misc.runreplyagent.test-support.js";
import { createBaseRun } from "./agent-runner.runreplyagent.test-support.js";
import { scheduleFollowupDrain } from "./queue.js";

const requireRecord = createRequireRecord("record", "expected-label-object");

// Hoist mocks before static dependencies, mirroring agent-runner.misc.runreplyagent.test.ts.
await vi.hoisted(async () => {
  await import("./agent-runner.misc.runreplyagent.test-support.js");
});

setupAgentRunnerTestHooks();

describe("runReplyAgent auto-compaction token update", () => {
  async function runEmptyDirectReply(
    agentResult: Record<string, unknown>,
    options?: {
      agentEvents?: Array<{ stream: string; data: Record<string, unknown> }>;
      config?: OpenClawConfig;
      isHeartbeat?: boolean;
      onBlockReply?: (payload: unknown) => Promise<void> | void;
      reasoningPayloadsEnabled?: boolean;
      onAgentRunTerminalOutcome?: (outcome: "completed" | "failed") => void;
    },
  ) {
    const sessionKey = "main";
    const sessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 50_000,
    };
    const resultMeta = requireRecord(agentResult.meta, "agent result meta");
    const agentMeta = requireRecord(resultMeta.agentMeta, "agent result agent meta");
    runEmbeddedAgentMock.mockImplementationOnce(async (params) => {
      const onAgentEvent = requireRecord(params, "embedded agent params").onAgentEvent;
      if (typeof onAgentEvent === "function") {
        for (const event of options?.agentEvents ?? []) {
          await onAgentEvent(event);
        }
      }
      return {
        payloads: [],
        ...agentResult,
        meta: {
          ...resultMeta,
          agentMeta: {
            provider: "anthropic",
            model: "claude",
            ...agentMeta,
          },
          finalAssistantVisibleText: "",
        },
      };
    });

    if (options?.config) {
      setRuntimeConfigSnapshot(options.config);
    }
    return createBaseRun({
      run: {
        agentId: "main",
        agentDir: path.join(rootDir, "agent"),
        config: options?.config ?? {},
        reasoningLevel: "on",
      },
      reply: {
        opts:
          options?.onBlockReply ||
          options?.isHeartbeat ||
          options?.reasoningPayloadsEnabled ||
          options?.onAgentRunTerminalOutcome
            ? {
                ...(options.onBlockReply ? { onBlockReply: options.onBlockReply } : {}),
                ...(options.isHeartbeat ? { isHeartbeat: true } : {}),
                ...(options.reasoningPayloadsEnabled ? { reasoningPayloadsEnabled: true } : {}),
                ...(options.onAgentRunTerminalOutcome
                  ? { onAgentRunTerminalOutcome: options.onAgentRunTerminalOutcome }
                  : {}),
              }
            : undefined,
        sessionEntry,
        sessionStore: { [sessionKey]: sessionEntry },
        sessionKey,
      },
    }).run();
  }

  it("keeps continuation-only direct replies silent", async () => {
    const result = await runEmptyDirectReply(
      {
        payloads: [],
        meta: { agentMeta: {}, finalAssistantRawText: "CONTINUE_WORK:5" },
      },
      {
        config: {
          agents: {
            defaults: {
              continuation: { enabled: true },
            },
          },
        },
      },
    );

    expect(result).toBeUndefined();
  });

  it("keeps empty heartbeat replies silent", async () => {
    const result = await runEmptyDirectReply(
      { meta: { agentMeta: {} } },
      { isHeartbeat: true, reasoningPayloadsEnabled: true },
    );

    expect(result).toBeUndefined();
  });

  it("loads post-compaction context before starting a queued followup drain", async () => {
    const workspaceDir = tempDirs.make("openclaw-post-compaction-queued-followup-");
    await fs.writeFile(
      path.join(workspaceDir, "AGENTS.md"),
      "## Session Startup\nRead the queued workspace startup file.\n\n## Red Lines\nNever skip startup context after compaction.\n",
      "utf-8",
    );
    const sessionKey = "main";
    const sessionEntry = { sessionId: "session", updatedAt: Date.now(), totalTokens: 50_000 };
    runEmbeddedAgentMock.mockImplementationOnce(async (params) => {
      const onAgentEvent = requireRecord(params, "embedded agent params").onAgentEvent;
      if (typeof onAgentEvent === "function") {
        await onAgentEvent({ stream: "compaction", data: { phase: "start" } });
        await onAgentEvent({ stream: "compaction", data: { phase: "end", completed: true } });
      }
      return { payloads: [{ text: "ok" }], meta: { agentMeta: {} } };
    });

    vi.mocked(scheduleFollowupDrain).mockImplementation((key) => {
      const events = peekSystemEvents(resolveSystemEventQueueKey(key, "main"));
      expect(events).toHaveLength(2);
      expect(events[0]).toContain("Read the queued workspace startup file.");
      expect(events[0]).toContain("Never skip startup context after compaction.");
      expect(events[1]).toContain("[system:post-compaction] Session compacted");
      expect(events[1]).toContain("Queued 0 post-compaction delegate(s)");
    });

    await createBaseRun({
      run: {
        agentId: "main",
        agentDir: path.join(rootDir, "agent"),
        workspaceDir,
        reasoningLevel: "on",
        config: {
          agents: {
            defaults: {
              compaction: { postCompactionSections: ["Session Startup", "Red Lines"] },
            },
          },
        },
      },
      reply: {
        sessionEntry,
        sessionStore: { [sessionKey]: sessionEntry },
        sessionKey,
      },
    }).run();

    expect(scheduleFollowupDrain).toHaveBeenCalledTimes(1);
  });
});
