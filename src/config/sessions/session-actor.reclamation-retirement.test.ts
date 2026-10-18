import { once } from "node:events";
import type { Worker } from "node:worker_threads";
import { expect, it, vi } from "vitest";
import { SQLITE_IDLE_HANDLE_TTL_MS } from "../../infra/sqlite-handle-lifecycle.js";
import { readOpenClawAgentDatabaseIdentity } from "../../state/openclaw-agent-db-identity.js";
import { openOpenClawAgentDatabase } from "../../state/openclaw-agent-db.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { deleteSessionEntryLifecycle } from "./session-accessor.js";
import * as sqliteArchive from "./session-accessor.sqlite-archive.js";
import { readExactSessionEntryRow } from "./session-accessor.sqlite-entry-store.js";
import { replaceSessionEntrySync } from "./session-accessor.sqlite-entry.js";
import { seedUnindexedTranscriptForTest } from "./session-accessor.sqlite-import.test-support.js";
import { runSqliteSessionReclamation } from "./session-accessor.sqlite-reclamation-run.js";
import { resolveSessionReclamationDatabaseOptions } from "./session-accessor.sqlite-reclamation.js";
import type { SessionActorAuthority } from "./session-actor-contract.js";
import { createDurableSessionActorFactory } from "./session-actor-durable.js";
import { createSessionCompoundWorkerFixture } from "./session-compound-worker.test-support.js";

// A session delete or archive leaves a retained reclamation Worker that retires after
// thirty idle minutes. Its retirement must not wedge the room's next turn (#1475 D5).
// mock-isolation: this transport proof does not schedule unrelated maintenance.
vi.mock("./session-accessor.sqlite-maintenance-kick.js", () => ({
  kickSessionEntryMaintenanceAfterWrite() {},
}));
// mock-isolation: Keep background disk-budget eviction out of the fixture's transport proof.
vi.mock("./session-history-eviction.js", () => ({ kickSessionHistoryDiskBudgetMaintenance() {} }));

const authority: SessionActorAuthority = { assertCurrent() {}, authorize() {} };

it.each(["room delete", "archive publication"] as const)(
  "keeps the room's next turn live after a %s Worker idles out",
  async (reclamation) => {
    // Every host idle handle shares the thirty-minute TTL, so fake time owns them all.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const fixture = createSessionCompoundWorkerFixture();
      const identity = readOpenClawAgentDatabaseIdentity(fixture.database);
      if (typeof identity.identity !== "string") {
        throw new Error("Fixture requires durable storage");
      }
      const target = {
        sessionKey: fixture.scope.sessionKey,
        database: {
          kind: "file" as const,
          physicalIdentity: identity.identity,
          birthtime: identity.birthtime,
          nativeLocation: fixture.database.path,
        },
      };
      const options = { agentId: "main", path: fixture.database.path, env: state.env };
      const turn = async (updatedAt: number) => {
        const actor = await createDurableSessionActorFactory(options).acquire(target, {
          assertCurrent() {},
          assertReadable() {},
        });
        if ("kind" in actor) {
          throw new Error("Durable session must be actor-owned");
        }
        try {
          return await actor
            .patch(
              {
                commandId: `turn-${updatedAt}`,
                phaseId: `turn-${updatedAt}`,
                reducers: [{ kind: "activity", updatedAt }],
              },
              authority,
            )
            .then(
              (outcome) => ({
                kind: outcome.kind,
                ...("error" in outcome ? { error: outcome.error } : {}),
              }),
              (error: unknown) => ({ kind: "thrown", error: String(error) }),
            );
        } finally {
          await actor.release();
        }
      };
      const workers: Worker[] = [];
      const spawn = sqliteArchive.createSqliteTranscriptArchiveWorker;
      vi.spyOn(sqliteArchive, "createSqliteTranscriptArchiveWorker").mockImplementation(
        (data, nativeLocations) => {
          const worker = spawn(data, nativeLocations);
          workers.push(worker);
          return worker;
        },
      );
      try {
        expect(await turn(10)).toEqual({ kind: "committed" });
        if (reclamation === "room delete") {
          await seedUnindexedTranscriptForTest({
            agentId: "main",
            storePath: fixture.database.path,
            sessionKey: fixture.scope.sessionKey,
            entry: { sessionId: "deleted-room", updatedAt: 11 },
            events: [
              { type: "session", version: 3, id: "deleted-room" },
              {
                type: "message",
                id: "user",
                parentId: null,
                message: { role: "user", content: "hi" },
              },
            ].map((event, seq) => ({
              session_id: "deleted-room",
              seq,
              created_at: seq + 1,
              event_json: JSON.stringify(event),
            })),
          });
          const deletion = await deleteSessionEntryLifecycle({
            agentId: "main",
            storePath: fixture.database.path,
            archiveTranscript: true,
            target: fixture.target,
          });
          expect(deletion).toMatchObject({ deleted: true });
          // The next inbound message rebinds the room key to a replacement session.
          replaceSessionEntrySync(fixture.scope, { sessionId: "replacement", updatedAt: 12 });
        } else {
          await expect(
            runSqliteSessionReclamation({
              forceInProcess: false,
              plan: {
                kind: "archive-publish-prepare",
                databaseOptions: resolveSessionReclamationDatabaseOptions(options),
                materializedPlans: [],
                archiveDirectory: state.path("archives"),
                requested: [],
              },
            }),
          ).resolves.toMatchObject({ kind: "archive-publish-prepare" });
        }
        expect(workers.length).toBeGreaterThan(0);
        const exited = workers.map((worker) => once(worker, "exit"));
        // Room turns keep the agent execution worker warm while the reclamation Worker idles.
        await vi.advanceTimersByTimeAsync(SQLITE_IDLE_HANDLE_TTL_MS - 10 * 60_000);
        expect(await turn(20)).toEqual({ kind: "committed" });
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        await Promise.all(exited);
        // The first turn after the idle stretch must not find a stale writer fence.
        expect(await turn(30)).toEqual({ kind: "committed" });
        expect(await turn(40)).toEqual({ kind: "committed" });
        // The fixture's host handle may itself have idled out; read through a fresh open.
        expect(
          readExactSessionEntryRow(openOpenClawAgentDatabase(options), fixture.scope.sessionKey)
            ?.entry.updatedAt,
        ).toBe(40);
      } finally {
        vi.restoreAllMocks();
      }
    }).finally(() => vi.useRealTimers());
  },
);
