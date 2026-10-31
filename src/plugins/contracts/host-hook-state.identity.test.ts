import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeHostDataSql } from "../../../test/helpers/sqlite-statement-execution-counter.js";
import { resolvePromptBuildHookResult } from "../../agents/embedded-agent-runner/run/attempt-prompt-helpers.js";
import { resolveSessionStorePathCore } from "../../config/sessions/paths.js";
import {
  loadSessionEntryReadOnly as readEntry,
  replaceSessionEntry as writeEntry,
  resolveSessionEntryAccessTarget as accessTarget,
} from "../../config/sessions/session-accessor.entry.js";
import { SessionCanonicalKeyMigrationRequiredError } from "../../config/sessions/session-canonical-row.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { openOpenClawAgentDatabase } from "../../state/openclaw-agent-db.js";
import { createOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { normalizeSessionDeliveryState as deliveryState } from "../../utils/delivery-context.shared.js";
import {
  drainPluginNextTurnInjectionContext as drain,
  enqueuePluginNextTurnInjection,
  getPluginNextTurnInjectionState,
  withdrawPluginNextTurnInjection,
} from "../host-hook-state.js";
import { createEmptyPluginRegistry } from "../registry-empty.js";
import { clearActivePluginRegistry, setActivePluginRegistry } from "../runtime.js";
import { createPluginRecord } from "../status.test-helpers.js";

describe("next-turn injection identity", () => {
  let state: Awaited<ReturnType<typeof createOpenClawTestState>>;
  function sessionScope(cfg: OpenClawConfig, agentId: string, sessionKey: string) {
    const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId, env: state.env });
    return { agentId, sessionKey, storePath };
  }
  async function expectContext(params: Parameters<typeof drain>[0], prependContext: string) {
    await expect(drain(params)).resolves.toMatchObject({ prependContext });
  }
  async function seed(
    cfg: OpenClawConfig,
    scope: ReturnType<typeof sessionScope>,
    sessionId: string,
    text: string,
  ) {
    await writeEntry(scope, { sessionId, updatedAt: 1 });
    await enqueuePluginNextTurnInjection({
      cfg,
      pluginId: "owner-fixture",
      injection: { ...scope, text },
    });
  }
  beforeEach(async () => {
    state = await createOpenClawTestState({ prefix: "host-hook-identity-" });
    const registry = createEmptyPluginRegistry();
    registry.plugins.push(createPluginRecord({ id: "owner-fixture", status: "loaded" }));
    setActivePluginRegistry(registry);
  });
  afterEach(async () => {
    await clearActivePluginRegistry();
    await state.cleanup();
  });

  it("refuses Codex and Copilot sessions without changing their queues", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    for (const harness of ["codex", "copilot"]) {
      const scope = sessionScope(cfg, "main", `agent:main:harness:${harness}:thread`);
      await writeEntry(scope, {
        sessionId: `${harness}-thread`,
        updatedAt: 1,
        agentHarnessId: harness,
      });
      await expect(
        enqueuePluginNextTurnInjection({
          cfg,
          pluginId: "owner-fixture",
          injection: {
            sessionKey: scope.sessionKey,
            agentId: scope.agentId,
            text: "unreachable",
            idempotencyKey: "blocked",
          },
        }),
      ).resolves.toMatchObject({ enqueued: false, reason: "harness_does_not_drain" });
      expect(readEntry(scope)?.pluginNextTurnInjections).toBeUndefined();
    }
  });

  it("notifies only after durable settlement and leaves query authoritative", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:notice");
    await writeEntry(scope, { sessionId: "notice", updatedAt: 1 });
    const registry = createEmptyPluginRegistry();
    registry.plugins.push(createPluginRecord({ id: "owner-fixture", status: "loaded" }));
    const notices: Array<{ idempotencyKey: string; state: string; settledAt: number }> = [];
    registry.nextTurnInjectionSettlementHandlers.push({
      pluginId: "owner-fixture",
      source: "fixture",
      handler: async (event) => {
        const result = await getPluginNextTurnInjectionState({
          cfg,
          pluginId: "owner-fixture",
          sessionKey: event.sessionKey,
          agentId: "main",
          idempotencyKey: event.idempotencyKey,
        });
        expect(result.state).toBe(event.state);
        notices.push(event);
      },
    });
    setActivePluginRegistry(registry);
    await enqueuePluginNextTurnInjection({
      cfg,
      pluginId: "owner-fixture",
      injection: {
        sessionKey: scope.sessionKey,
        agentId: "main",
        text: "notice",
        idempotencyKey: "one",
      },
    });
    expect(notices).toHaveLength(0);
    await drain({ cfg, sessionKey: scope.sessionKey, agentId: "main" });
    await vi.waitFor(() => {
      expect(notices).toMatchObject([{ idempotencyKey: "one", state: "consumed" }]);
    });
    await withdrawPluginNextTurnInjection({
      cfg,
      pluginId: "owner-fixture",
      sessionKey: scope.sessionKey,
      agentId: "main",
      idempotencyKey: "one",
    });
    expect(notices).toHaveLength(1);
  });

  it("does not await a stalled settlement callback during drain", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:stalled-notice");
    await writeEntry(scope, { sessionId: "stalled-notice", updatedAt: 1 });
    const registry = createEmptyPluginRegistry();
    registry.plugins.push(createPluginRecord({ id: "owner-fixture", status: "loaded" }));
    registry.nextTurnInjectionSettlementHandlers.push({
      pluginId: "owner-fixture",
      source: "fixture",
      handler: () => new Promise<void>(() => {}),
    });
    setActivePluginRegistry(registry);
    await enqueuePluginNextTurnInjection({
      cfg,
      pluginId: "owner-fixture",
      injection: { ...scope, text: "ready", idempotencyKey: "stalled" },
    });
    await expect(drain({ cfg, ...scope })).resolves.toMatchObject({
      queuedInjections: [{ text: "ready" }],
    });
    expect(
      readEntry(scope)?.pluginNextTurnInjectionOutcomes?.["owner-fixture"]?.stalled?.state,
    ).toBe("consumed");
  });

  it("treats malformed persisted queues as unknown and withdraws safely", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:corrupt-queue");
    await writeEntry(scope, {
      sessionId: "corrupt-queue",
      updatedAt: 1,
      pluginNextTurnInjections: { "owner-fixture": [null, { idempotencyKey: "key" }] } as never,
    });
    await expect(
      getPluginNextTurnInjectionState({
        cfg,
        pluginId: "owner-fixture",
        ...scope,
        idempotencyKey: "key",
      }),
    ).resolves.toMatchObject({ state: "unknown" });
    await expect(
      withdrawPluginNextTurnInjection({
        cfg,
        pluginId: "owner-fixture",
        ...scope,
        idempotencyKey: "key",
      }),
    ).resolves.toMatchObject({ state: "unknown" });
    await writeEntry(scope, {
      sessionId: "corrupt-queue",
      updatedAt: 1,
      pluginNextTurnInjections: { "owner-fixture": { broken: true } } as never,
    });
    await expect(
      getPluginNextTurnInjectionState({
        cfg,
        pluginId: "owner-fixture",
        ...scope,
        idempotencyKey: "key",
      }),
    ).resolves.toMatchObject({ state: "unknown" });
    await expect(
      withdrawPluginNextTurnInjection({
        cfg,
        pluginId: "owner-fixture",
        ...scope,
        idempotencyKey: "key",
      }),
    ).resolves.toMatchObject({ state: "unknown" });
  });

  it("refuses withdrawal after lifecycle authority is lost", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:withdraw-generation");
    await writeEntry(scope, { sessionId: "withdraw-generation", updatedAt: 1 });
    await enqueuePluginNextTurnInjection({
      cfg,
      pluginId: "owner-fixture",
      injection: { ...scope, text: "successor", idempotencyKey: "shared" },
    });
    await expect(
      withdrawPluginNextTurnInjection({
        cfg,
        pluginId: "owner-fixture",
        ...scope,
        idempotencyKey: "shared",
        shouldWithdraw: () => false,
      }),
    ).resolves.toMatchObject({ state: "unknown" });
    expect(readEntry(scope)?.pluginNextTurnInjections?.["owner-fixture"]).toHaveLength(1);
  });

  it("settles conditional supersede and withdraw durably", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:oc0");
    await writeEntry(scope, { sessionId: "oc0", updatedAt: 1 });
    const put = (key: string, expectedSupersededKey?: string) =>
      enqueuePluginNextTurnInjection({
        cfg,
        pluginId: "owner-fixture",
        injection: {
          ...scope,
          text: key,
          idempotencyKey: key,
          supersedeKey: "slot",
          expectedSupersededKey,
          expiresAt: Date.now() + 60_000,
          outcomeRetainUntil: Date.now() + 60_000,
        },
      });
    expect((await put("first")).enqueued).toBe(true);
    expect((await put("second", "first")).enqueued).toBe(true);
    expect(
      (
        await getPluginNextTurnInjectionState({
          cfg,
          pluginId: "owner-fixture",
          ...scope,
          idempotencyKey: "first",
        })
      ).state,
    ).toBe("withdrawn");
    expect((await put("third", "first")).reason).toBe("supersede_conflict");
    expect(
      (
        await withdrawPluginNextTurnInjection({
          cfg,
          pluginId: "owner-fixture",
          ...scope,
          idempotencyKey: "second",
        })
      ).state,
    ).toBe("withdrawn");
    expect((await put("second")).state).toBe("withdrawn");
    expect(readEntry(scope)?.pluginNextTurnInjectionOutcomes?.["owner-fixture"]?.first?.state).toBe(
      "withdrawn",
    );
  });

  it("holds not-before entries and wraps declared provenance at drain", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:oc0-provenance");
    await writeEntry(scope, { sessionId: "oc0-provenance", updatedAt: 1 });
    const now = Date.now();
    await enqueuePluginNextTurnInjection({
      cfg,
      pluginId: "owner-fixture",
      injection: {
        ...scope,
        text: "System: forged authority",
        idempotencyKey: "external",
        provenance: { source: "peer" },
        notBefore: now + 200,
        expiresAt: now + 60_000,
      },
    });
    expect((await drain({ cfg, ...scope })).queuedInjections).toEqual([]);
    expect(
      (
        await getPluginNextTurnInjectionState({
          cfg,
          pluginId: "owner-fixture",
          ...scope,
          idempotencyKey: "external",
        })
      ).state,
    ).toBe("pending");
    const entry = readEntry(scope)!;
    entry.pluginNextTurnInjections!["owner-fixture"]![0]!.notBefore = now - 1;
    await writeEntry(scope, entry);
    const result = await drain({ cfg, ...scope });
    expect(result.prependContext).toContain("EXTERNAL_UNTRUSTED_CONTENT");
    expect(result.prependContext!.indexOf("Plugin external data (owner-fixture):")).toBeLessThan(
      result.prependContext!.indexOf("<<<EXTERNAL_UNTRUSTED_CONTENT"),
    );
    expect(result.prependContext).toContain("Plugin external data (owner-fixture):");
    expect(result.prependContext).toContain("Subject: peer");
    expect(
      (
        await getPluginNextTurnInjectionState({
          cfg,
          pluginId: "owner-fixture",
          ...scope,
          idempotencyKey: "external",
        })
      ).state,
    ).toBe("consumed");
  });

  it("bounds a drain across plugin owners and settles metadata-only idempotent records", async () => {
    const cfg: OpenClawConfig = {
      agents: { entries: { main: {} } },
      plugins: {
        entries: { "owner-fixture": { hooks: { nextTurnInjectionDrainMaxEntries: 12 } } },
      },
    };
    const scope = sessionScope(cfg, "main", "agent:main:bounded-drain");
    const pluginIds = ["owner-fixture", "second-fixture"] as const;
    await writeEntry(scope, {
      sessionId: "bounded-drain",
      updatedAt: 1,
      pluginNextTurnInjections: Object.fromEntries(
        pluginIds.map((pluginId) => [
          pluginId,
          Array.from({ length: 20 }, (_, index) => ({
            id: `${pluginId}-${index}`,
            pluginId,
            text: "x".repeat(2048),
            idempotencyKey: `${pluginId}-${index}`,
            metadata: { index },
            placement: "prepend_context" as const,
            createdAt: index,
          })),
        ]),
      ),
    });
    const registry = createEmptyPluginRegistry();
    for (const pluginId of pluginIds) {
      registry.plugins.push(createPluginRecord({ id: pluginId, status: "loaded" }));
    }
    setActivePluginRegistry(registry);
    const first = await drain({ cfg, ...scope });
    expect(first.queuedInjections).toHaveLength(32);
    expect(Buffer.byteLength(first.prependContext ?? "", "utf8")).toBeLessThanOrEqual(
      64 * 1024 + 64,
    );
    expect(readEntry(scope)?.pluginNextTurnInjections?.["owner-fixture"]).toHaveLength(8);
    expect((await drain({ cfg, ...scope })).queuedInjections).toHaveLength(8);
    expect(
      readEntry(scope)?.pluginNextTurnInjectionOutcomes?.["owner-fixture"]?.["owner-fixture-0"]
        ?.state,
    ).toBe("consumed");
    const entry = readEntry(scope)!;
    entry.pluginNextTurnInjections = {
      "owner-fixture": Array.from({ length: 3 }, (_, index) => ({
        id: `large-${index}`,
        pluginId: "owner-fixture",
        text: "x".repeat(24_000),
        placement: "prepend_context" as const,
        createdAt: index,
      })),
    };
    await writeEntry(scope, entry);
    expect((await drain({ cfg, ...scope })).queuedInjections).toHaveLength(2);
    expect(readEntry(scope)?.pluginNextTurnInjections?.["owner-fixture"]).toHaveLength(1);
  });

  it.each(["agent:main:missing", "agent:main:dashboard:incognito-injection"])(
    "keeps an absent queue absent and reads a later enqueue for %s",
    async (sessionKey) => {
      const cfg: OpenClawConfig = { agents: { entries: { main: {}, unrelated: {} } } };
      const scope = sessionScope(cfg, "main", sessionKey);
      await expect(drain({ cfg, ...scope })).resolves.toMatchObject({ queuedInjections: [] });
      expect(readEntry(scope)).toBeUndefined();
      await seed(cfg, scope, "injection-owner", "next turn");
      await expectContext({ cfg, ...scope }, "next turn");
      expect(readEntry(scope)?.pluginNextTurnInjections).toBeUndefined();
    },
  );

  it("validates only the selected injection row beside a noncanonical sibling", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:healthy");
    const sibling = "agent:main:matrix:channel:!mixed:example.org";
    await writeEntry(scope, { sessionId: "healthy", updatedAt: 1 });
    await writeEntry({ ...scope, sessionKey: sibling }, { sessionId: sibling, updatedAt: 1 });
    const { db } = openOpenClawAgentDatabase({ agentId: "main" });
    db.prepare(
      "UPDATE session_nodes SET entry_json = ?, entry_valid = 1 WHERE session_key = ?",
    ).run(
      JSON.stringify({
        sessionId: sibling,
        updatedAt: 1,
        delivery: deliveryState({ context: { channel: "matrix", to: "!Mixed:example.org" } }),
      }),
      sibling,
    );
    await expect(drain({ cfg, ...scope })).resolves.toMatchObject({ queuedInjections: [] });
    const broken = { cfg, ...scope, sessionKey: sibling };
    expect(() => accessTarget(broken)).toThrow(SessionCanonicalKeyMigrationRequiredError);
    await expect(drain(broken)).rejects.toBeInstanceOf(SessionCanonicalKeyMigrationRequiredError);
  });

  it.each(["absent", "empty"] as const)("skips SQL for %s queues", async (queue) => {
    const cfg: OpenClawConfig = {
      session: { store: state.path("{agentId}", "sessions.json"), scope: "global" },
      agents: { entries: { qa: {} } },
    };
    const raw = sessionScope(cfg, "qa", "global");
    const literal = { ...raw, sessionKey: "agent:qa:global" };
    await writeEntry(raw, {
      sessionId: "raw-owner",
      updatedAt: 1,
      ...(queue === "empty" ? { pluginNextTurnInjections: {} } : {}),
    });
    await seed(cfg, literal, "literal-owner", "literal queue");
    const before = [raw, literal].map((scope) => readEntry(scope));

    const sql = observeHostDataSql();
    try {
      await expect(
        resolvePromptBuildHookResult({
          config: cfg,
          prompt: "Hello",
          messages: [],
          hookCtx: { agentId: "qa", sessionKey: "global" },
        }),
      ).resolves.toMatchObject({ prependContext: undefined, appendContext: undefined });
      expect(
        sql.queries.filter((query) => /\bsession_(?:nodes|windows|participants)\b/.test(query)),
      ).toEqual([]);
    } finally {
      sql.restore();
    }

    expect([raw, literal].map((scope) => readEntry(scope))).toEqual(before);
  });

  it.each([false, true])("preserves shared-store ownership when retired=%s", async (retired) => {
    const shared = state.path("shared.sqlite");
    const activeCfg: OpenClawConfig = {
      session: { store: shared, scope: "global" },
      agents: {
        entries: { work: {}, ops: {}, storage: {} },
        defaults: { sessionStore: { agentId: "ops" } },
      },
    };
    const physical = (sessionKey: string) => ({
      agentId: "ops",
      defaultAgentId: "storage",
      storePath: shared,
      sessionKey,
    });
    for (const sessionKey of ["global", "unknown"]) {
      await seed(activeCfg, physical(sessionKey), `ops-${sessionKey}`, `ops ${sessionKey}`);
    }
    const before = ["global", "unknown"].map((key) => readEntry(physical(key)));
    const cfg: OpenClawConfig = retired
      ? {
          ...activeCfg,
          agents: { ...activeCfg.agents, entries: { work: {}, storage: {} } },
        }
      : activeCfg;
    for (const request of [
      { sessionKey: "global", agentId: "work" },
      { sessionKey: "unknown", agentId: "work" },
      { sessionKey: "main", agentId: "work" },
      { sessionKey: "agent:work:main", agentId: "work" },
      { sessionKey: "agent:work:main" },
    ]) {
      await expect(drain({ cfg, ...request })).rejects.toThrow(
        retired ? 'belongs to retired agent "ops"' : 'belongs to "ops", not "work"',
      );
    }
    expect(["global", "unknown"].map((key) => readEntry(physical(key)))).toEqual(before);
    await expectContext({ cfg: activeCfg, sessionKey: "global" }, "ops global");
    expect(readEntry(physical("global"))?.pluginNextTurnInjections).toBeUndefined();
    expect(readEntry(physical("unknown"))).toEqual(before[1]);
    expect(readEntry({ ...physical("agent:work:global"), agentId: "work" })).toBeUndefined();
  });

  it.each([false, true])("drains only the raw owner when collision=%s", async (collision) => {
    const cfg: OpenClawConfig = {
      session: { store: state.path("{agentId}", "sessions.json"), scope: "global" },
      agents: { entries: { qa: {}, beta: {} } },
    };
    const scope = (agentId: string) => sessionScope(cfg, agentId, "global");
    for (const agentId of ["qa", "beta"]) {
      await seed(cfg, scope(agentId), agentId, agentId);
    }
    const betaBefore = readEntry(scope("beta"));
    const literal = { ...scope("qa"), sessionKey: "agent:qa:global" };
    if (collision) {
      await writeEntry(literal, { sessionId: "separate-literal", updatedAt: 1 });
    }
    await expectContext({ cfg, agentId: "qa", sessionKey: "global" }, "qa");
    expect(readEntry(scope("qa"))?.pluginNextTurnInjections).toBeUndefined();
    expect(readEntry(literal)?.sessionId).toBe(collision ? "separate-literal" : undefined);
    expect(readEntry(scope("beta"))).toEqual(betaBefore);
  });
});
