// Durable session-state coverage for embedded compaction: persisted permission policy,
// selected runtime provider metadata, and legacy SQLite marker successors.

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  replaceSessionEntry,
  upsertSessionEntryCore,
} from "../../config/sessions/session-accessor.js";
import { useCompactHooksSessionFixture } from "./compact.hooks.fixture.test-support.js";
import { resolveSelectedOpenAIRuntimeProviderMock } from "./compact.hooks.harness-selection.test-support.js";
import {
  contextEngineCompactMock,
  createOpenClawCodingToolsMock,
  hookRunner,
  loadCompactHooksHarness,
  resetCompactSessionStateMocks,
  resolveContextEngineMock,
  resolveContextWindowInfoMock,
  resolveModelMock,
  sessionCompactImpl,
  triggerInternalHookMock,
} from "./compact.hooks.harness.js";
import {
  createCompactHooksAuthStorage,
  type CompactHooksQueuedCompaction,
} from "./compact.hooks.metadata.test-support.js";

let compactEmbeddedAgentSessionDirect: typeof import("./compact.js").compactEmbeddedAgentSessionDirect;
let compactEmbeddedAgentSession: CompactHooksQueuedCompaction;

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

function mockResolvedModel(params?: {
  supportsTools?: boolean;
  input?: string[];
  contextWindow?: number;
  requestTimeoutMs?: number;
}) {
  resolveModelMock.mockReset();
  resolveModelMock.mockImplementation(
    (provider = "openai", modelId = "fake", _agentDir?: string, cfg?: unknown) => {
      const providerConfig = (
        cfg as
          | {
              models?: {
                providers?: Record<string, { api?: string; baseUrl?: string }>;
              };
            }
          | undefined
      )?.models?.providers?.[provider];
      return {
        logicalRef: { provider, model: modelId },
        model: {
          provider,
          api: providerConfig?.api ?? "openai-responses",
          baseUrl: providerConfig?.baseUrl?.trim() || "https://api.openai.com/v1",
          id: modelId,
          input: params?.input ?? [],
          ...(params?.contextWindow === undefined ? {} : { contextWindow: params.contextWindow }),
          ...(params?.requestTimeoutMs === undefined
            ? {}
            : { requestTimeoutMs: params.requestTimeoutMs }),
          ...(params?.supportsTools === undefined
            ? {}
            : { compat: { supportsTools: params.supportsTools } }),
        },
        error: null,
        authStorage: createCompactHooksAuthStorage(),
        modelRegistry: {},
      };
    },
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
  compactEmbeddedAgentSessionDirect = (params) =>
    loaded.compactEmbeddedAgentSessionDirect({ agentId: "main", ...params });
  compactEmbeddedAgentSession = loaded.compactEmbeddedAgentSession;
  TEST_STORE_PATH = await compactionFixture.prepare();
});

beforeEach(async () => {
  ({ workspaceDir: TEST_WORKSPACE_DIR, sessionId: TEST_SESSION_ID } =
    await compactionFixture.prepareSession());
});

describe("compactEmbeddedAgentSessionDirect hooks", () => {
  beforeEach(() => {
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
    resetCompactSessionStateMocks();
  });

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

  it("preserves the recorded session permission policy when building compaction tools", async () => {
    await replaceSessionEntry(
      { agentId: "main", sessionKey: TEST_SESSION_KEY, storePath: TEST_STORE_PATH },
      {
        sessionId: TEST_SESSION_ID,
        updatedAt: 2,
        permissionMode: "full",
        sessionRoot: "/tmp/workspace",
      },
    );
    await compactEmbeddedAgentSessionDirect(
      wrappedCompactionArgs({
        workspaceDir: "/tmp/workspace",
        sessionEntry: {
          sessionId: "session-1",
          permissionMode: "full",
          sessionRoot: "/tmp/workspace",
        },
      }),
    );
    expectRecordFields(mockCallArg(createOpenClawCodingToolsMock), {
      sessionPermissionPolicy: { mode: "full", root: "/tmp/workspace" },
    });
  });

  it("prefers the latest persisted session permission policy", async () => {
    await upsertSessionEntryCore(
      { agentId: "main", sessionKey: TEST_SESSION_KEY, storePath: TEST_STORE_PATH },
      {
        sessionId: TEST_SESSION_ID,
        updatedAt: 2,
        permissionMode: "guarded",
        sessionRoot: join(TEST_WORKSPACE_DIR, "persisted-workspace"),
      },
    );

    await compactEmbeddedAgentSessionDirect(
      wrappedCompactionArgs({
        config: { tools: { exec: { mode: "deny" } } },
        permissionMode: "full",
        sessionRoot: join(TEST_WORKSPACE_DIR, "captured-workspace"),
        sessionEntry: {
          sessionId: TEST_SESSION_ID,
          permissionMode: "workspace",
          sessionRoot: join(TEST_WORKSPACE_DIR, "stale-workspace"),
        },
      }),
    );

    const toolOptions = expectRecordFields(mockCallArg(createOpenClawCodingToolsMock), {
      sessionPermissionPolicy: {
        mode: "guarded",
        root: join(TEST_WORKSPACE_DIR, "persisted-workspace"),
      },
    });
    expect(toolOptions.exec).toEqual(expect.objectContaining({ mode: "ask" }));
  });

  it("does not resurrect a captured permission policy cleared from durable state", async () => {
    await replaceSessionEntry(
      { agentId: "main", sessionKey: TEST_SESSION_KEY, storePath: TEST_STORE_PATH },
      {
        sessionId: TEST_SESSION_ID,
        updatedAt: 2,
      },
    );

    await compactEmbeddedAgentSessionDirect(
      wrappedCompactionArgs({
        permissionMode: "full",
        sessionRoot: join(TEST_WORKSPACE_DIR, "captured-workspace"),
        sessionEntry: {
          sessionId: TEST_SESSION_ID,
          permissionMode: "full",
          sessionRoot: join(TEST_WORKSPACE_DIR, "captured-workspace"),
        },
      }),
    );

    const toolOptions = expectRecordFields(mockCallArg(createOpenClawCodingToolsMock), {
      sessionPermissionPolicy: undefined,
    });
    expect(toolOptions.exec).not.toEqual(expect.objectContaining({ mode: expect.anything() }));
  });
});

describe("compactEmbeddedAgentSession hooks (ownsCompaction engine)", () => {
  function mockQueuedRouteAwareModel(
    defaultApi: "openai-responses" | "openai-chatgpt-responses" = "openai-responses",
  ) {
    resolveModelMock.mockImplementation(
      (provider = "openai", modelId = "gpt-5.5", _agentDir?: string, cfg?: unknown) => {
        const providerConfig = (
          cfg as
            | {
                models?: {
                  providers?: Record<string, { api?: string; baseUrl?: string }>;
                };
              }
            | undefined
        )?.models?.providers?.[provider];
        const api = providerConfig?.api ?? defaultApi;
        const subscription = api === "openai-chatgpt-responses";
        return {
          logicalRef: { provider, model: modelId },
          model: {
            provider,
            id: modelId,
            api,
            baseUrl:
              providerConfig?.baseUrl ??
              (subscription
                ? "https://chatgpt.com/backend-api/codex"
                : "https://api.openai.com/v1"),
            contextWindow: subscription ? 272_000 : 1_050_000,
            input: [],
          },
          error: null,
          authStorage: createCompactHooksAuthStorage(),
          modelRegistry: {},
        };
      },
    );
  }

  beforeEach(() => {
    hookRunner.hasHooks.mockReset();
    hookRunner.runBeforeCompaction.mockReset();
    hookRunner.runAfterCompaction.mockReset();
    resolveContextEngineMock.mockReset();
    resolveContextEngineMock.mockResolvedValue({
      info: { ownsCompaction: true },
      compact: contextEngineCompactMock,
    });
    contextEngineCompactMock.mockReset();
    contextEngineCompactMock.mockResolvedValue({
      ok: true,
      compacted: true,
      reason: undefined,
      result: { summary: "engine-summary", tokensBefore: 120, tokensAfter: 50 },
    });
    mockResolvedModel();
    mockQueuedRouteAwareModel();
  });

  it("resolves queued compaction model metadata through the selected runtime provider", async () => {
    resolveSelectedOpenAIRuntimeProviderMock.mockImplementation((params: { provider: string }) =>
      params.provider === "openai" ? "openai-runtime" : params.provider,
    );
    resolveModelMock.mockImplementation((_provider, modelId) => ({
      logicalRef: { provider: "openai-runtime", model: modelId ?? "fake" },
      model: {
        provider: "openai",
        api: "openai-responses",
        baseUrl: "https://api.openai.com/v1",
        id: modelId ?? "fake",
        input: [],
      },
      error: null,
      authStorage: createCompactHooksAuthStorage(),
      modelRegistry: {},
    }));

    const result = await compactEmbeddedAgentSession(
      wrappedCompactionArgs({
        provider: "openai",
        model: "gpt-5.5",
        agentHarnessId: "codex",
        config: {
          models: {
            providers: {
              openai: { models: [{ id: "gpt-5.5", contextWindow: 350_000 }] },
            },
          },
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(mockCallArg(resolveModelMock)).toBe("openai-runtime");
    expectRecordFields(mockCallArg(resolveContextWindowInfoMock), {
      provider: "openai-runtime",
      modelId: "gpt-5.5",
    });
    const compactArg = mockCallArg(contextEngineCompactMock) as {
      runtimeContext?: Record<string, unknown>;
    };
    expectRecordFields(compactArg.runtimeContext, {
      provider: "openai",
      runtimeProvider: "openai-runtime",
      model: "gpt-5.5",
    });
  });

  it("preserves a deprecated SQLite marker successor for legacy maintenance", async () => {
    const maintain = vi.fn(async (_params?: unknown) => ({
      changed: false,
      bytesFreed: 0,
      rewrittenEntries: 0,
    }));
    const delegatedSessionId = "delegated-marker-session";
    // Legacy marker resolution reads entries from the marker's store, so a
    // shared fixed path would let another run's entries pick the session key.
    const dir = await mkdtemp(join(tmpdir(), "openclaw-compaction-marker-legacy-"));
    const storePath = join(dir, "sessions.json");
    const marker = `sqlite:main:${delegatedSessionId}:${storePath}`;
    resolveContextEngineMock.mockResolvedValue({
      info: { ownsCompaction: false },
      compact: contextEngineCompactMock,
      maintain,
    } as never);
    contextEngineCompactMock.mockResolvedValue({
      ok: true,
      compacted: true,
      result: {
        sessionFile: marker,
        sessionId: delegatedSessionId,
      },
    } as never);

    try {
      await upsertSessionEntryCore(
        { agentId: "main", sessionKey: TEST_SESSION_KEY, storePath },
        { sessionId: TEST_SESSION_ID, updatedAt: 1 },
      );
      await compactEmbeddedAgentSession(
        wrappedCompactionArgs({
          sessionTarget: {
            agentId: "main",
            sessionId: TEST_SESSION_ID,
            sessionKey: TEST_SESSION_KEY,
            storePath,
          },
        }),
      );

      expectRecordFields(mockCallArg(maintain), {
        sessionFile: marker,
        sessionId: delegatedSessionId,
        sessionTarget: expect.objectContaining({
          sessionId: delegatedSessionId,
          storePath,
        }),
      });
    } finally {
      await compactionFixture.cleanupDirectory(dir);
    }
  });
});
