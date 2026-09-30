// Heartbeat runner continuation routing: an untrusted continuation reason on a
// subagent key is a classification hint, not routing provenance. Split from
// heartbeat-runner.returns-default-unset.test.ts to keep both under the test
// max-lines cap.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequireRecord } from "openclaw/plugin-sdk/test-fixtures";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resolveAgentIdFromSessionKey, resolveMainSessionKey } from "../config/sessions.js";
import { closeOpenClawAgentDatabasesAsync } from "../state/openclaw-agent-db.js";
import {
  closeOpenClawStateDatabaseByPathAsync,
  closeOpenClawStateDatabaseForTest,
} from "../state/openclaw-state-db.js";
import { resolveOpenClawStateSqlitePath } from "../state/openclaw-state-db.paths.js";
import { resetHeartbeatEventsForTest } from "./heartbeat-events.js";
import { type HeartbeatDeps, runHeartbeatOnce } from "./heartbeat-runner.js";
import { installHeartbeatRunnerTestRuntime } from "./heartbeat-runner.test-harness.js";
import { resetSystemEventsForTest } from "./system-events.js";

installHeartbeatRunnerTestRuntime();

let fixtureRoot = "";
let fixtureCount = 0;
let previousStateDir: string | undefined;

const createCaseDir = async (prefix: string) => {
  const dir = path.join(fixtureRoot, `${prefix}-${fixtureCount++}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const requireRecord = createRequireRecord("record", "expected-label-record");

function expectRecordFields(record: Record<string, unknown>, fields: Record<string, unknown>) {
  for (const [key, value] of Object.entries(fields)) {
    expect(record[key]).toEqual(value);
  }
}

function expectReplyCall(
  replySpy: ReturnType<typeof vi.fn>,
  index: number,
  bodyFields: Record<string, unknown>,
  optionsFields?: Record<string, unknown>,
  cfg?: OpenClawConfig,
) {
  const call = replySpy.mock.calls[index];
  if (!call) {
    throw new Error(`expected reply call ${index}`);
  }
  const body = requireRecord(call[0], `reply call ${index} body`);
  for (const [key, value] of Object.entries(bodyFields)) {
    if (value instanceof RegExp) {
      expect(String(body[key])).toMatch(value);
    } else {
      expect(body[key]).toEqual(value);
    }
  }
  if (optionsFields) {
    expectRecordFields(requireRecord(call[1], `reply call ${index} options`), optionsFields);
  }
  if (cfg) {
    expect(call[2]).toBe(cfg);
  }
}

beforeAll(async () => {
  fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-heartbeat-continuation-"));
  previousStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = path.join(fixtureRoot, "state");
});

beforeEach(() => {
  resetSystemEventsForTest();
  resetHeartbeatEventsForTest();
});

afterAll(async () => {
  if (fixtureRoot) {
    await closeOpenClawAgentDatabasesAsync(fixtureRoot);
    await closeOpenClawStateDatabaseByPathAsync(
      resolveOpenClawStateSqlitePath({ OPENCLAW_STATE_DIR: path.join(fixtureRoot, "state") }),
    );
  }
  closeOpenClawStateDatabaseForTest();
  if (previousStateDir === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = previousStateDir;
  }
  if (fixtureRoot) {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

describe("runHeartbeatOnce", () => {
  function createWhatsAppSendMock() {
    return vi
      .fn<
        (to: string, text: string, opts?: unknown) => Promise<{ messageId: string; toJid: string }>
      >()
      .mockResolvedValue({ messageId: "m1", toJid: "jid" });
  }

  const createHeartbeatDeps = (
    sendWhatsApp: (
      to: string,
      text: string,
      opts?: unknown,
    ) => Promise<{ messageId: string; toJid: string }>,
    options?: {
      nowMs?: number;
      getReplyFromConfig?: HeartbeatDeps["getReplyFromConfig"];
      listActiveEmbeddedRunSessionKeys?: HeartbeatDeps["listActiveEmbeddedRunSessionKeys"];
    },
  ): HeartbeatDeps => ({
    whatsapp: sendWhatsApp,
    getQueueSize: () => 0,
    nowMs: () => options?.nowMs ?? 0,
    webAuthExists: async () => true,
    hasActiveWebListener: () => true,
    ...(options?.getReplyFromConfig ? { getReplyFromConfig: options.getReplyFromConfig } : null),
    ...(options?.listActiveEmbeddedRunSessionKeys
      ? { listActiveEmbeddedRunSessionKeys: options.listActiveEmbeddedRunSessionKeys }
      : null),
  });

  it("falls back to main session for untrusted continuation reason with subagent key", async () => {
    const replySpy = vi.fn();
    try {
      const tmpDir = await createCaseDir("hb-subagent-continuation");
      const storePath = path.join(tmpDir, "sessions.json");
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: {
              every: "5m",
              target: "last",
            },
          },
        },
        channels: { whatsapp: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const mainSessionKey = resolveMainSessionKey(cfg);
      const agentId = resolveAgentIdFromSessionKey(mainSessionKey);
      const subagentKey = `agent:${agentId}:subagent:task-continuation`;

      await fs.writeFile(
        storePath,
        JSON.stringify({
          [mainSessionKey]: {
            sessionId: "sid-main",
            updatedAt: Date.now(),
            lastChannel: "whatsapp",
            lastTo: "fixture-main-heartbeat-destination",
          },
          [subagentKey]: {
            sessionId: "sid-subagent-cont",
            updatedAt: Date.now() + 10_000,
            lastChannel: "whatsapp",
            lastTo: "fixture-subagent-heartbeat-destination",
          },
        }),
      );

      replySpy.mockClear();
      replySpy.mockResolvedValue([{ text: "Continuation wake" }]);
      const sendWhatsApp = createWhatsAppSendMock();

      await runHeartbeatOnce({
        cfg,
        sessionKey: subagentKey,
        reason: "continuation",
        deps: createHeartbeatDeps(sendWhatsApp, { getReplyFromConfig: replySpy }),
      });

      // Untrusted continuation reasons are classification hints, not routing provenance.
      expectReplyCall(replySpy, 0, { SessionKey: mainSessionKey });
    } finally {
      replySpy.mockReset();
    }
  });
});
