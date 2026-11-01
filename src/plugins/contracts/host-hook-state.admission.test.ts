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
    expect(
      (
        await getPluginNextTurnInjectionState({
          ...staleLookup,
          expectedLifecycleRevision: "after",
        })
      ).state,
    ).toBe("pending");
  });

  it("rejects external, cron, and hook routes while admitting a current channel row", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    for (const suffix of ["external", "cron:job", "hook:event", "channel:chat"]) {
      const scope = sessionScope(cfg, "main", `agent:main:${suffix}`);
      await writeEntry(scope, {
        sessionId: suffix,
        lifecycleRevision: "current",
        updatedAt: 1,
        ...(suffix === "external"
          ? { delivery: deliveryState({ context: { channel: "matrix", to: "!room:example.org" } }) }
          : {}),
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
      expect(result.enqueued).toBe(suffix === "channel:chat");
    }
  });
});
