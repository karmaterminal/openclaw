// Continuation (karmaterminal): canonical-key repair must re-stamp the session's recipient
// authority (schema v32) from the selected occupant. Upstream retired the owner-repair suite this
// case lived in (#180132); the shared fixture stays in doctor-session-repair-fixture.test-support.ts.
import { afterEach, describe, expect, it } from "vitest";
import { closeOpenClawAgentDatabasesForTest } from "../state/openclaw-agent-db.js";
import { withStateDirEnv } from "../test-helpers/state-dir-env.js";
import { normalizeSessionDeliveryState } from "../utils/delivery-context.shared.js";
import { createCanonicalRepairFixture } from "./doctor-session-repair-fixture.test-support.js";

afterEach(() => closeOpenClawAgentDatabasesForTest());

describe("doctor canonical repair of recipient authority", () => {
  it("compares authority ownership against the selected occupant before stamp preservation", async () => {
    await withStateDirEnv("openclaw-doctor-stamped-authority-", async ({ stateDir }) => {
      const { insert, load, database, expectRepair } = createCanonicalRepairFixture(
        stateDir,
        "work",
      );
      const canonicalKey = "agent:main:matrix:channel:!Stamped:example.org";
      const aliasKey = canonicalKey.toLowerCase();
      const epoch = "11111111-1111-4111-8111-111111111111";
      insert(canonicalKey, {
        createdActor: { type: "human", source: "unknown", id: "canonical-owner" },
        sandbox: "required",
        sessionId: "canonical-session",
        updatedAt: 10,
      });
      insert(aliasKey, {
        createdActor: { type: "human", source: "unknown", id: "winner-owner" },
        delivery: normalizeSessionDeliveryState({
          context: { channel: "matrix", to: "!Stamped:example.org" },
        }),
        sessionId: "winner-session",
        updatedAt: 20,
      });
      const agentDatabase = database();
      const insertAuthority = agentDatabase.db.prepare(
        "INSERT INTO session_recipient_authority (session_key, epoch, created_at, updated_at) VALUES (?, ?, 1, 1)",
      );
      insertAuthority.run(canonicalKey, epoch);
      insertAuthority.run(aliasKey, epoch);

      await expectRepair({ foundGroups: 1, repairedGroups: 1 });
      expect(load(canonicalKey)?.entry).toMatchObject({
        createdActor: { type: "human", id: "canonical-owner" },
        sessionId: "winner-session",
      });
      const repaired = agentDatabase.db
        .prepare("SELECT epoch FROM session_recipient_authority WHERE session_key = ?")
        .get(canonicalKey) as { epoch: string };
      expect(repaired.epoch).not.toBe(epoch);
    });
  });
});
