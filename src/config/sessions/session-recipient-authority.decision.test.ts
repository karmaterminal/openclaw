import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeOpenClawAgentDatabasesForTestAsync } from "../../state/openclaw-agent-db-lifecycle.js";
import {
  resolveOpenClawAgentSqlitePath,
  runOpenClawAgentWriteTransaction,
} from "../../state/openclaw-agent-db.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import {
  assignSessionOwner,
  captureSessionRecipientAuthority,
  isSessionRecipientAuthorityCurrent,
  upsertSessionEntryCore,
} from "./session-accessor.js";
import { advanceSessionRecipientAuthorityInTransaction } from "./session-accessor.sqlite-recipient-authority.js";
import { addSessionMember, removeSessionMember } from "./session-sharing-store.js";
import * as historyRuntime from "./session-transcript-worker-runtime.js";

vi.mock("./session-transcript-worker-runtime.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./session-transcript-worker-runtime.js")>();
  return {
    ...actual,
    withSessionHistoryWorkerDatabase: vi.fn(actual.withSessionHistoryWorkerDatabase),
  };
});

const readThroughWorker = vi.mocked(historyRuntime.withSessionHistoryWorkerDatabase);
const actualRead = (
  await vi.importActual<typeof import("./session-transcript-worker-runtime.js")>(
    "./session-transcript-worker-runtime.js",
  )
).withSessionHistoryWorkerDatabase;
const owner = { type: "human" as const, id: "owner-a", source: "unknown" as const };

afterEach(async () => {
  readThroughWorker.mockReset();
  readThroughWorker.mockImplementation(actualRead);
  await closeOpenClawAgentDatabasesForTestAsync();
});

async function seedBoundSession(env: NodeJS.ProcessEnv, sessionKey: string) {
  const scope = { agentId: "main", env, sessionKey };
  await upsertSessionEntryCore(scope, {
    sessionId: `${sessionKey}-id`,
    updatedAt: 1,
    createdActor: owner,
  });
  await addSessionMember(scope, { identityId: "member-a", addedBy: owner.id, addedAt: 2 });
  return { scope, authority: await captureSessionRecipientAuthority(scope) };
}

function writeEpochOutOfProcess(env: NodeJS.ProcessEnv, sessionKey: string, epoch: string) {
  const databasePath = resolveOpenClawAgentSqlitePath({ agentId: "main", env });
  const child = spawnSync(
    process.execPath,
    [
      "-e",
      `const { DatabaseSync } = require("node:sqlite");
       const db = new DatabaseSync(process.argv[1]);
       db.exec("PRAGMA busy_timeout = 5000");
       const changed = db.prepare("UPDATE session_recipient_authority SET epoch = ? WHERE session_key = ?").run(process.argv[3], process.argv[2]).changes;
       db.close();
       if (changed !== 1) process.exit(3);`,
      databasePath,
      sessionKey,
      epoch,
    ],
    { encoding: "utf8" },
  );
  expect(child.status, child.stderr).toBe(0);
}

describe("recipient authority adopt/deliver decision", () => {
  it("decides from a durable read at the decision point, not an earlier worker snapshot", async () => {
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const { scope, authority } = await seedBoundSession(state.env, "agent:main:foreign-window");
      // A worker-backed check would see this foreign commit land after its read and
      // before its verdict; the decision must never certify that stale snapshot.
      readThroughWorker.mockImplementationOnce(async (...args) => {
        const result = await actualRead(...args);
        writeEpochOutOfProcess(state.env, scope.sessionKey, crypto.randomUUID());
        return result;
      });

      expect(isSessionRecipientAuthorityCurrent(scope, authority)).toBe(true);
      expect(readThroughWorker).not.toHaveBeenCalled();

      writeEpochOutOfProcess(state.env, scope.sessionKey, crypto.randomUUID());
      expect(isSessionRecipientAuthorityCurrent(scope, authority)).toBe(false);
    });
  });

  it("denies an authority another process replaced while the store was closed", async () => {
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const replaced = await seedBoundSession(state.env, "agent:main:restart-replaced");
      const kept = await seedBoundSession(state.env, "agent:main:restart-kept");
      expect(isSessionRecipientAuthorityCurrent(replaced.scope, replaced.authority)).toBe(true);

      await closeOpenClawAgentDatabasesForTestAsync();
      writeEpochOutOfProcess(state.env, replaced.scope.sessionKey, crypto.randomUUID());

      expect(isSessionRecipientAuthorityCurrent(replaced.scope, replaced.authority)).toBe(false);
      expect(isSessionRecipientAuthorityCurrent(kept.scope, kept.authority)).toBe(true);
    });
  });

  it("denies after main-thread and worker-thread advances", async () => {
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const owned = await seedBoundSession(state.env, "agent:main:advance-main");
      expect(
        assignSessionOwner(owned.scope, {
          owner: { type: "human", id: "owner-b" },
          assignedBy: owner,
          assignedAt: 3,
        }),
      ).not.toBeNull();
      expect(isSessionRecipientAuthorityCurrent(owned.scope, owned.authority)).toBe(false);

      const shared = await seedBoundSession(state.env, "agent:main:advance-worker");
      // Member removal advances authority inside the sharing writer worker's transaction.
      expect(await removeSessionMember(shared.scope, "member-a")).not.toBeNull();
      expect(isSessionRecipientAuthorityCurrent(shared.scope, shared.authority)).toBe(false);
    });
  });

  it("keeps authority current after a rolled-back advance", async () => {
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const { scope, authority } = await seedBoundSession(state.env, "agent:main:rollback");
      expect(() =>
        runOpenClawAgentWriteTransaction(
          (database) => {
            advanceSessionRecipientAuthorityInTransaction(database, scope.sessionKey);
            throw new Error("abandon advance");
          },
          { agentId: "main", env: state.env },
        ),
      ).toThrow("abandon advance");

      expect(isSessionRecipientAuthorityCurrent(scope, authority)).toBe(true);
    });
  });

  it("keeps process-held incognito authority with its native owner", async () => {
    await withOpenClawTestState({ scenario: "minimal" }, async () => {
      const scope = { agentId: "main", sessionKey: "agent:main:dashboard:incognito-authority" };
      await upsertSessionEntryCore(scope, {
        sessionId: "incognito-authority",
        updatedAt: 1,
        incognito: true,
      });
      await addSessionMember(scope, { identityId: "guest", addedBy: "owner", addedAt: 2 });
      const authority = await captureSessionRecipientAuthority(scope);
      expect(await captureSessionRecipientAuthority(scope)).toEqual(authority);
      expect(isSessionRecipientAuthorityCurrent(scope, authority)).toBe(true);

      expect(await removeSessionMember(scope, "guest")).not.toBeNull();

      expect(isSessionRecipientAuthorityCurrent(scope, authority)).toBe(false);
    });
  });
});
