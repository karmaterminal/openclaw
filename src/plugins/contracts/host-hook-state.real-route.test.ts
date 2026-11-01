import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveSessionStorePathCore } from "../../config/sessions/paths.js";
import { replaceSessionEntry } from "../../config/sessions/session-accessor.entry.js";
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

const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
const sessionId = "real-route-session";
const lifecycleRevision = "real-route-revision";

describe("next-turn injection broker route admission", () => {
  let state: Awaited<ReturnType<typeof createOpenClawTestState>>;
  beforeEach(async () => {
    state = await createOpenClawTestState({ prefix: "host-hook-real-route-" });
    const registry = createEmptyPluginRegistry();
    registry.plugins.push(createPluginRecord({ id: "owner-fixture", status: "loaded" }));
    setActivePluginRegistry(registry);
  });
  afterEach(async () => {
    await clearActivePluginRegistry();
    await state.cleanup();
  });

  for (const sessionKey of [
    "agent:main:subagent:clean-local",
    "agent:main:discord:chat",
  ] as const) {
    it(`enqueues and drains ${sessionKey} with real route lookups`, async () => {
      await replaceSessionEntry(
        {
          agentId: "main",
          sessionKey,
          storePath: resolveSessionStorePathCore(cfg.session?.store, {
            agentId: "main",
            env: state.env,
          }),
        },
        { sessionId, lifecycleRevision, updatedAt: 1 },
      );
      expect(await listSessionBindingsBySessionAsync(sessionKey)).toEqual([]);
      expect(
        (
          await createWorkerSessionPlacementStore().readProjection([sessionId], { current: true })
        ).placements.get(sessionId),
      ).toBeUndefined();
      const result = await enqueuePluginNextTurnInjection({
        cfg,
        pluginId: "owner-fixture",
        injection: {
          sessionKey,
          agentId: "main",
          text: "real broker route",
          expectedSessionId: sessionId,
          expectedLifecycleRevision: lifecycleRevision,
        },
      });
      expect(result.enqueued).toBe(true);
      expect(
        (await drainPluginNextTurnInjectionContext({ cfg, sessionKey, agentId: "main" }))
          .queuedInjections,
      ).toHaveLength(1);
    });
  }
});
