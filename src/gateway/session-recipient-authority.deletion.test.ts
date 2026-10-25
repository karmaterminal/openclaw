// Deletion is a generation edge of recipient authority (openclaw-agent-schema.sql): a return
// bound before its session was deleted must never reach a turn of the session recreated under
// the same key. Each case deletes through one deletion owner on the Gateway's routes (this
// config runs on the process main thread), recreates the key, and adopts the recipient's next
// turn the way reply admission does (owner ruling 🩸 1563355530553200761).
import { randomUUID } from "node:crypto";
import { isMainThread } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueContinuationReturnDeliveries } from "../auto-reply/continuation/targeting.js";
import { resolveFinalSystemEventAdoption } from "../auto-reply/reply/session-system-event-adoption.js";
import { prepareFormattedSystemEvents } from "../auto-reply/reply/session-system-events.js";
import { captureRuntimeConfigAsyncReader } from "../config/io.runtime.js";
import { setRuntimeConfigSnapshot } from "../config/runtime-snapshot.js";
import { purgeAgentSessionStoreEntries } from "../config/sessions/cleanup-service.js";
import * as sessionAccessor from "../config/sessions/session-accessor.js";
import { runSqliteSessionReclamation } from "../config/sessions/session-accessor.sqlite-reclamation-run.js";
import { createSessionMaintenanceFinalizationOperation } from "../config/sessions/session-accessor.sqlite-reclamation.js";
import { resetSessionStore } from "../config/sessions/session-accessor.sqlite-reset.js";
import { readSessionEntryReadOnlyInWorker } from "../config/sessions/session-entry-read-runtime.js";
import { isSessionRecipientAuthorityCurrentInWorker } from "../config/sessions/session-recipient-authority-current.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resetSystemEventsForTest } from "../infra/system-events.js";
import {
  closeOpenClawAgentDatabasesForTest,
  openOpenClawAgentDatabase,
} from "../state/openclaw-agent-db.js";
import { resolveOpenClawAgentSqlitePath } from "../state/openclaw-agent-db.paths.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";

const ownerA = { type: "human" as const, source: "unknown" as const, id: "owner-a" };

afterEach(() => {
  resetSystemEventsForTest();
  closeOpenClawAgentDatabasesForTest();
  vi.unstubAllEnvs();
});

type Scope = { agentId: string; sessionKey: string; env: NodeJS.ProcessEnv };

async function withAgentState(
  run: (env: NodeJS.ProcessEnv) => Promise<void>,
  cfg: OpenClawConfig = {},
) {
  await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
    vi.stubEnv("OPENCLAW_STATE_DIR", state.env.OPENCLAW_STATE_DIR);
    setRuntimeConfigSnapshot(cfg);
    await state.writeConfig(cfg);
    await captureRuntimeConfigAsyncReader()();
    await run(state.env);
  });
}

function createSession(scope: Scope & { storePath?: string }, sessionId: string) {
  return sessionAccessor.upsertSessionEntryCore(scope, {
    sessionId,
    updatedAt: Date.now(),
    createdActor: ownerA,
    visibility: "shared",
  });
}

/** The recipient's next turn: prepare its drain and settle stale authority until it adopts. */
async function adoptNextTurn(scope: Scope): Promise<string> {
  const prepared = await prepareFormattedSystemEvents({
    cfg: {},
    agentId: scope.agentId,
    sessionKey: scope.sessionKey,
    isMainSession: false,
    isNewSession: false,
  });
  let adoption = await resolveFinalSystemEventAdoption({ prepared: [prepared] });
  while (adoption.kind === "settle-stale") {
    await adoption.settle();
    adoption = await resolveFinalSystemEventAdoption({ prepared: [prepared] });
  }
  return adoption.blocks.map((block) => block.text).join("\n");
}

const deletions: ReadonlyArray<
  readonly [label: string, agentId: string, remove: (scope: Scope) => Promise<unknown>]
> = [
  [
    "lifecycle deletion",
    "main",
    (scope) =>
      sessionAccessor.deleteSessionEntryLifecycle({
        agentId: scope.agentId,
        archiveTranscript: false,
        storePath: resolveOpenClawAgentSqlitePath(scope),
        target: { canonicalKey: scope.sessionKey, storeKeys: [scope.sessionKey] },
      }),
  ],
  [
    "agent purge",
    "ops",
    async (scope) => {
      // Best-effort by contract: a failed purge only logs, so the precondition below decides.
      // The purge reads the process state dir, which withAgentState stubs to scope.env's.
      await purgeAgentSessionStoreEntries({}, scope.agentId);
    },
  ],
  [
    "maintenance finalization",
    "main",
    (scope) =>
      runSqliteSessionReclamation({
        plan: createSessionMaintenanceFinalizationOperation({
          agentId: scope.agentId,
          databaseOptions: { agentId: scope.agentId, env: scope.env },
          entries: [
            {
              sessionKey: scope.sessionKey,
              expectedEntry: sessionAccessor.loadSessionEntry(scope),
            },
          ],
          materializedPlans: [],
        }),
      }),
  ],
  [
    "offline reset",
    "main",
    (scope) =>
      resetSessionStore({
        agentId: scope.agentId,
        storePath: resolveOpenClawAgentSqlitePath(scope),
      }),
  ],
];

describe("recipient authority across session deletion", () => {
  it.each(deletions)(
    "never adopts a return bound before %s into the recreated session",
    async (label, agentId, remove) => {
      expect(isMainThread).toBe(true);
      await withAgentState(async (env) => {
        const scope = { agentId, sessionKey: `agent:${agentId}:deleted-then-recreated`, env };
        await createSession(scope, "before-deletion");
        const authority = await sessionAccessor.captureSessionRecipientAuthority(scope);
        const text = `return bound before ${label}`;
        const delivery = await enqueueContinuationReturnDeliveries({
          targetSessionKeys: [scope.sessionKey],
          text,
          idempotencyKeyBase: scope.sessionKey,
          recipientAuthorities: new Map([[scope.sessionKey, authority]]),
          ownerAgentId: agentId,
          stateDir: env.OPENCLAW_STATE_DIR,
        });
        expect(delivery.deliveryIds).toHaveLength(1);

        await remove(scope);
        expect(await readSessionEntryReadOnlyInWorker({ ...scope, projection: "list" })).toBe(
          undefined,
        );
        await createSession(scope, "recreated");

        expect(await isSessionRecipientAuthorityCurrentInWorker(scope, authority)).toBe(false);
        expect(await adoptNextTurn(scope)).not.toContain(text);
      });
    },
  );
});

describe("recipient authority checks on the Gateway thread", () => {
  it("reads a binding for an agent database that does not exist as not current", async () => {
    expect(isMainThread).toBe(true);
    await withAgentState(async (env) => {
      const scope = { agentId: "absent", sessionKey: "agent:absent:never-created", env };
      expect(
        await isSessionRecipientAuthorityCurrentInWorker(scope, {
          state: "bound",
          epoch: randomUUID(),
        }),
      ).toBe(false);
    });
  });

  it("checks a session stored in another agent's database while that database is open here", async () => {
    expect(isMainThread).toBe(true);
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      vi.stubEnv("OPENCLAW_STATE_DIR", state.env.OPENCLAW_STATE_DIR);
      // One agent database owned by main and shared with ops, as explicit ownership allows.
      const storePath = state.statePath("shared.sqlite");
      const cfg = {
        agents: { ownership: "explicit", entries: { main: {}, ops: {} } },
        session: { store: storePath },
      } satisfies OpenClawConfig;
      setRuntimeConfigSnapshot(cfg);
      await state.writeConfig(cfg);
      await captureRuntimeConfigAsyncReader()();
      const scope = { agentId: "ops", sessionKey: "agent:ops:shared", env: state.env, storePath };
      await createSession(scope, "shared");
      const authority = await sessionAccessor.captureSessionRecipientAuthority(scope);
      // The store's owner opens it on this thread, as a native maintenance read would.
      openOpenClawAgentDatabase({ agentId: "main", path: storePath });

      expect(await isSessionRecipientAuthorityCurrentInWorker(scope, authority)).toBe(true);
    });
  });
});
