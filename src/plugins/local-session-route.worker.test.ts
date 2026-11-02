import { expect, it } from "vitest";
import { observeHostDataSql } from "../../test/helpers/sqlite-statement-execution-counter.js";
import { setRuntimeConfigSnapshot } from "../config/runtime-snapshot.js";
import { replaceSessionEntry } from "../config/sessions/session-accessor.sqlite-entry.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createWorkerSessionPlacementStore } from "../gateway/worker-environments/placement-store.js";
import { resolveOpenClawAgentSqlitePath } from "../state/openclaw-agent-db.paths.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { resolvePluginLocalSessionRoute } from "./local-session-route.js";

it("reads current exact session presence on a worker without host data SQL", async () => {
  await withOpenClawTestState({ scenario: "minimal" }, async ({ env }) => {
    const agentId = "main";
    const sessionKey = "agent:main:subagent:abc";
    const storePath = resolveOpenClawAgentSqlitePath({ agentId, env });
    const cfg = { session: { store: storePath } } as OpenClawConfig;
    setRuntimeConfigSnapshot(cfg);
    const resolve = () => resolvePluginLocalSessionRoute({ cfg, sessionKey });
    await replaceSessionEntry(
      { agentId, env, sessionKey },
      { sessionId: "before", lifecycleRevision: "r1", updatedAt: 1 },
    );
    await replaceSessionEntry(
      { agentId, env, sessionKey: "global" },
      { sessionId: "shared", updatedAt: 1 },
    );

    const sql = observeHostDataSql();
    try {
      expect(await resolve()).toEqual({
        sessionKey,
        exists: true,
        onHost: true,
        sessionId: "before",
        lifecycleRevision: "r1",
      });
      expect(await resolvePluginLocalSessionRoute({ cfg, sessionKey: "global" })).toEqual({
        sessionKey: "global",
        exists: true,
        onHost: false,
        sessionId: "shared",
        lifecycleRevision: null,
      });
      expect(sql.queries).toEqual([]);
    } finally {
      sql.restore();
    }
    await replaceSessionEntry(
      { agentId, env, sessionKey },
      { sessionId: "after", lifecycleRevision: "r2", updatedAt: 2 },
    );
    const refreshedSql = observeHostDataSql();
    try {
      expect(await resolve()).toEqual({
        sessionKey,
        exists: true,
        onHost: true,
        sessionId: "after",
        lifecycleRevision: "r2",
      });
      expect(refreshedSql.queries).toEqual([]);
    } finally {
      refreshedSql.restore();
    }
    const placements = createWorkerSessionPlacementStore();
    await placements.startDispatch({ sessionId: "after", sessionKey, agentId });
    expect(await resolve()).toMatchObject({
      exists: true,
      onHost: false,
      sessionId: "after",
    });
  });
});
