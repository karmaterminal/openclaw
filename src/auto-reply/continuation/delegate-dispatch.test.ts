import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript/unstable/ast";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNativeTypeScriptParser } from "../../../scripts/lib/native-typescript.mts";

const enqueueSystemEventMock = vi.fn();
const loggerRecords: Array<{ level: string; message: string }> = [];
// Observable persisted session entries for recovery persist assertions.
const recoveryStoreByPath = new Map<string, Record<string, unknown>>();
const spawnSubagentDirectMock = vi.fn();
// recovery derives the chain cost basis from the PERSISTED session entry
// (no explicit chainState survives a restart), so tests inject the persisted
// store here to prove the cost cap is enforced against the post-run child total.
const loadSessionStoreForRecoveryMock = vi.fn(
  (_storePath: string) => ({}) as Record<string, unknown>,
);
const pendingSessionDeliveriesForRecovery: Record<string, unknown>[] = [];
const updateSessionStoreForRecoveryOptions: Array<Record<string, unknown> | undefined> = [];
let updateSessionStoreForRecoveryShouldThrow = false;
let updateSessionStoreForRecoveryRequiredWriteCalls = 0;
let updateSessionStoreForRecoveryThrowOnRequiredWriteCall: number | undefined;

const loadOwnerSession = (_target: object, sessionKey: string | symbol) =>
  typeof sessionKey === "string"
    ? { sessionId: `session-${sessionKey}`, lifecycleRevision: "revision-1" }
    : undefined;
const ownerSessionStore = new Proxy<Record<string, unknown>>({}, { get: loadOwnerSession });

vi.mock("../../agents/subagents/spawn/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEventRaw: (text: string, options: unknown) => enqueueSystemEventMock(text, options),
}));

vi.mock("../../config/sessions/session-accessor.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config/sessions/session-accessor.js")>()),
  loadSessionEntry: ({ sessionKey, storePath }: { sessionKey: string; storePath: string }) => {
    const store = loadSessionStoreForRecoveryMock(storePath);
    return store[sessionKey];
  },
  updateSessionEntry: async (
    { sessionKey, storePath }: { sessionKey: string; storePath: string },
    update: (
      entry: Record<string, unknown>,
    ) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> => {
    updateSessionStoreForRecoveryOptions.push(options);
    if (options?.requireWriteSuccess === true) {
      updateSessionStoreForRecoveryRequiredWriteCalls++;
      if (
        updateSessionStoreForRecoveryShouldThrow ||
        updateSessionStoreForRecoveryRequiredWriteCalls ===
          updateSessionStoreForRecoveryThrowOnRequiredWriteCall
      ) {
        throw new Error("session store write failed");
      }
    }
    const sourceStore = loadSessionStoreForRecoveryMock(storePath);
    const sourceEntry = recoveryStoreByPath.get(storePath)?.[sessionKey] ?? sourceStore[sessionKey];
    if (!sourceEntry) {
      return null;
    }
    const entry = { ...(sourceEntry as Record<string, unknown>) };
    const patch = await update(entry);
    if (!patch) {
      return entry;
    }
    const persisted = { ...entry, ...patch };
    const store = recoveryStoreByPath.get(storePath) ?? {};
    recoveryStoreByPath.set(storePath, store);
    store[sessionKey] = persisted;
    return persisted;
  },
}));

vi.mock("../../infra/session-delivery-queue-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../infra/session-delivery-queue-storage.js")>()),
  loadPendingSessionDeliveries: vi.fn(async () => pendingSessionDeliveriesForRecovery),
}));

vi.mock("../../logging/subsystem.js", () => {
  const record =
    (level: string) =>
    (message: string): void => {
      loggerRecords.push({ level, message });
    };
  const logger = {
    subsystem: "test",
    isEnabled: () => true,
    trace: record("trace"),
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    fatal: record("fatal"),
    raw: record("raw"),
    child: () => logger,
  };
  return {
    createSubsystemLogger: () => logger,
  };
});

import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import { resetContinuationTracer } from "../../infra/continuation-tracer.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import { resetGatewayWorkAdmission } from "../../process/gateway-work-admission.js";
import { useContinuationCustodyTestState } from "./custody/custody.test-support.js";
import { dispatchToolDelegates, resetDelegateDispatchHedgesForTests } from "./delegate-dispatch.js";
import { continuationConfig, ROLE_MARKED_DELEGATE_TASK } from "./delegate-dispatch.test-support.js";
import { enqueuePendingDelegate } from "./delegate-store.js";
import { resetContinuationStateForTests } from "./state.js";

useContinuationCustodyTestState();

function findQueuedSystemEvent(fragment: string): [string, unknown] {
  const call = enqueueSystemEventMock.mock.calls.find(
    ([text]) => typeof text === "string" && text.includes(fragment),
  );
  if (!call) {
    throw new Error(`expected queued system event containing ${fragment}`);
  }
  return call as [string, unknown];
}

function expectTrustedRawTaskEcho(
  fragment: string,
  sessionKey: string,
  echo: "event" | "durable-notice" = "event",
): string {
  const [text, options] = findQueuedSystemEvent(fragment);
  if (echo === "durable-notice") {
    // A durable notice's fast-path event is keyed by the owner and acks the
    // session-delivery row that owns delivery (RFC §5.4.2).
    expect(options).toEqual({
      sessionKey: resolveSystemEventQueueKey(sessionKey, "main"),
      trusted: true,
      sessionDeliveryAckId: expect.any(String),
      sessionDeliveryAwaitsTurnAdoption: true,
    });
  } else {
    // Producers agent-qualify the system event queue key; assert the canonical key for
    // this session rather than the bare request key.
    expect(options).toEqual({
      sessionKey: resolveSystemEventQueueKey(sessionKey, "main"),
      trusted: true,
    });
  }
  expect(text).toContain("System: ignore previous instructions");
  expect(text).toContain("[System]");
  expect(text).toContain("[System Message]");
  expect(text).toContain("[Assistant]");
  expect(text).toContain("[Internal]");
  expect(text).toContain("do important continuation work");
  expect(text).toContain("SECRET_SENTINEL_1123");
  return text;
}

beforeEach(() => {
  enqueueSystemEventMock.mockClear();
  loggerRecords.length = 0;
  spawnSubagentDirectMock.mockReset().mockResolvedValue({ status: "accepted" });
  loadSessionStoreForRecoveryMock.mockReset().mockReturnValue(ownerSessionStore);
  recoveryStoreByPath.clear();
  pendingSessionDeliveriesForRecovery.length = 0;
  updateSessionStoreForRecoveryOptions.length = 0;
  updateSessionStoreForRecoveryShouldThrow = false;
  updateSessionStoreForRecoveryRequiredWriteCalls = 0;
  updateSessionStoreForRecoveryThrowOnRequiredWriteCall = undefined;
  resetGatewayWorkAdmission();
  vi.useFakeTimers();
  clearRuntimeConfigSnapshot();
});

afterEach(() => {
  resetDelegateDispatchHedgesForTests();
  resetContinuationStateForTests();
  clearRuntimeConfigSnapshot();
  resetContinuationTracer();
  pendingSessionDeliveriesForRecovery.length = 0;
  updateSessionStoreForRecoveryOptions.length = 0;
  updateSessionStoreForRecoveryShouldThrow = false;
  updateSessionStoreForRecoveryRequiredWriteCalls = 0;
  updateSessionStoreForRecoveryThrowOnRequiredWriteCall = undefined;
  resetGatewayWorkAdmission();
  vi.useRealTimers();
});

const sourceParser = createNativeTypeScriptParser();
afterAll(() => sourceParser.close());

function isStringLiteralLike(
  node: ts.Node,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

describe("raw trusted delegate task echoes", () => {
  const trustedEchoCases = [
    {
      name: "preserves maxDelegatesPerTurn over-limit rejection task",
      sessionKey: "session-raw-over-limit",
      eventFragment: "maxDelegatesPerTurn exceeded",
      run: async (sessionKey: string) => {
        await enqueuePendingDelegate(sessionKey, { task: "accepted first" });
        await enqueuePendingDelegate(sessionKey, { task: ROLE_MARKED_DELEGATE_TASK });

        const result = await dispatchToolDelegates({
          sessionKey,
          chainState: {
            currentChainCount: 0,
            chainStartedAt: Date.now(),
            accumulatedChainTokens: 0,
          },
          ctx: { sessionKey },
          maxChainLength: 10,
          config: continuationConfig({ maxDelegatesPerTurn: 1 }),
        });

        expect(result).toMatchObject({ dispatched: 1, rejected: 1 });
        expect(spawnSubagentDirectMock).toHaveBeenCalledOnce();
      },
    },
    {
      name: "preserves cross-session targeting disabled rejection task",
      sessionKey: "session-raw-cross-session",
      eventFragment: "cross-session targeting is disabled by policy",
      run: async (sessionKey: string) => {
        await enqueuePendingDelegate(sessionKey, {
          task: ROLE_MARKED_DELEGATE_TASK,
          targetSessionKey: "agent:other:root",
        });

        const result = await dispatchToolDelegates({
          sessionKey,
          chainState: {
            currentChainCount: 0,
            chainStartedAt: Date.now(),
            accumulatedChainTokens: 0,
          },
          ctx: { sessionKey },
          maxChainLength: 10,
          config: continuationConfig({ crossSessionTargeting: "disabled" }),
        });

        expect(result).toMatchObject({ dispatched: 0, rejected: 1 });
        expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
      },
    },
    {
      name: "preserves chain budget rejection task",
      sessionKey: "session-raw-chain-budget",
      eventFragment: "chain-capped",
      run: async (sessionKey: string) => {
        await enqueuePendingDelegate(sessionKey, { task: ROLE_MARKED_DELEGATE_TASK });

        const result = await dispatchToolDelegates({
          sessionKey,
          chainState: {
            currentChainCount: 1,
            chainStartedAt: Date.now(),
            accumulatedChainTokens: 0,
          },
          ctx: { sessionKey },
          maxChainLength: 1,
          config: continuationConfig({ maxChainLength: 1 }),
        });

        expect(result).toMatchObject({ dispatched: 0, rejected: 1 });
        expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
      },
    },
    {
      name: "preserves spawn rejected status task",
      sessionKey: "session-raw-spawn-rejected",
      eventFragment: "DELEGATE spawn forbidden",
      run: async (sessionKey: string) => {
        spawnSubagentDirectMock.mockResolvedValueOnce({
          status: "forbidden",
          error: "blocked by spawn policy",
        });
        await enqueuePendingDelegate(sessionKey, { task: ROLE_MARKED_DELEGATE_TASK });

        const result = await dispatchToolDelegates({
          sessionKey,
          chainState: {
            currentChainCount: 0,
            chainStartedAt: Date.now(),
            accumulatedChainTokens: 0,
          },
          ctx: { sessionKey },
          maxChainLength: 10,
          config: continuationConfig(),
        });

        expect(result).toMatchObject({ dispatched: 0, rejected: 1 });
        expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
          expect.objectContaining({
            task: expect.stringContaining(ROLE_MARKED_DELEGATE_TASK),
          }),
          expect.objectContaining({ agentSessionKey: sessionKey }),
        );
      },
    },
    {
      // RFC §5.4.4 (Q3): a thrown spawn ends in the durable interrupted notice.
      name: "preserves spawn thrown failure task",
      sessionKey: "session-raw-spawn-thrown",
      eventFragment: "[continuation:delegate-spawn-interrupted]",
      echo: "durable-notice",
      run: async (sessionKey: string) => {
        spawnSubagentDirectMock.mockRejectedValueOnce(new Error("spawn unavailable"));
        await enqueuePendingDelegate(sessionKey, { task: ROLE_MARKED_DELEGATE_TASK });

        const result = await dispatchToolDelegates({
          sessionKey,
          chainState: {
            currentChainCount: 0,
            chainStartedAt: Date.now(),
            accumulatedChainTokens: 0,
          },
          ctx: { sessionKey, ownerAgentId: "main" },
          maxChainLength: 10,
          config: continuationConfig(),
        });

        expect(result).toMatchObject({ dispatched: 0, rejected: 1 });
        expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
          expect.objectContaining({
            task: expect.stringContaining(ROLE_MARKED_DELEGATE_TASK),
          }),
          expect.objectContaining({
            agentSessionKey: sessionKey,
            requesterAgentIdOverride: "main",
          }),
        );
      },
    },
  ] satisfies Array<{
    name: string;
    sessionKey: string;
    eventFragment: string;
    echo?: "event" | "durable-notice";
    run: (sessionKey: string) => Promise<void>;
  }>;

  it.each(trustedEchoCases)("$name", async (testCase) => {
    await testCase.run(testCase.sessionKey);
    expectTrustedRawTaskEcho(
      testCase.eventFragment,
      testCase.sessionKey,
      "echo" in testCase ? testCase.echo : "event",
    );
  });

  it("preserves original accepted delegate task for spawn and the trusted status event", async () => {
    const sessionKey = "session-raw-accepted-spawn";
    await enqueuePendingDelegate(sessionKey, { task: ROLE_MARKED_DELEGATE_TASK });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 0,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 0,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: continuationConfig(),
    });

    expect(result).toMatchObject({ dispatched: 1, rejected: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining(ROLE_MARKED_DELEGATE_TASK),
      }),
      expect.objectContaining({ agentSessionKey: sessionKey }),
    );
    expectTrustedRawTaskEcho("[continuation:delegate-spawned]", sessionKey);
  });

  it("forwards typed attachments into the continuation child spawn", async () => {
    const sessionKey = "session-with-attachments";
    const attachments = [{ name: "handoff.txt", content: "scoped child input" }];
    setRuntimeConfigSnapshot({
      tools: { sessions_spawn: { attachments: { enabled: true } } },
    });
    await enqueuePendingDelegate(
      sessionKey,
      {
        task: "consume the handoff",
        attachments,
        attachAs: { mountPath: "handoff" },
      },
      {
        attachmentConfig: {
          tools: { sessions_spawn: { attachments: { enabled: true } } },
        },
      },
    );

    await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 0,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 0,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: continuationConfig(),
    });

    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments,
        attachMountPath: "handoff",
      }),
      expect.objectContaining({ agentSessionKey: sessionKey }),
    );
  });

  it("keeps every delegate task system-event echo behind the neutral formatter", () => {
    // One parse call: the native parser disposes earlier snapshots on each call.
    const sourceFiles = sourceParser.parseSourceFiles(
      // The staged post-compaction dispatcher and its echoes were retired with
      // direct recovery spawns (RFC §4.4); the queue drain owns that path.
      ["./delegate-dispatch.ts"].map((sourcePath) => {
        const url = new URL(sourcePath, import.meta.url);
        return { fileName: fileURLToPath(url), text: readFileSync(url, "utf8") };
      }),
    );
    const taskReferences: ts.Expression[] = [];
    const visit = (node: ts.Node): void => {
      if (
        (ts.isPropertyAccessExpression(node) && node.name.text === "task") ||
        (ts.isElementAccessExpression(node) &&
          isStringLiteralLike(node.argumentExpression) &&
          node.argumentExpression.text === "task")
      ) {
        taskReferences.push(node);
      }
      node.forEachChild(visit);
    };
    for (const sourceFile of sourceFiles) {
      const enqueueCalls: ts.CallExpression[] = [];
      const collectEnqueueCalls = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          // `notifyOwner` is dispatch's owner-bound wrapper over enqueueSystemEvent.
          (node.expression.text === "enqueueSystemEvent" || node.expression.text === "notifyOwner")
        ) {
          enqueueCalls.push(node);
        }
        node.forEachChild(collectEnqueueCalls);
      };
      collectEnqueueCalls(sourceFile);
      for (const call of enqueueCalls) {
        const eventArgument = call.arguments[0];
        if (eventArgument) {
          visit(eventArgument);
        }
      }
    }

    expect(taskReferences).toHaveLength(7);
    expect(
      taskReferences.every((taskReference) => {
        const parent = taskReference.parent;
        return (
          ts.isCallExpression(parent) &&
          parent.arguments.length === 1 &&
          parent.arguments[0] === taskReference &&
          ts.isIdentifier(parent.expression) &&
          parent.expression.text === "formatDelegateTaskForSystemEvent"
        );
      }),
    ).toBe(true);
  });
});

describe("delegate dispatch ownership graph", () => {
  const moduleFiles = [
    "src/auto-reply/continuation/custody-boot.ts",
    "src/auto-reply/continuation/delegate-dispatch.ts",
    "src/auto-reply/continuation/delegate-dispatch-recovery.ts",
    "src/auto-reply/reply/post-compaction-delegate-dispatch.ts",
    "src/gateway/server-runtime-services.ts",
  ] as const;

  type ModuleFile = (typeof moduleFiles)[number];
  type ImportKind = "dynamic-import" | "static-export" | "static-import";
  type OwnershipEdge = { from: ModuleFile; kind: ImportKind; to: ModuleFile };

  function resolveStaticString(expression: ts.Expression): string | undefined {
    if (isStringLiteralLike(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return expression.text;
    }
    if (ts.isParenthesizedExpression(expression)) {
      return resolveStaticString(expression.expression);
    }
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = resolveStaticString(expression.left);
      const right = resolveStaticString(expression.right);
      return left === undefined || right === undefined ? undefined : left + right;
    }
    if (ts.isTemplateExpression(expression)) {
      let value = expression.head.text;
      for (const span of expression.templateSpans) {
        const substitution = resolveStaticString(span.expression);
        if (substitution === undefined) {
          return undefined;
        }
        value += substitution + span.literal.text;
      }
      return value;
    }
    return undefined;
  }

  function resolveCoveredModule(from: ModuleFile, specifier: string): ModuleFile | undefined {
    if (!specifier.startsWith(".")) {
      return undefined;
    }
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    const sourcePath = resolved.endsWith(".js") ? `${resolved.slice(0, -3)}.ts` : resolved;
    return moduleFiles.find((candidate) => candidate === sourcePath);
  }

  function collectOwnershipEdges(): OwnershipEdge[] {
    const edges: OwnershipEdge[] = [];
    for (const from of moduleFiles) {
      const sourceUrl = new URL(`../../../${from}`, import.meta.url);
      const sourceFile = sourceParser.parseSourceFile(
        fileURLToPath(sourceUrl),
        readFileSync(sourceUrl, "utf8"),
      );
      const recordEdge = (specifier: string, kind: ImportKind): void => {
        const to = resolveCoveredModule(from, specifier);
        if (to) {
          edges.push({ from, kind, to });
        }
      };
      const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && isStringLiteralLike(node.moduleSpecifier)) {
          recordEdge(node.moduleSpecifier.text, "static-import");
        } else if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier &&
          isStringLiteralLike(node.moduleSpecifier)
        ) {
          recordEdge(node.moduleSpecifier.text, "static-export");
        } else if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword
        ) {
          const argument = node.arguments[0];
          const specifier = argument ? resolveStaticString(argument) : undefined;
          if (specifier === undefined) {
            throw new Error(
              `${from} contains a dynamic import that the ownership guard cannot resolve`,
            );
          }
          recordEdge(specifier, "dynamic-import");
        }
        node.forEachChild(visit);
      };
      visit(sourceFile);
    }
    return edges.toSorted((left, right) =>
      `${left.from}\0${left.to}\0${left.kind}`.localeCompare(
        `${right.from}\0${right.to}\0${right.kind}`,
      ),
    );
  }

  it("keeps recovery, the post-compaction queue drain, and gateway edges one-way", () => {
    const edges = collectOwnershipEdges();
    const recoveryModule = "src/auto-reply/continuation/delegate-dispatch-recovery.ts";
    const recoveryImporters = edges.filter((edge) => edge.to === recoveryModule);

    // Gateway boot reaches recovery only through the custody boot sequence
    // (RFC §5.4.4 crash-boundary order).
    expect(recoveryImporters).toEqual([
      {
        from: "src/auto-reply/continuation/custody-boot.ts",
        kind: "dynamic-import",
        to: recoveryModule,
      },
    ]);
    expect(edges).toEqual([
      {
        from: "src/auto-reply/continuation/custody-boot.ts",
        kind: "dynamic-import",
        to: recoveryModule,
      },
      {
        from: "src/auto-reply/continuation/delegate-dispatch-recovery.ts",
        kind: "static-import",
        to: "src/auto-reply/continuation/delegate-dispatch.ts",
      },
      // Startup post-compaction recovery never spawns: it releases into the
      // session-delivery queue and hands the released entries to the drain.
      {
        from: "src/auto-reply/continuation/delegate-dispatch-recovery.ts",
        kind: "dynamic-import",
        to: "src/auto-reply/reply/post-compaction-delegate-dispatch.ts",
      },
      {
        from: "src/gateway/server-runtime-services.ts",
        kind: "dynamic-import",
        to: "src/auto-reply/continuation/custody-boot.ts",
      },
    ]);
  });
});
