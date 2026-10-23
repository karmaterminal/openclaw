// Recipient authority on the real Gateway thread (#1475, owner ruling A/B on the SQLite worker
// ratchet). This config runs on the process main thread, so session writers take the same
// worker routes as the Gateway. Every recipient-authority statement prepared on this thread is
// caller-thread SQL; worker threads have their own SQLite realm and are not observed here.
import { isMainThread } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeHostDataSql } from "../../test/helpers/sqlite-statement-execution-counter.js";
import { enqueueContinuationReturnDeliveries } from "../auto-reply/continuation/targeting.js";
import { resolveFinalSystemEventAdoption } from "../auto-reply/reply/session-system-event-adoption.js";
import { prepareFormattedSystemEvents } from "../auto-reply/reply/session-system-events.js";
import { captureRuntimeConfigAsyncReader } from "../config/io.runtime.js";
import * as sessionAccessor from "../config/sessions/session-accessor.js";
import { readSessionEntryReadOnlyInWorker } from "../config/sessions/session-entry-read-runtime.js";
import { addSessionMember, removeSessionMember } from "../config/sessions/session-sharing-store.js";
import { resetSystemEventsForTest } from "../infra/system-events.js";
import { closeOpenClawAgentDatabasesForTest } from "../state/openclaw-agent-db.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";

const ownerA = { type: "human" as const, source: "unknown" as const, id: "owner-a" };
const AUTHORITY_SQL = /\bsession_recipient_authority\b/i;

afterEach(() => {
  resetSystemEventsForTest();
  closeOpenClawAgentDatabasesForTest();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function boundReturn(env: NodeJS.ProcessEnv, sessionKey: string, member = false) {
  const scope = { agentId: "main", env, sessionKey };
  await sessionAccessor.upsertSessionEntryCore(scope, {
    sessionId: `${sessionKey}-session`,
    updatedAt: 1,
    createdActor: ownerA,
    visibility: "shared",
  });
  if (member) {
    expect(
      (await addSessionMember(scope, { identityId: "member-a", addedBy: ownerA.id, addedAt: 2 }))
        .inserted,
    ).toBe(true);
  }
  const authority = await sessionAccessor.captureSessionRecipientAuthority(scope);
  const delivery = await enqueueContinuationReturnDeliveries({
    targetSessionKeys: [sessionKey],
    text: `${sessionKey} delegate result`,
    idempotencyKeyBase: sessionKey,
    recipientAuthorities: new Map([[sessionKey, authority]]),
    ownerAgentId: "main",
    stateDir: env.OPENCLAW_STATE_DIR,
  });
  return { scope, deliveryId: delivery.deliveryIds[0] };
}

/** Prepare and adopt one drain; `await` also serves a synchronous final decision. */
async function adopt(sessionKey: string) {
  const prepared = await prepareFormattedSystemEvents({
    cfg: {},
    agentId: "main",
    sessionKey,
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

async function withAuthorityState(run: (env: NodeJS.ProcessEnv) => Promise<void>) {
  await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
    vi.stubEnv("OPENCLAW_STATE_DIR", state.env.OPENCLAW_STATE_DIR);
    await captureRuntimeConfigAsyncReader()();
    await run(state.env);
  });
}

describe("recipient authority on the Gateway thread", () => {
  it("adopts a current bound return without caller-thread recipient-authority SQL", async () => {
    expect(isMainThread).toBe(true);
    await withAuthorityState(async (env) => {
      const sessionKey = "agent:main:caller-thread-current";
      const sql = observeHostDataSql();
      try {
        await boundReturn(env, sessionKey);
        expect(await adopt(sessionKey)).toContain(`${sessionKey} delegate result`);
        expect(sql.queries.filter((query) => AUTHORITY_SQL.test(query))).toEqual([]);
      } finally {
        sql.restore();
      }
    });
  });

  it("settles a revoked bound return without caller-thread recipient-authority SQL", async () => {
    expect(isMainThread).toBe(true);
    await withAuthorityState(async (env) => {
      const sessionKey = "agent:main:caller-thread-revoked";
      const sql = observeHostDataSql();
      try {
        const { scope } = await boundReturn(env, sessionKey, true);
        expect(await removeSessionMember(scope, "member-a")).not.toBeNull();
        expect(await adopt(sessionKey)).not.toContain(`${sessionKey} delegate result`);
        expect(sql.queries.filter((query) => AUTHORITY_SQL.test(query))).toEqual([]);
      } finally {
        sql.restore();
      }
    });
  });

  it.each([
    ["restrict then restore visibility", "visibility"],
    ["remove then re-add the member", "membership"],
  ] as const)(
    "keeps a captured return stale after a cycle that ends where it began: %s",
    async (_label, cycle) => {
      expect(isMainThread).toBe(true);
      await withAuthorityState(async (env) => {
        const sessionKey = `agent:main:caller-thread-cycle-${cycle}`;
        const { scope } = await boundReturn(env, sessionKey, cycle === "membership");
        if (cycle === "visibility") {
          await sessionAccessor.patchSessionEntryCore(scope, () => ({ visibility: "draft" }));
          await sessionAccessor.patchSessionEntryCore(scope, () => ({ visibility: "shared" }));
        } else {
          expect(await removeSessionMember(scope, "member-a")).not.toBeNull();
          expect(
            (
              await addSessionMember(scope, {
                identityId: "member-a",
                addedBy: ownerA.id,
                addedAt: 3,
              })
            ).inserted,
          ).toBe(true);
        }
        // The sharing facts are back where they started; the durable epoch is not.
        expect(await adopt(sessionKey)).not.toContain(`${sessionKey} delegate result`);
      });
    },
  );

  it.each([
    ["the default writer route", "default", {}],
    [
      "an in-transaction hook",
      "hook",
      { afterPersistInTransaction: () => undefined } as Parameters<
        typeof sessionAccessor.patchSessionEntryCore
      >[2],
    ],
  ] as const)(
    "never advances recipient authority on the Gateway thread for a restrictive visibility patch through %s",
    async (_route, key, options) => {
      expect(isMainThread).toBe(true);
      await withAuthorityState(async (env) => {
        const scope = { agentId: "main", env, sessionKey: `agent:main:restrict-${key}` };
        await sessionAccessor.upsertSessionEntryCore(scope, {
          sessionId: "restrict-session",
          updatedAt: 1,
          createdActor: ownerA,
          visibility: "shared",
        });
        const captured = await sessionAccessor.captureSessionRecipientAuthority(scope);
        const sql = observeHostDataSql();
        try {
          await sessionAccessor
            .patchSessionEntryCore(scope, () => ({ visibility: "draft" }), options)
            .catch(() => undefined);
          expect(sql.queries.filter((query) => AUTHORITY_SQL.test(query))).toEqual([]);
        } finally {
          sql.restore();
        }
        // Whatever route served it, an effective restriction revoked the captured authority.
        const entry = await readSessionEntryReadOnlyInWorker({
          ...scope,
          projection: "list",
        });
        if (entry?.visibility === "draft") {
          expect(await sessionAccessor.captureSessionRecipientAuthority(scope)).not.toEqual(
            captured,
          );
        }
      });
    },
  );
});
