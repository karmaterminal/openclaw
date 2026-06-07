// #952 execution proof: a continue_work re-entry for a SUBAGENT session must
// run the subagent's next turn PROMPTLY at the elected offset, driven directly
// through runHeartbeatOnce (the per-session executor) — NOT gated on a periodic
// heartbeat tick. On a quiet seat the periodic heartbeat loop can tick ~0 times
// in 30 min; the continuation must still fire. These tests drive runHeartbeatOnce
// with a continuation wake and assert getReplyFromConfig (the turn) actually runs
// for the subagent key, including when NO heartbeat agent is configured.
import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resolveMainSessionKey } from "../config/sessions.js";
import { runHeartbeatOnce } from "./heartbeat-runner.js";
import { installHeartbeatRunnerTestRuntime } from "./heartbeat-runner.test-harness.js";
import { type HeartbeatReplySpy, withTempHeartbeatSandbox } from "./heartbeat-runner.test-utils.js";
import { setHeartbeatsEnabled } from "./heartbeat-wake.js";
import { resetSystemEventsForTest } from "./system-events.js";

installHeartbeatRunnerTestRuntime();
afterEach(() => {
  resetSystemEventsForTest();
  setHeartbeatsEnabled(true);
});

const SUBAGENT_KEY = "agent:main:subagent:continuation-4b8c269e";

async function seedStore(storePath: string, mainSessionKey: string): Promise<void> {
  await fs.writeFile(
    storePath,
    JSON.stringify({
      [mainSessionKey]: {
        sessionId: "sid-main",
        updatedAt: Date.now(),
        lastChannel: "whatsapp",
        lastProvider: "whatsapp",
        lastTo: "120363401234567890@g.us",
      },
      [SUBAGENT_KEY]: {
        sessionId: "sid-subagent",
        updatedAt: Date.now(),
        lastChannel: "whatsapp",
        lastProvider: "whatsapp",
        lastTo: "120363409999999999@g.us",
      },
    }),
  );
}

describe("subagent continue_work re-drive (#952)", () => {
  it("runs the subagent's continuation turn even with NO heartbeat agent configured", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      // Dormant seat: no `heartbeat` block => the periodic scheduler is empty.
      const cfg: OpenClawConfig = {
        agents: { defaults: { workspace: tmpDir } },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      await seedStore(storePath, resolveMainSessionKey(cfg));
      replySpy.mockResolvedValue({ text: "hop-2 ran" });

      const result = await runHeartbeatOnce({
        cfg,
        sessionKey: SUBAGENT_KEY,
        reason: "continuation",
        intent: "immediate",
        deps: {
          getReplyFromConfig: replySpy,
          whatsapp: vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" }),
          getQueueSize: () => 0,
          isReplyRunActive: () => false,
          nowMs: () => 0,
        },
      });

      expect(result.status).toBe("ran");
      // The turn EXECUTED, and it re-entered the SUBAGENT session (not the parent).
      expect(replySpy).toHaveBeenCalledTimes(1);
      const [replyParams] = replySpy.mock.calls[0] as [{ SessionKey?: string }];
      expect(replyParams?.SessionKey).toBe(SUBAGENT_KEY);
    });
  });

  it("tags the continuation turn as a work-wake (not a periodic heartbeat)", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: { workspace: tmpDir, heartbeat: { every: "5m", target: "whatsapp" } },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      await seedStore(storePath, resolveMainSessionKey(cfg));
      replySpy.mockResolvedValue({ text: "hop-2 ran" });

      await runHeartbeatOnce({
        cfg,
        sessionKey: SUBAGENT_KEY,
        reason: "continuation",
        intent: "immediate",
        deps: {
          getReplyFromConfig: replySpy,
          whatsapp: vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" }),
          getQueueSize: () => 0,
          isReplyRunActive: () => false,
          nowMs: () => 0,
        },
      });

      expect(replySpy).toHaveBeenCalledTimes(1);
      const replyOpts = replySpy.mock.calls[0]?.[1] as { continuationTrigger?: string } | undefined;
      expect(replyOpts?.continuationTrigger).toBe("work-wake");
    });
  });

  it("skips a non-continuation subagent wake back to the parent (guard preserved)", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: { workspace: tmpDir, heartbeat: { every: "5m", target: "whatsapp" } },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const mainSessionKey = resolveMainSessionKey(cfg);
      await seedStore(storePath, mainSessionKey);
      replySpy.mockResolvedValue({ text: "alert" });

      await runHeartbeatOnce({
        cfg,
        sessionKey: SUBAGENT_KEY,
        // No continuation reason => the #746 exemption does not apply.
        deps: {
          getReplyFromConfig: replySpy,
          whatsapp: vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" }),
          getQueueSize: () => 0,
          nowMs: () => 0,
        },
      });

      expect(replySpy).toHaveBeenCalledTimes(1);
      const [replyParams] = replySpy.mock.calls[0] as [{ SessionKey?: string }];
      expect(replyParams?.SessionKey).toBe(mainSessionKey);
    });
  });
});

describe("subagent continue_work re-drive: decoupled from heartbeat-eligibility + active-hours (#952)", () => {
  async function driveAndAssertRan(
    cfg: OpenClawConfig,
    replySpy: HeartbeatReplySpy,
  ): Promise<void> {
    const result = await runHeartbeatOnce({
      cfg,
      sessionKey: SUBAGENT_KEY,
      reason: "continuation",
      intent: "immediate",
      deps: {
        getReplyFromConfig: replySpy,
        whatsapp: vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" }),
        getQueueSize: () => 0,
        isReplyRunActive: () => false,
        // Epoch (1970-01-01 00:00 UTC) is outside a 09:00-17:00 window.
        nowMs: () => 0,
      },
    });
    expect(result.status).toBe("ran");
    expect(replySpy).toHaveBeenCalledTimes(1);
    const [replyParams] = replySpy.mock.calls[0] as [{ SessionKey?: string }];
    expect(replyParams?.SessionKey).toBe(SUBAGENT_KEY);
  }

  it("runs hop-2 when heartbeats are globally disabled", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: { workspace: tmpDir, heartbeat: { every: "5m", target: "whatsapp" } },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      await seedStore(storePath, resolveMainSessionKey(cfg));
      replySpy.mockResolvedValue({ text: "hop-2 ran" });
      setHeartbeatsEnabled(false);
      await driveAndAssertRan(cfg, replySpy);
    });
  });

  it("runs hop-2 when explicit heartbeat agents exclude the parent agent", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: { workspace: tmpDir },
          // Explicit heartbeat agent list that does NOT include `main`.
          list: [{ id: "scribe", heartbeat: { every: "5m", target: "whatsapp" } }],
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      await seedStore(storePath, resolveMainSessionKey(cfg));
      replySpy.mockResolvedValue({ text: "hop-2 ran" });
      await driveAndAssertRan(cfg, replySpy);
    });
  });

  it("runs hop-2 with a zero/invalid heartbeat interval", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: { workspace: tmpDir, heartbeat: { every: "0", target: "whatsapp" } },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      await seedStore(storePath, resolveMainSessionKey(cfg));
      replySpy.mockResolvedValue({ text: "hop-2 ran" });
      await driveAndAssertRan(cfg, replySpy);
    });
  });

  it("runs hop-2 outside active-hours", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: {
              every: "5m",
              target: "whatsapp",
              activeHours: { start: "09:00", end: "17:00", timezone: "UTC" },
            },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      await seedStore(storePath, resolveMainSessionKey(cfg));
      replySpy.mockResolvedValue({ text: "hop-2 ran" });
      await driveAndAssertRan(cfg, replySpy);
    });
  });
});
