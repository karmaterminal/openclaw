import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { setRuntimeConfigSnapshot } from "../config/runtime-snapshot.js";
import { loadExactSessionEntry } from "../config/sessions/session-accessor.js";
import { resolveSessionWorkStartBlock } from "../config/sessions/session-work-start.js";
import { runSessionStartupMigration } from "../config/sessions/startup-migration-runtime.js";
import { claimAgentRunContext, releaseAgentRunContext } from "../infra/agent-run-registry.js";
import { withAgentDatabaseMaintenanceLease } from "../state/openclaw-agent-db-maintenance-lease.js";
import { ensureOpenClawAgentDatabaseSchema } from "../state/openclaw-agent-db-schema.js";
import { openOpenClawAgentDatabase } from "../state/openclaw-agent-db.js";
import { resolveOpenClawAgentSqlitePath } from "../state/openclaw-agent-db.paths.js";
import { readCapturedAgentSchema } from "../state/openclaw-agent-db.schema-bridge.test-support.js";
import { seedVersion } from "../state/schema-migration.test-support.js";
import { ensureProfileForEmail } from "../state/user-profiles.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { sessionRecoverHandlers } from "./server-methods/sessions-recover.js";
import type { RespondFn } from "./server-methods/types.js";
import {
  createContext,
  createOperatorClient,
} from "./server-plugin-in-process-dispatch.test-support.js";
import { recoverGatewaySessionTombstone } from "./session-tombstone-recovery.js";

const cfg = { agents: { entries: { main: {} } } };
// The deployed fleet build's terminal refusal: reason only, no execution snapshot.
const fleetTombstone = (extra: Record<string, unknown> = {}) => ({
  chargedAttempts: 2,
  cycleId: "fleet-cycle",
  revision: 3,
  tombstone: { reason: "automatic replay refused", ...extra },
});
type Seed = { key: string; entry: Record<string, unknown>; events: number };

/** Writes a fleet-38 store, then runs the real 38→42 schema migration over it. */
async function seedFleet38(env: NodeJS.ProcessEnv, seeds: Seed[]) {
  const pathname = resolveOpenClawAgentSqlitePath({ agentId: "main", env });
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
  {
    using database = new DatabaseSync(pathname);
    database.exec(readCapturedAgentSchema("openclaw-agent-schema-v38-fleet.sql"));
    seedVersion(database, 38);
    database.exec(
      "INSERT OR IGNORE INTO session_key_contract (id, main_key, updated_at) VALUES (1, 'main', 0)",
    );
    for (const { key, entry, events } of seeds) {
      const sessionId = String(entry.sessionId);
      database
        .prepare(
          "INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at, entry_valid, status) VALUES (?, ?, ?, ?, 1, ?)",
        )
        .run(
          key,
          sessionId,
          JSON.stringify(entry),
          42,
          entry.status === "failed" ? "failed" : null,
        );
      database
        .prepare(
          "INSERT INTO session_windows (session_id, session_key, created_at, updated_at) VALUES (?, ?, 1, 42)",
        )
        .run(sessionId, key);
      const insert = database.prepare(
        "INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)",
      );
      for (let seq = 1; seq <= events; seq += 1) {
        const role = seq % 2 ? "user" : "assistant";
        insert.run(
          sessionId,
          seq,
          JSON.stringify({
            type: "message",
            id: `${sessionId}-${seq}`,
            message: { role, content: `turn ${seq}` },
          }),
          seq,
        );
      }
    }
  }
  await withAgentDatabaseMaintenanceLease({ env }, async () => {
    using database = new DatabaseSync(pathname);
    ensureOpenClawAgentDatabaseSchema(database, { agentId: "main", path: pathname, env });
    expect(database.prepare("PRAGMA user_version").get()?.user_version).toBe(42);
  });
  const db = openOpenClawAgentDatabase({ agentId: "main", env }).db;
  const read = (key: string) =>
    db.prepare("SELECT entry_json FROM session_nodes WHERE session_key = ?").get(key)?.entry_json;
  const transcript = (sessionId: string) =>
    db
      .prepare(
        "SELECT CAST(rowid AS TEXT) AS id, * FROM transcript_events WHERE session_id = ? ORDER BY seq",
      )
      .all(sessionId);
  const windows = (key: string) =>
    db.prepare("SELECT session_id FROM session_windows WHERE session_key = ?").all(key);
  const backups = () =>
    fs.readdirSync(path.dirname(pathname)).filter((name) => name.includes(".pre-session-recover-"));
  const entry = (key: string) =>
    loadExactSessionEntry({ agentId: "main", sessionKey: key, env })?.entry;
  return { pathname, read, transcript, windows, backups, entry };
}

const recover = (env: NodeJS.ProcessEnv, key: string, expectedSessionId: string) =>
  recoverGatewaySessionTombstone({ key, expectedSessionId, env, assertCurrent() {} });

/** First boot after upgrade: startup migration must keep every tombstone and add no marker. */
async function boot(env: NodeJS.ProcessEnv, store: Awaited<ReturnType<typeof seedFleet38>>) {
  const keys = ["agent:main:silas", "agent:main:other", "agent:main:live", "agent:main:pending"];
  const before = keys.map(store.read);
  await runSessionStartupMigration({ cfg, env, log: { info() {}, warn() {} } });
  expect(keys.map(store.read)).toEqual(before);
}

it.each([
  ["fleet-38 live shape", 3, {}],
  [
    "recorded successor",
    3,
    { recoveredSessionId: "successor", recoveredSessionKey: "agent:main:successor" },
  ],
] as const)(
  "recovers a migrated %s in place without a reset boundary or a new run",
  (_shape, events, successor) =>
    withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      setRuntimeConfigSnapshot(cfg);
      await state.writeConfig(cfg);
      const target = {
        key: "agent:main:silas",
        entry: {
          sessionId: "silas",
          updatedAt: 42,
          status: "failed",
          mainRestartRecovery: fleetTombstone(successor),
        },
        events,
      };
      const bystander = {
        key: "agent:main:other",
        entry: {
          sessionId: "other",
          updatedAt: 42,
          status: "failed",
          mainRestartRecovery: fleetTombstone(),
        },
        events: 2,
      };
      const seeds: Seed[] = [target, bystander];
      if ("recoveredSessionKey" in successor) {
        seeds.push({
          key: successor.recoveredSessionKey,
          entry: { sessionId: "successor", updatedAt: 43 },
          events: 2,
        });
      }
      const store = await seedFleet38(state.env, seeds);
      const raw = Object.fromEntries(seeds.map(({ key }) => [key, store.read(key)]));
      expect(raw[target.key]).toBe(JSON.stringify(target.entry));
      const transcript = store.transcript("silas");
      expect(transcript).toHaveLength(events);
      await boot(state.env, store);
      expect(store.entry(target.key)?.resumeAfterRestart).toBeUndefined();
      expect(resolveSessionWorkStartBlock(target.key, store.entry(target.key))?.reason).toBe(
        "restart_tombstone",
      );

      const result = await recover(state.env, target.key, "silas");

      expect(result).toMatchObject({
        ok: true,
        key: target.key,
        sessionId: "silas",
        recovered: true,
      });
      const backupPath = result.ok ? result.backupPath : undefined;
      using backup = new DatabaseSync(backupPath!, { readOnly: true });
      expect(
        backup.prepare("SELECT entry_json FROM session_nodes WHERE session_key = ?").get(target.key)
          ?.entry_json,
      ).toBe(raw[target.key]);
      const stored = JSON.parse(String(store.read(target.key)));
      expect(stored).toEqual({
        sessionId: "silas",
        updatedAt: 42,
        status: "interrupted",
        abortedLastRun: true,
      });
      // Same transcript bytes, no boundary event, no rotated window: the next turn sees prior context.
      expect(store.transcript("silas")).toEqual(transcript);
      expect(store.windows(target.key)).toEqual([{ session_id: "silas" }]);
      const recovered = store.entry(target.key);
      expect(recovered?.sessionId).toBe("silas");
      expect(resolveSessionWorkStartBlock(target.key, recovered)).toBeUndefined();
      // Restart discovery selects nothing to resume, and no run owns the row.
      expect(recovered?.resumeAfterRestart).toBeUndefined();
      expect(recovered?.lifecycleRunId).toBeUndefined();
      expect(recovered?.activeWriterRunId).toBeUndefined();
      for (const { key } of seeds.slice(1)) {
        expect(store.read(key)).toBe(raw[key]);
      }
      expect(resolveSessionWorkStartBlock(bystander.key, store.entry(bystander.key))?.reason).toBe(
        "restart_tombstone",
      );

      const once = store.read(target.key);
      await expect(recover(state.env, target.key, "silas")).resolves.toEqual({
        ok: true,
        key: target.key,
        agentId: "main",
        sessionId: "silas",
        recovered: false,
      });
      expect(store.read(target.key)).toBe(once);
      expect(store.backups()).toHaveLength(1);
    }),
);

it("refuses while a recorded run is live and retires an unknown-outcome final without sending it", () =>
  withOpenClawTestState({ scenario: "minimal" }, async (state) => {
    setRuntimeConfigSnapshot(cfg);
    await state.writeConfig(cfg);
    const custody = (runId: string) => ({
      status: "failed",
      updatedAt: 42,
      activeWriterRunId: runId,
      mainRestartRecovery: {
        ...fleetTombstone(),
        executionIdentity: { runId, contextId: "old-context", executionId: "old-execution" },
      },
    });
    const live = {
      key: "agent:main:live",
      entry: { sessionId: "live", ...custody("live-run") },
      events: 2,
    };
    const pending = {
      key: "agent:main:pending",
      entry: {
        sessionId: "pending",
        ...custody("old-run"),
        pendingFinalDelivery: {
          kind: "replayable",
          text: "Uncertain final",
          sourceRunId: "old-run",
          createdAt: 42,
          intentId: "old-final",
          context: { channel: "telegram", to: "synthetic-recipient" },
        },
      },
      events: 2,
    };
    const store = await seedFleet38(state.env, [live, pending]);
    await boot(state.env, store);
    const raw = store.read(live.key);
    const claim = claimAgentRunContext(
      "live-run",
      { agentId: "main", sessionKey: live.key, sessionId: "live" },
      { trackOwner: true, ownsContext: true },
    );
    try {
      const refused = await recover(state.env, live.key, "live");
      expect(refused).toMatchObject({
        ok: false,
        error: { code: "INVALID_REQUEST", details: { reason: "restart-custody-retained" } },
      });
      expect(refused.ok ? "" : refused.error.message).toContain("execution owner is still live");
      expect(store.read(live.key)).toBe(raw);
      expect(store.backups()).toEqual([]);
    } finally {
      releaseAgentRunContext("live-run", claim);
    }
    await expect(recover(state.env, live.key, "live")).resolves.toMatchObject({ recovered: true });
    expect(JSON.parse(String(store.read(live.key)))).not.toHaveProperty("activeWriterRunId");

    await expect(recover(state.env, pending.key, "pending")).resolves.toMatchObject({
      recovered: true,
    });
    const retired = JSON.parse(String(store.read(pending.key)));
    expect(retired).not.toHaveProperty("pendingFinalDelivery");
    expect(retired.lastRunError).toContain("unknown outcome");
    expect(retired.lastRunError).toContain("pre-recovery backup");
    // The owed notice is the only follow-up; it says the final is not resent.
    expect(retired.pendingDeliveryNotice).toEqual({
      createdAt: 42,
      context: { channel: "telegram", to: "synthetic-recipient" },
      intentId: "old-final",
      state: "owed",
    });
    expect(retired).not.toHaveProperty("resumeAfterRestart");
  }));

it("requires owner or operator.admin authority and leaves the row unchanged otherwise", () =>
  withOpenClawTestState({ scenario: "minimal" }, async (state) => {
    setRuntimeConfigSnapshot(cfg);
    await state.writeConfig(cfg);
    const target = {
      key: "agent:main:silas",
      entry: {
        sessionId: "silas",
        updatedAt: 42,
        status: "failed",
        mainRestartRecovery: fleetTombstone(),
      },
      events: 2,
    };
    const store = await seedFleet38(state.env, [target]);
    const raw = store.read(target.key);
    const context = createContext([], () => cfg);
    context.getSessionEventSubscriberConnIds = () => new Set();
    const call = async (
      client: Parameters<(typeof sessionRecoverHandlers)["sessions.recover"]>[0]["client"],
    ) => {
      const respond = vi.fn<RespondFn>();
      await sessionRecoverHandlers["sessions.recover"]!({
        req: { type: "req", id: "recover", method: "sessions.recover" },
        params: { key: target.key, expectedSessionId: "silas" },
        client,
        isWebchatConnect: () => false,
        context,
        respond,
      });
      return respond.mock.calls[0];
    };
    const profile = ensureProfileForEmail("operator@example.test");
    for (const client of [
      null,
      createOperatorClient({ profileId: profile.id, scopes: ["operator.read", "operator.write"] }),
    ]) {
      const [ok, , error] = (await call(client)) ?? [];
      expect(ok).toBe(false);
      expect(error).toMatchObject({ code: "FORBIDDEN" });
      expect(store.read(target.key)).toBe(raw);
      expect(store.backups()).toEqual([]);
    }
    const admin = createOperatorClient({ profileId: profile.id, scopes: ["operator.admin"] });
    const [ok, payload] = (await call(admin)) ?? [];
    expect(ok).toBe(true);
    expect(payload).toMatchObject({
      ok: true,
      key: target.key,
      sessionId: "silas",
      recovered: true,
    });
    expect(store.read(target.key)).not.toBe(raw);
  }));
