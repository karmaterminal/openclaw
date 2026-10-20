import { afterEach, describe, expect, it } from "vitest";
import { assignSessionOwner } from "../config/sessions/session-accessor.js";
import { closeOpenClawAgentDatabasesForTest } from "../state/openclaw-agent-db.js";
import { withStateDirEnv } from "../test-helpers/state-dir-env.js";
import { normalizeSessionDeliveryState } from "../utils/delivery-context.shared.js";
import { createCanonicalRepairFixture } from "./doctor-session-repair-fixture.test-support.js";

afterEach(() => closeOpenClawAgentDatabasesForTest());

describe("doctor transcript owner repair", () => {
  it.each([false, true])(
    "preserves required creation provenance during canonical repair: %o",
    async (requiredCanonical) => {
      await withStateDirEnv("openclaw-doctor-canonical-creation-stamp-", async ({ stateDir }) => {
        const { insert, load, expectRepair } = createCanonicalRepairFixture(stateDir, "work", [
          "main",
          "ops",
        ]);
        const canonicalKey = "agent:main:matrix:channel:!Creation:example.org";
        const canonicalStamp = {
          createdVia: "operator" as const,
          createdActor: {
            type: "human" as const,
            source: "profile" as const,
            id: "profile-canonical",
          },
          createdAt: 10,
          ...(requiredCanonical ? { sandbox: "required" as const } : {}),
        };
        const aliasStamp = {
          createdVia: "channel" as const,
          createdActor: { type: "human" as const, source: "channel" as const, id: "profile-alias" },
          createdAt: 20,
          sandbox: "required" as const,
        };
        insert(canonicalKey, {
          ...canonicalStamp,
          sessionId: "canonical-session",
          updatedAt: requiredCanonical ? 10 : 30,
        });
        insert(canonicalKey.toLowerCase(), {
          ...aliasStamp,
          delivery: normalizeSessionDeliveryState({
            context: { channel: "matrix", to: "!Creation:example.org" },
          }),
          sessionId: "alias-session",
          updatedAt: 20,
        });

        await expectRepair({ foundGroups: 1, repairedGroups: 1 });
        const repaired = load(canonicalKey)?.entry;
        const expectedStamp = !requiredCanonical ? aliasStamp : canonicalStamp;
        expect(repaired).toMatchObject({
          ...expectedStamp,
          sessionId: requiredCanonical ? "alias-session" : "canonical-session",
          updatedAt: requiredCanonical ? 20 : 30,
        });
      });
    },
  );

  it("replaces a stale same-store owner from the selected canonical-repair winner", async () => {
    await withStateDirEnv("openclaw-doctor-assigned-owner-", async ({ stateDir }) => {
      const { insert, load, database, scope, expectRepair } = createCanonicalRepairFixture(
        stateDir,
        "work",
      );
      const canonicalKey = "agent:main:matrix:channel:!Owner:example.org";
      const winnerKey = canonicalKey.toLowerCase();
      insert(canonicalKey, { sessionId: "stale-destination", updatedAt: 10 });
      assignSessionOwner(
        { ...scope(), sessionKey: canonicalKey },
        {
          owner: { type: "human", id: "profile-stale" },
          assignedBy: { type: "human", id: "profile-stale-assigner" },
          assignedAt: 10,
        },
      );
      insert(winnerKey, { sessionId: "selected-winner", updatedAt: 20 });
      const owner = assignSessionOwner(
        { ...scope(), sessionKey: winnerKey },
        {
          owner: { type: "human", id: "profile-winner" },
          assignedBy: { type: "agent", id: "research" },
          assignedAt: 1234,
        },
      );
      database()
        .db.prepare("UPDATE session_nodes SET entry_json = ? WHERE session_key = ?")
        .run(
          JSON.stringify({
            sessionId: "selected-winner",
            updatedAt: 20,
            delivery: normalizeSessionDeliveryState({
              context: { channel: "matrix", to: "!Owner:example.org" },
            }),
          }),
          winnerKey,
        );
      await expectRepair({ foundGroups: 1, repairedGroups: 1 });
      expect(load(canonicalKey)?.entry.owner).toEqual(owner);
    });
  });

  it("restores a valid node after an empty alias steals its transcript window", async () => {
    await withStateDirEnv("openclaw-doctor-transcript-owner-", async ({ stateDir }) => {
      const { insert, load, database, transcript, expectRepair } =
        createCanonicalRepairFixture(stateDir);
      const canonicalKey = "agent:main:main";
      const staleKey = "agent:main:telegram:default:direct:fixture-peer";
      const sessionId = "stolen-owner-session";
      insert(
        canonicalKey,
        { label: "canonical metadata", sessionId, updatedAt: 20 },
        "preserved history",
      );
      const db = database();
      db.db
        .prepare(
          "INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at) VALUES (?, ?, '{}', ?)",
        )
        .run(staleKey, sessionId, 30);
      db.db
        .prepare("UPDATE session_nodes SET entry_valid = 1 WHERE session_key = ?")
        .run(canonicalKey);
      db.db
        .prepare("UPDATE session_windows SET session_key = ? WHERE session_id = ?")
        .run(staleKey, sessionId);

      await expectRepair({ foundGroups: 1, repairedGroups: 0 }, false);
      await expectRepair({ foundGroups: 1, removedRows: 1, repairedGroups: 1 });
      expect(load(staleKey)).toBeUndefined();
      expect(load(canonicalKey)?.entry).toMatchObject({ label: "canonical metadata", sessionId });
      expect(
        db.db
          .prepare("SELECT session_key FROM session_windows WHERE session_id = ?")
          .get(sessionId),
      ).toEqual({ session_key: canonicalKey });
      await transcript(canonicalKey, sessionId, "preserved history");
      await expectRepair({ foundGroups: 0, repairedGroups: 0 });
    });
  });

  it("compares authority ownership against the selected occupant before stamp preservation", async () => {
    await withStateDirEnv("openclaw-doctor-stamped-authority-", async ({ stateDir }) => {
      const env = { ...process.env, OPENCLAW_STATE_DIR: stateDir };
      const storeTemplate = path.join(stateDir, "agents", "{agentId}", "sessions.json");
      const storePath = resolveSessionStorePathCore(storeTemplate, { agentId: "main", env });
      const canonicalKey = "agent:main:matrix:channel:!Stamped:example.org";
      const aliasKey = canonicalKey.toLowerCase();
      const epoch = "11111111-1111-4111-8111-111111111111";
      const cfg = {
        agents: { list: [{ id: "main", default: true }] },
        session: { mainKey: "work", store: storeTemplate },
      } as OpenClawConfig;
      insertLegacySession({
        agentId: "main",
        entry: {
          createdActor: { type: "human", source: "unknown", id: "canonical-owner" },
          sandbox: "required",
          sessionId: "canonical-session",
          updatedAt: 10,
        },
        env,
        sessionKey: canonicalKey,
        storePath,
      });
      insertLegacySession({
        agentId: "main",
        entry: {
          createdActor: { type: "human", source: "unknown", id: "winner-owner" },
          delivery: normalizeSessionDeliveryState({
            context: { channel: "matrix", to: "!Stamped:example.org" },
          }),
          sessionId: "winner-session",
          updatedAt: 20,
        },
        env,
        sessionKey: aliasKey,
        storePath,
      });
      const database = openOpenClawAgentDatabase({
        agentId: "main",
        env,
        path: resolveSqliteTargetFromSessionStorePath(storePath, {
          agentId: "main",
          env,
        }).path,
      });
      const insertAuthority = database.db.prepare(
        "INSERT INTO session_recipient_authority (session_key, epoch, created_at, updated_at) VALUES (?, ?, 1, 1)",
      );
      insertAuthority.run(canonicalKey, epoch);
      insertAuthority.run(aliasKey, epoch);

      expect(await repairCanonicalSessionKeys({ apply: true, cfg, env })).toMatchObject({
        foundGroups: 1,
        repairedGroups: 1,
      });
      expect(
        loadExactSessionEntryReadOnly({
          agentId: "main",
          env,
          sessionKey: canonicalKey,
          storePath,
        })?.entry,
      ).toMatchObject({
        createdActor: { type: "human", id: "canonical-owner" },
        sessionId: "winner-session",
      });
      const repaired = database.db
        .prepare("SELECT epoch FROM session_recipient_authority WHERE session_key = ?")
        .get(canonicalKey) as { epoch: string };
      expect(repaired.epoch).not.toBe(epoch);
    });
  });
});
