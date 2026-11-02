import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSessionStorePathCore } from "../../config/sessions/paths.js";
import {
  loadSessionEntryReadOnly,
  replaceSessionEntry,
} from "../../config/sessions/session-accessor.entry.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { createWorkerSessionPlacementStore } from "../../gateway/worker-environments/placement-store.js";
import { listSessionBindingsBySessionAsync } from "../../infra/outbound/session-binding-service.js";
import { createOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import {
  drainPluginNextTurnInjectionContext,
  enqueuePluginNextTurnInjection,
} from "../host-hook-state.js";
import { createEmptyPluginRegistry } from "../registry-empty.js";
import { clearActivePluginRegistry, setActivePluginRegistry } from "../runtime.js";
import { createPluginRecord } from "../status.test-helpers.js";

vi.mock("../../gateway/worker-environments/placement-store.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../gateway/worker-environments/placement-store.js")
  >()),
  createWorkerSessionPlacementStore: vi.fn(),
}));
vi.mock("../../infra/outbound/session-binding-service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../infra/outbound/session-binding-service.js")>()),
  listSessionBindingsBySessionAsync: vi.fn(),
}));

const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
const sessionKey = "agent:main:subagent:route-admission";
const sessionId = "same-id";
const lifecycleRevision = "same-revision";
const listBindings = vi.mocked(listSessionBindingsBySessionAsync);
const readProjection = vi.fn();
const binding = {
  bindingId: "external-thread",
  targetSessionKey: sessionKey,
  targetKind: "subagent",
  conversation: { channel: "discord", accountId: "default", conversationId: "thread:123" },
  status: "active",
  boundAt: 1,
};
const localPlacement = { sessionId, sessionKey, agentId: "main", state: "local" };

function enqueue(text: string) {
  return enqueuePluginNextTurnInjection({
    cfg,
    pluginId: "owner-fixture",
    injection: {
      sessionKey,
      agentId: "main",
      text,
      expectedSessionId: sessionId,
      expectedLifecycleRevision: lifecycleRevision,
    },
  });
}

for (const routeChange of ["binding", "placement"] as const) {
  describe(`subagent injection ${routeChange} changes`, () => {
    let state: Awaited<ReturnType<typeof createOpenClawTestState>>;
    let scope: { agentId: string; sessionKey: string; storePath: string };
    beforeEach(async () => {
      state = await createOpenClawTestState({ prefix: `host-hook-${routeChange}-` });
      scope = {
        agentId: "main",
        sessionKey,
        storePath: resolveSessionStorePathCore(cfg.session?.store, {
          agentId: "main",
          env: state.env,
        }),
      };
      await replaceSessionEntry(scope, { sessionId, lifecycleRevision, updatedAt: 1 });
      const registry = createEmptyPluginRegistry();
      registry.plugins.push(createPluginRecord({ id: "owner-fixture", status: "loaded" }));
      setActivePluginRegistry(registry);
      listBindings.mockReset().mockResolvedValue([]);
      readProjection.mockReset().mockResolvedValue({ placements: new Map() });
      vi.mocked(createWorkerSessionPlacementStore).mockReturnValue({ readProjection } as never);
    });
    afterEach(async () => {
      await clearActivePluginRegistry();
      await state.cleanup();
    });

    function changeRoute() {
      if (routeChange === "binding") {
        listBindings.mockResolvedValue([binding] as never);
      } else {
        readProjection.mockResolvedValue({
          placements: new Map([[sessionId, { ...localPlacement, state: "active" }]]),
        });
      }
    }

    it("refuses enqueue after a route change without changing row identity", async () => {
      changeRoute();
      expect(await enqueue("never queued")).toMatchObject({
        enqueued: false,
        reason: "unsupported_route",
      });
      expect(loadSessionEntryReadOnly(scope)?.pluginNextTurnInjections).toBeUndefined();
      expect(listBindings).toHaveBeenCalledWith(sessionKey);
      if (routeChange === "placement") {
        expect(readProjection).toHaveBeenCalledWith([sessionId], { current: true });
      }
    });

    it("rechecks a route that changes after preflight", async () => {
      if (routeChange === "binding") {
        listBindings.mockResolvedValueOnce([]).mockResolvedValueOnce([binding] as never);
      } else {
        readProjection.mockResolvedValueOnce({ placements: new Map() }).mockResolvedValueOnce({
          placements: new Map([[sessionId, { ...localPlacement, state: "active" }]]),
        });
      }
      expect(await enqueue("must not commit")).toMatchObject({
        enqueued: false,
        reason: "unsupported_route",
      });
      expect(loadSessionEntryReadOnly(scope)?.pluginNextTurnInjections).toBeUndefined();
    });

    it("holds a queued injection after a route change before drain", async () => {
      expect((await enqueue("must stay local")).enqueued).toBe(true);
      changeRoute();
      expect(
        (await drainPluginNextTurnInjectionContext({ cfg, sessionKey, agentId: "main" }))
          .queuedInjections,
      ).toEqual([]);
      expect(
        loadSessionEntryReadOnly(scope)?.pluginNextTurnInjections?.["owner-fixture"],
      ).toHaveLength(1);
    });
  });
}
