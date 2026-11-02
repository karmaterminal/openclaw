import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveSessionStorePathCore } from "../../config/sessions/paths.js";
import {
  loadSessionEntryReadOnly as readEntry,
  replaceSessionEntry as writeEntry,
} from "../../config/sessions/session-accessor.entry.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { createOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { normalizeSessionDeliveryState as deliveryState } from "../../utils/delivery-context.shared.js";
import {
  drainPluginNextTurnInjectionContext,
  enqueuePluginNextTurnInjection,
  getPluginNextTurnInjectionState,
  withdrawPluginNextTurnInjection,
} from "../host-hook-state.js";
import { createEmptyPluginRegistry } from "../registry-empty.js";
import { clearActivePluginRegistry, setActivePluginRegistry } from "../runtime.js";
import { createPluginRecord } from "../status.test-helpers.js";

describe("next-turn injection admission fence", () => {
  let state: Awaited<ReturnType<typeof createOpenClawTestState>>;
  function sessionScope(cfg: OpenClawConfig, agentId: string, sessionKey: string) {
    const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId, env: state.env });
    return { agentId, sessionKey, storePath };
  }
  beforeEach(async () => {
    state = await createOpenClawTestState({ prefix: "host-hook-admission-" });
    const registry = createEmptyPluginRegistry();
    registry.plugins.push(createPluginRecord({ id: "owner-fixture", status: "loaded" }));
    setActivePluginRegistry(registry);
  });
  afterEach(async () => {
    await clearActivePluginRegistry();
    await state.cleanup();
  });

  it("bounds explicit expiry to the replay horizon and preserves missing expiry", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:main");
    await writeEntry(scope, { sessionId: "main", updatedAt: 1 });
    const now = Date.now();
    expect(
      await enqueuePluginNextTurnInjection({
        cfg,
        pluginId: "owner-fixture",
        now,
        injection: {
          sessionKey: scope.sessionKey,
          agentId: "main",
          text: "future",
          idempotencyKey: "future",
          expiresAt: now + 86_400_001,
        },
      }),
    ).toMatchObject({ enqueued: false, reason: "invalid" });
    expect(
      await enqueuePluginNextTurnInjection({
        cfg,
        pluginId: "owner-fixture",
        now,
        injection: {
          sessionKey: scope.sessionKey,
          agentId: "main",
          text: "bounded",
          idempotencyKey: "bounded",
        },
      }),
    ).toMatchObject({ enqueued: true });
    expect(
      readEntry(scope)?.pluginNextTurnInjections?.["owner-fixture"]?.[0]?.expiresAt,
    ).toBeUndefined();
  }, 15_000);

  it("discards undated entries but retains explicitly timed entries across owner reload", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:main");
    await writeEntry(scope, { sessionId: "main", updatedAt: 1 });
    for (const [idempotencyKey, ttlMs] of [
      ["undated", undefined],
      ["timed", 60_000],
    ] as const) {
      expect(
        await enqueuePluginNextTurnInjection({
          cfg,
          pluginId: "owner-fixture",
          injection: {
            ...scope,
            text: idempotencyKey,
            idempotencyKey,
            ...(ttlMs === undefined ? {} : { ttlMs }),
          },
        }),
      ).toMatchObject({ enqueued: true });
    }
    setActivePluginRegistry(createEmptyPluginRegistry());
    expect((await drainPluginNextTurnInjectionContext({ cfg, ...scope })).queuedInjections).toEqual(
      [],
    );
    const afterInactiveDrain = readEntry(scope);
    expect(afterInactiveDrain?.pluginNextTurnInjections?.["owner-fixture"]).toMatchObject([
      { idempotencyKey: "timed", ttlMs: 60_000 },
    ]);
    expect(
      afterInactiveDrain?.pluginNextTurnInjectionOutcomes?.["owner-fixture"]?.undated,
    ).toMatchObject({ state: "discarded" });
    const active = createEmptyPluginRegistry();
    active.plugins.push(createPluginRecord({ id: "owner-fixture", status: "loaded" }));
    setActivePluginRegistry(active);
    expect(
      (await drainPluginNextTurnInjectionContext({ cfg, ...scope })).queuedInjections,
    ).toMatchObject([{ idempotencyKey: "timed", text: "timed" }]);
  }, 15_000);

  it("persists prototype-named plugin queues as own keys", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:prototype-owner");
    await writeEntry(scope, { sessionId: "prototype-owner", updatedAt: 1 });
    expect(
      await enqueuePluginNextTurnInjection({
        cfg,
        pluginId: "__proto__",
        injection: { ...scope, text: "persisted", idempotencyKey: "prototype-key" },
      }),
    ).toMatchObject({ enqueued: true });
    const queues = readEntry(scope)?.pluginNextTurnInjections;
    expect(Object.hasOwn(queues ?? {}, "__proto__")).toBe(true);
    const pluginId = "__proto__";
    expect(queues?.[pluginId]).toMatchObject([{ text: "persisted" }]);
  });

  it("requires a current identity tuple for subagent admission but not generic main/channel callers", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    for (const suffix of ["subagent:local", "main", "channel:chat"]) {
      const scope = sessionScope(cfg, "main", `agent:main:${suffix}`);
      await writeEntry(scope, { sessionId: suffix, lifecycleRevision: "current", updatedAt: 1 });
      const result = await enqueuePluginNextTurnInjection({
        cfg,
        pluginId: "owner-fixture",
        injection: { sessionKey: scope.sessionKey, agentId: "main", text: "unqualified" },
      });
      if (suffix.startsWith("subagent:")) {
        expect(result).toMatchObject({ enqueued: false, reason: "invalid" });
        expect(readEntry(scope)?.pluginNextTurnInjections).toBeUndefined();
      } else {
        expect(result.enqueued).toBe(true);
      }
    }
  });

  it("rejects same-ID subagent reset and reroute at admission, then admits the current local row", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:subagent:local");
    await writeEntry(scope, { sessionId: "same", lifecycleRevision: "before", updatedAt: 1 });
    await writeEntry(scope, { sessionId: "same", lifecycleRevision: "after", updatedAt: 2 });
    const request = {
      cfg,
      pluginId: "owner-fixture",
      injection: {
        sessionKey: scope.sessionKey,
        agentId: "main",
        text: "qualified",
        expectedSessionId: "same",
        expectedLifecycleRevision: "before",
      },
    };
    expect(await enqueuePluginNextTurnInjection(request)).toMatchObject({
      enqueued: false,
      reason: "stale_session",
    });
    await writeEntry(scope, {
      sessionId: "same",
      lifecycleRevision: "after",
      updatedAt: 3,
      delivery: deliveryState({ context: { channel: "matrix", to: "!room:example.org" } }),
    });
    expect(
      await enqueuePluginNextTurnInjection({
        ...request,
        injection: { ...request.injection, expectedLifecycleRevision: "after" },
      }),
    ).toMatchObject({ enqueued: false, reason: "unsupported_route" });
    await writeEntry(scope, { sessionId: "same", lifecycleRevision: "after", updatedAt: 4 });
    expect(
      await enqueuePluginNextTurnInjection({
        ...request,
        injection: { ...request.injection, expectedLifecycleRevision: "after" },
      }),
    ).toMatchObject({ enqueued: true });
  });

  it("rejects a reset with the same sessionId but a new lifecycle revision", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:main");
    await writeEntry(scope, { sessionId: "same", lifecycleRevision: "before", updatedAt: 1 });
    await writeEntry(scope, { sessionId: "same", lifecycleRevision: "after", updatedAt: 2 });
    const result = await enqueuePluginNextTurnInjection({
      cfg,
      pluginId: "owner-fixture",
      injection: {
        sessionKey: scope.sessionKey,
        agentId: "main",
        text: "stale",
        expectedSessionId: "same",
        expectedLifecycleRevision: "before",
      },
    });
    expect(result).toMatchObject({ enqueued: false, reason: "stale_session" });
    expect(readEntry(scope)?.pluginNextTurnInjections).toBeUndefined();
    const fresh = await enqueuePluginNextTurnInjection({
      cfg,
      pluginId: "owner-fixture",
      injection: {
        sessionKey: scope.sessionKey,
        agentId: "main",
        text: "fresh",
        idempotencyKey: "generation-key",
        expectedSessionId: "same",
        expectedLifecycleRevision: "after",
      },
    });
    expect(fresh.enqueued).toBe(true);
    const staleLookup = {
      cfg,
      pluginId: "owner-fixture",
      sessionKey: scope.sessionKey,
      agentId: "main",
      idempotencyKey: "generation-key",
      expectedSessionId: "same",
      expectedLifecycleRevision: "before",
    };
    expect((await getPluginNextTurnInjectionState(staleLookup)).state).toBe("unknown");
    expect((await withdrawPluginNextTurnInjection(staleLookup)).state).toBe("unknown");
    for (const partialFence of [
      { expectedSessionId: "same" },
      { expectedLifecycleRevision: "after" },
      { expectedSessionId: "", expectedLifecycleRevision: "after" },
    ]) {
      expect(
        (
          await withdrawPluginNextTurnInjection({
            ...staleLookup,
            expectedSessionId: undefined,
            expectedLifecycleRevision: undefined,
            ...partialFence,
          })
        ).state,
      ).toBe("unknown");
      expect(readEntry(scope)?.pluginNextTurnInjections?.["owner-fixture"]).toHaveLength(1);
    }
    expect(
      (
        await getPluginNextTurnInjectionState({
          ...staleLookup,
          expectedLifecycleRevision: "after",
        })
      ).state,
    ).toBe("pending");
  });

  it("admits external delivery on generic main/channel rows but rejects cron and hook routes", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    for (const suffix of ["main", "discord:channel:chat", "cron:job", "hook:event"]) {
      const scope = sessionScope(cfg, "main", `agent:main:${suffix}`);
      await writeEntry(scope, {
        sessionId: suffix,
        lifecycleRevision: "current",
        updatedAt: 1,
        delivery: deliveryState({
          context:
            suffix === "main"
              ? { channel: "telegram", to: "12345" }
              : { channel: "discord", to: "channel:chat" },
        }),
      });
      const result = await enqueuePluginNextTurnInjection({
        cfg,
        pluginId: "owner-fixture",
        injection: {
          sessionKey: scope.sessionKey,
          agentId: "main",
          text: "current",
          expectedSessionId: suffix,
          expectedLifecycleRevision: "current",
        },
      });
      const allowed = suffix === "main" || suffix === "discord:channel:chat";
      expect(result.enqueued).toBe(allowed);
      expect(
        (await drainPluginNextTurnInjectionContext({ cfg, ...scope })).queuedInjections,
      ).toHaveLength(allowed ? 1 : 0);
    }
  });

  it("rejects a subagent row with unresolved legacy external-route hints", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:subagent:legacy");
    await writeEntry(scope, {
      sessionId: "legacy",
      lifecycleRevision: "current",
      updatedAt: 1,
      groupChannel: "discord",
    });
    expect(
      await enqueuePluginNextTurnInjection({
        cfg,
        pluginId: "owner-fixture",
        injection: {
          sessionKey: scope.sessionKey,
          agentId: "main",
          text: "blocked",
          expectedSessionId: "legacy",
          expectedLifecycleRevision: "current",
        },
      }),
    ).toMatchObject({ enqueued: false, reason: "unsupported_route" });
  });
});
