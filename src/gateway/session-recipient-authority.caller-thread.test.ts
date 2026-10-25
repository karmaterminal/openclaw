// Recipient authority on the real Gateway thread (#1475, owner ruling A/B on the SQLite worker
// ratchet). This config runs on the process main thread, so session writers take the same
// worker routes as the Gateway. Every recipient-authority statement prepared on this thread is
// caller-thread SQL; worker threads have their own SQLite realm and are not observed here.
import { randomUUID } from "node:crypto";
import { isMainThread } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeHostDataSql } from "../../test/helpers/sqlite-statement-execution-counter.js";
import { enqueueContinuationReturnDeliveries } from "../auto-reply/continuation/targeting.js";
import { resolveFinalSystemEventAdoption } from "../auto-reply/reply/session-system-event-adoption.js";
import { prepareFormattedSystemEvents } from "../auto-reply/reply/session-system-events.js";
import { captureRuntimeConfigAsyncReader } from "../config/io.runtime.js";
import * as sessionAccessor from "../config/sessions/session-accessor.js";
import { SessionEntryChangedDuringReadError } from "../config/sessions/session-entry-read-errors.js";
import { readSessionEntryReadOnlyInWorker } from "../config/sessions/session-entry-read-runtime.js";
import { isSessionRecipientAuthorityCurrentInWorker } from "../config/sessions/session-recipient-authority-current.js";
import { addSessionMember, removeSessionMember } from "../config/sessions/session-sharing-store.js";
import { resetSystemEventsForTest } from "../infra/system-events.js";
import { runWithAgentDatabaseMaintenanceAuthority } from "../state/openclaw-agent-db-lease.js";
import {
  closeOpenClawAgentDatabasesForTest,
  openOpenClawAgentDatabase,
} from "../state/openclaw-agent-db.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";

const ownerA = { type: "human" as const, source: "unknown" as const, id: "owner-a" };
const AUTHORITY_SQL = /\bsession_recipient_authority\b/i;

const authorityRead = vi.hoisted(() => ({ onMatch: undefined as (() => void) | undefined }));

// The match runs after the worker read and before the decision: the gap a racing writer targets.
vi.mock("../config/sessions/session-recipient-authority-types.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../config/sessions/session-recipient-authority-types.js")
    >();
  return {
    ...actual,
    sessionRecipientAuthorityMatches: (
      ...args: Parameters<typeof actual.sessionRecipientAuthorityMatches>
    ) => {
      authorityRead.onMatch?.();
      return actual.sessionRecipientAuthorityMatches(...args);
    },
  };
});

afterEach(() => {
  authorityRead.onMatch = undefined;
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

function prepare(sessionKey: string) {
  return prepareFormattedSystemEvents({
    cfg: {},
    agentId: "main",
    sessionKey,
    isMainSession: false,
    isNewSession: false,
  });
}

/** The final adoption, settling stale authority until none remains, as turn admission does. */
async function finalize(
  prepared: Awaited<ReturnType<typeof prepare>>,
  onDecision?: () => void,
): Promise<string> {
  const resolve = () =>
    resolveFinalSystemEventAdoption({
      prepared: [prepared],
      replaceDeliveryIds: () => {
        onDecision?.();
        return true;
      },
    });
  let adoption = await resolve();
  while (adoption.kind === "settle-stale") {
    await adoption.settle();
    adoption = await resolve();
  }
  return adoption.blocks.map((block) => block.text).join("\n");
}

async function adopt(sessionKey: string) {
  return await finalize(await prepare(sessionKey));
}

/** A writer outside the agent writer FIFO revising the epoch on this thread's own connection. */
function reviseEpochOutsideWriterFifo(env: NodeJS.ProcessEnv, sessionKey: string) {
  const { db } = openOpenClawAgentDatabase({ agentId: "main", env });
  db.prepare(
    "UPDATE session_recipient_authority SET epoch = ?, updated_at = ? WHERE session_key = ?",
  ).run(randomUUID(), Date.now(), sessionKey);
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

  it("fails closed when a writer outside the FIFO revokes between the worker read and adoption", async () => {
    expect(isMainThread).toBe(true);
    await withAuthorityState(async (env) => {
      const sessionKey = "agent:main:caller-thread-read-gap";
      await boundReturn(env, sessionKey);
      const prepared = await prepare(sessionKey);
      let reads = 0;
      authorityRead.onMatch = () => {
        if (reads++ === 0) {
          reviseEpochOutsideWriterFifo(env, sessionKey);
        }
      };
      expect(await finalize(prepared)).not.toContain(`${sessionKey} delegate result`);
      // The witness rejected the first read; the repeat saw the revision.
      expect(reads).toBeGreaterThan(1);
    });
  });

  it("refuses to adopt while a writer outside the FIFO races every authority read", async () => {
    expect(isMainThread).toBe(true);
    await withAuthorityState(async (env) => {
      const sessionKey = "agent:main:caller-thread-read-race";
      await boundReturn(env, sessionKey);
      const prepared = await prepare(sessionKey);
      let decided = false;
      authorityRead.onMatch = () => reviseEpochOutsideWriterFifo(env, sessionKey);
      await expect(
        finalize(prepared, () => {
          decided = true;
        }),
      ).rejects.toBeInstanceOf(SessionEntryChangedDuringReadError);
      expect(decided).toBe(false);
      authorityRead.onMatch = undefined;
      expect(await finalize(prepared)).not.toContain(`${sessionKey} delegate result`);
    });
  });

  it("orders a revoke queued during the read after the adoption decision", async () => {
    expect(isMainThread).toBe(true);
    await withAuthorityState(async (env) => {
      const sessionKey = "agent:main:caller-thread-queued-revoke";
      const { scope } = await boundReturn(env, sessionKey, true);
      const prepared = await prepare(sessionKey);
      const order: string[] = [];
      let revoke: Promise<unknown> | undefined;
      authorityRead.onMatch = () => {
        revoke ??= removeSessionMember(scope, "member-a").then(() => order.push("revoke"));
      };
      const adopted = await finalize(prepared, () => order.push("decide"));
      await revoke;
      // The read held the writer FIFO, so the revoke could not commit under the decision.
      expect(order).toEqual(["decide", "revoke"]);
      expect(adopted).toContain(`${sessionKey} delegate result`);
    });
  });

  type PatchOptions = Parameters<typeof sessionAccessor.patchSessionEntryCore>[2];
  type PatchRoute = (
    patch: (options?: PatchOptions) => Promise<unknown>,
    env: NodeJS.ProcessEnv,
  ) => Promise<unknown>;
  const maintenanceOwner = {
    signal: new AbortController().signal,
    assertCurrent() {},
    assertOwned() {},
    assertOwnedInTransaction() {},
    renew() {},
  };
  it.each([
    ["the default writer route", "default", ((patch) => patch()) satisfies PatchRoute],
    [
      "maintenance authority over an open native connection",
      "maintenance",
      ((patch, env) => {
        // Maintenance authority turns off worker routing; the patch then reuses this thread's
        // already-open native connection instead of claiming a new one.
        const { path } = openOpenClawAgentDatabase({ agentId: "main", env });
        return runWithAgentDatabaseMaintenanceAuthority(maintenanceOwner, path, () => patch());
      }) satisfies PatchRoute,
    ],
  ] as const)(
    "never advances recipient authority on the Gateway thread for a restrictive visibility patch through %s",
    async (_route, key, route) => {
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
          await route(
            (options) =>
              sessionAccessor.patchSessionEntryCore(
                scope,
                () => ({ visibility: "draft" }),
                options,
              ),
            env,
          ).catch(() => undefined);
          expect(sql.queries.filter((query) => AUTHORITY_SQL.test(query))).toEqual([]);
        } finally {
          sql.restore();
        }
        // A committed restriction revoked the captured authority in its own transaction; a
        // refused one changed neither the visibility nor the authority.
        const entry = await readSessionEntryReadOnlyInWorker({
          ...scope,
          projection: "list",
        });
        if (entry?.visibility === "draft") {
          expect(await sessionAccessor.captureSessionRecipientAuthority(scope)).not.toEqual(
            captured,
          );
        } else {
          expect(entry?.visibility).toBe("shared");
          expect(await isSessionRecipientAuthorityCurrentInWorker(scope, captured)).toBe(true);
        }
      });
    },
  );
});
