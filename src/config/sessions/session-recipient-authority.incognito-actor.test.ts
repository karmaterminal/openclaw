// Narrowing visibility advances recipient authority inside the native entry
// mutation transaction (session-accessor.sqlite-entry-mutation.ts). Incognito
// sessions are owned by the memory-only session actor (upstream #170712): its
// writer has no SQLite transaction and does not run that advance. These tests
// pin why that cannot leave a
// narrowed incognito session with live recipient authority: while an incognito
// owner holds a session namespace, no recipient authority can be captured for
// it, and no authority captured natively for the same key is current.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { afterEach, expect, it } from "vitest";
import {
  closeOpenClawAgentDatabasesForTest,
  openOpenClawAgentDatabase,
} from "../../state/openclaw-agent-db.js";
import {
  resolveIncognitoOpenClawAgentSqlitePath,
  resolveOpenClawAgentSqlitePath,
} from "../../state/openclaw-agent-db.paths.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { captureRuntimeConfigAsyncReader } from "../io.runtime.js";
import { captureSessionRecipientAuthority } from "./session-accessor.js";
import { patchSessionEntryCore } from "./session-accessor.sqlite-entry.js";
import type { SessionActorAuthority } from "./session-actor-contract.js";
import { memorySessionActorOwners } from "./session-actor-memory-owner.js";
import { commitMemory } from "./session-actor-memory-publication.test-support.js";
import { acquireSessionActorStorage } from "./session-actor-storage-acquisition.js";
import { runWithSessionActorStorage } from "./session-actor-storage-binding.js";
import { isSessionRecipientAuthorityCurrentInWorker } from "./session-recipient-authority-current.js";
import {
  sessionRecipientAuthorityMatches,
  type SessionRecipientAuthority,
} from "./session-recipient-authority-types.js";
import { readSessionRecipientAuthorityEpochInDatabase } from "./session-recipient-authority.worker.js";

const DEDICATED_OWNER = "Incognito collaboration command requires its dedicated owner";
const authority: SessionActorAuthority = { assertCurrent() {}, authorize() {} };
const lifetime = { assertCurrent() {}, assertReadable() {} };

afterEach(() => {
  memorySessionActorOwners.reset();
  closeOpenClawAgentDatabasesForTest();
});

/** Create the session through its memory owner, exactly as incognito acquisition does. */
async function createIncognitoSession(env: NodeJS.ProcessEnv, name: string) {
  const sessionKey = `agent:main:dashboard:incognito-${name}`;
  const binding = await acquireSessionActorStorage(
    { agentId: "main", sessionKey, env },
    { authority, lifetime, create: true },
  );
  if (!binding) {
    throw new Error("Expected the incognito memory owner to admit creation");
  }
  await commitMemory(binding.actor.storage, "session.entry.create", {
    entry: { sessionId: name, lifecycleRevision: name, updatedAt: 1, incognito: true },
  });
  const owner = memorySessionActorOwners.read({
    agentId: "main",
    path: resolveIncognitoOpenClawAgentSqlitePath({ agentId: "main", env }),
  });
  if (!owner) {
    throw new Error("Expected the incognito memory owner to hold the namespace");
  }
  return { binding, owner, sessionKey };
}

it("refuses to capture recipient authority for a session its incognito owner holds", async () => {
  await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
    await captureRuntimeConfigAsyncReader()();
    const env = state.env;
    const { binding, sessionKey } = await createIncognitoSession(env, "capture");
    const nativeStorePath = resolveOpenClawAgentSqlitePath({ agentId: "main", env });
    try {
      // Through the memory owner's collaboration path: no authority owner exists.
      await expect(
        captureSessionRecipientAuthority({ agentId: "main", sessionKey, env }),
      ).rejects.toThrow(DEDICATED_OWNER);
      // Naming the native store while the owner's binding is active: still refused.
      await expect(
        runWithSessionActorStorage(
          binding,
          async () =>
            await captureSessionRecipientAuthority({
              agentId: "main",
              storePath: nativeStorePath,
              sessionKey,
              env,
            }),
        ),
      ).rejects.toThrow(DEDICATED_OWNER);
      // Neither refusal reached the native writer, which would have created the store.
      expect(fs.existsSync(nativeStorePath)).toBe(false);
    } finally {
      await binding.actor.release();
    }
  });
});

it("never treats natively captured authority as current while an incognito owner holds the key", async () => {
  await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
    await captureRuntimeConfigAsyncReader()();
    const env = state.env;
    const sessionKey = "agent:main:dashboard:incognito-narrow";
    const controlKey = "agent:main:dashboard:durable-narrow";
    const durable = openOpenClawAgentDatabase({ agentId: "main", env });
    const scope = { agentId: "main", storePath: durable.path, sessionKey, env };

    // The native writer cannot bind authority for an incognito key at all.
    await expect(captureSessionRecipientAuthority(scope)).rejects.toThrow(DEDICATED_OWNER);
    // A native epoch row for the same key (as the retired SQLite incognito owner
    // wrote) and the same epoch for a durable control key.
    const nativeAuthority: SessionRecipientAuthority = { state: "bound", epoch: randomUUID() };
    const insertEpoch = durable.db.prepare(
      "INSERT INTO session_recipient_authority (session_key, epoch, created_at, updated_at) VALUES (?, ?, 1, 1)",
    );
    insertEpoch.run(sessionKey, nativeAuthority.epoch);
    insertEpoch.run(controlKey, nativeAuthority.epoch);
    const readNativeEpoch = () => readSessionRecipientAuthorityEpochInDatabase(durable, sessionKey);
    expect(sessionRecipientAuthorityMatches(nativeAuthority, readNativeEpoch())).toBe(true);
    // The durable control proves the row would be current for a natively owned key.
    expect(
      await isSessionRecipientAuthorityCurrentInWorker(
        { ...scope, sessionKey: controlKey },
        nativeAuthority,
      ),
    ).toBe(true);
    expect(await isSessionRecipientAuthorityCurrentInWorker(scope, nativeAuthority)).toBe(false);

    const { binding, owner } = await createIncognitoSession(env, "narrow");
    try {
      // While the owner holds the namespace the native epoch is not current, so
      // no return carrying it can be delivered or adopted.
      expect(await isSessionRecipientAuthorityCurrentInWorker(scope, nativeAuthority)).toBe(false);

      // The memory writer commits a narrowing visibility change, and authority
      // stays non-current afterwards.
      const patched = await runWithSessionActorStorage(
        binding,
        async () => await patchSessionEntryCore(scope, () => ({ visibility: "draft" })),
      );
      expect(patched?.visibility).toBe("draft");
      expect(await isSessionRecipientAuthorityCurrentInWorker(scope, nativeAuthority)).toBe(false);
      expect(owner.readSession(sessionKey, authority)?.entry?.visibility).toBe("draft");
      // The memory write never reached the native store's epoch row.
      expect(sessionRecipientAuthorityMatches(nativeAuthority, readNativeEpoch())).toBe(true);
    } finally {
      await binding.actor.release();
    }
  });
});
