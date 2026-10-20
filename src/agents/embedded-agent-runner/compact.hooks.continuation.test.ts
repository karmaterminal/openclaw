// Continuation coverage for embedded compaction: nested compaction tool rebuilds
// must not expose continuation tools to the maintenance run.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompactHooksSessionFixture } from "./compact.hooks.fixture.test-support.js";
import {
  createOpenClawCodingToolsMock,
  hookRunner,
  loadCompactHooksHarness,
  resolveModelMock,
  sessionCompactImpl,
  triggerInternalHookMock,
} from "./compact.hooks.harness.js";
import { createCompactHooksResolvedModel } from "./compact.hooks.metadata.test-support.js";

let compactEmbeddedAgentSessionDirect: typeof import("./compact.js").compactEmbeddedAgentSessionDirect;
let configRuntime: typeof import("../../config/runtime-snapshot.js");

let TEST_STORE_PATH: string;
let TEST_SESSION_ID: string;
const TEST_SESSION_KEY = "agent:main:session-1";
const compactionFixture = useCompactHooksSessionFixture(TEST_SESSION_KEY);
let TEST_WORKSPACE_DIR: string;
const TEST_CUSTOM_INSTRUCTIONS = "focus on decisions";

function expectRecordFields(record: unknown, expected: Record<string, unknown>) {
  if (!record || typeof record !== "object") {
    throw new Error("Expected record");
  }
  const actual = record as Record<string, unknown>;
  for (const [key, value] of Object.entries(expected)) {
    expect(actual[key]).toEqual(value);
  }
  return actual;
}

function mockCallArg(mock: ReturnType<typeof vi.fn>, callIndex = 0, argIndex = 0) {
  const call = mock.mock.calls[callIndex];
  if (!call) {
    throw new Error(`Expected mock call ${callIndex}`);
  }
  return call[argIndex];
}

function mockResolvedModel() {
  resolveModelMock.mockReset();
  resolveModelMock.mockImplementation((provider = "openai", modelId = "fake") =>
    createCompactHooksResolvedModel(provider, modelId),
  );
}

function wrappedCompactionArgs(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: TEST_SESSION_ID,
    sessionKey: TEST_SESSION_KEY,
    sessionFile: TEST_SESSION_KEY,
    sessionTarget: {
      agentId: "main",
      sessionId: TEST_SESSION_ID,
      sessionKey: TEST_SESSION_KEY,
      storePath: TEST_STORE_PATH,
    },
    workspaceDir: TEST_WORKSPACE_DIR,
    customInstructions: TEST_CUSTOM_INSTRUCTIONS,
    enqueue: async <T>(task: () => Promise<T> | T) => await task(),
    ...overrides,
  };
}

beforeAll(async () => {
  const loaded = await loadCompactHooksHarness();
  // getRuntimeConfig() reads only the published snapshot (#169714); load the
  // snapshot owner after the harness so both share one module graph.
  configRuntime = await import("../../config/runtime-snapshot.js");
  compactEmbeddedAgentSessionDirect = (params) =>
    loaded.compactEmbeddedAgentSessionDirect({ agentId: "main", ...params });
  TEST_STORE_PATH = await compactionFixture.prepare();
});

beforeEach(async () => {
  configRuntime.setRuntimeConfigSnapshot({});
  // prepareSession resets the harness, including its session-state mocks.
  ({ workspaceDir: TEST_WORKSPACE_DIR, sessionId: TEST_SESSION_ID } =
    await compactionFixture.prepareSession());
  triggerInternalHookMock.mockClear();
  hookRunner.hasHooks.mockReset();
  hookRunner.runBeforeCompaction.mockReset();
  hookRunner.runAfterCompaction.mockReset();
  mockResolvedModel();
  sessionCompactImpl.mockReset();
  sessionCompactImpl.mockResolvedValue({
    summary: "summary",
    firstKeptEntryId: "entry-1",
    tokensBefore: 120,
    details: { ok: true },
  });
});

afterEach(() => configRuntime.clearRuntimeConfigSnapshot());

describe("compactEmbeddedAgentSessionDirect continuation tools", () => {
  it("disables continuation tools when rebuilding nested compaction tools", async () => {
    await compactEmbeddedAgentSessionDirect(
      wrappedCompactionArgs({
        workspaceDir: "/tmp/workspace",
        sessionEntry: {
          sessionId: "session-1",
        },
      }),
    );

    expectRecordFields(mockCallArg(createOpenClawCodingToolsMock), {
      disableContinuationTools: true,
    });
  });
});
