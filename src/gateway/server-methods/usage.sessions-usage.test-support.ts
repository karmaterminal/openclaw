import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";
import type { SessionEntry } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveUsageSessionSource } from "../../infra/session-cost-usage.js";
import { withTestDir } from "../../test-helpers/temp-dir.js";
import { withEnvAsync } from "../../test-utils/env.js";
import { resolveGatewaySessionStoreTargetInWorker } from "../session-utils-store-worker.js";

export const TEST_RUNTIME_CONFIG = {
  agents: {
    ownership: "explicit",
    defaults: { systemAgent: { agentId: "main" } },
    entries: { main: {}, opus: {} },
  },
  session: {},
} satisfies OpenClawConfig;

function requireUsageMockCall(
  mockFn: ReturnType<typeof vi.fn>,
  callIndex = 0,
): ReadonlyArray<unknown> {
  const call = mockFn.mock.calls[callIndex];
  if (!call) {
    throw new Error(`expected mock call ${callIndex + 1}`);
  }
  return call;
}

export function getUsageMockArg(
  mockFn: ReturnType<typeof vi.fn>,
  callIndex: number,
  argIndex: number,
) {
  return requireUsageMockCall(mockFn, callIndex)[argIndex];
}

export function mockStoredUsageSession(
  key: string,
  sessionId: string,
  options: {
    agentId?: string;
    resolution?: "valid" | "missing";
    storePath?: string;
  } = {},
) {
  const entry: SessionEntry = { sessionId, updatedAt: 1_000 };
  const agentId = options.agentId ?? "opus";
  const storePath = options.storePath ?? `/tmp/agents/${agentId}/agent/openclaw-agent.sqlite`;
  vi.mocked(resolveGatewaySessionStoreTargetInWorker).mockResolvedValueOnce({
    agentId,
    canonicalKey: key,
    store: { [key]: entry },
    storeKeys: [key],
    storePath,
  });
  vi.mocked(resolveUsageSessionSource).mockResolvedValueOnce(
    options.resolution === "missing"
      ? undefined
      : { entry, sessionFile: `sqlite:${agentId}:${sessionId}:${storePath}` },
  );
  return entry;
}

export async function withUsageTestState(
  run: (writeSessionFile: (fileName: string) => string) => Promise<void>,
) {
  await withTestDir({ prefix: "openclaw-usage-test-" }, async (stateDir) => {
    const agentSessionsDir = path.join(stateDir, "agents", "opus", "sessions");
    const writeSessionFile = (fileName: string) => {
      const sessionFile = path.join(agentSessionsDir, fileName);
      fs.writeFileSync(sessionFile, "", "utf-8");
      return sessionFile;
    };
    await withEnvAsync({ OPENCLAW_STATE_DIR: stateDir }, async () => {
      fs.mkdirSync(agentSessionsDir, { recursive: true });
      await run(writeSessionFile);
    });
  });
}
