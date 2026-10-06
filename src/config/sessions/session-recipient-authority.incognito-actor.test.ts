// `session.visibility.set` advances recipient authority inside the visibility
// write transaction through `afterPersistInTransaction`. The incognito-actor
// writer (`patchIncognitoSessionEntry`) has no main-thread transaction and does
// not run that hook. These tests pin why that cannot leave a narrowed incognito
// session with live recipient authority: while an incognito actor owns a
// session namespace, no recipient authority can be captured for it, and no
// authority captured natively for the same key is current.
import assert from "node:assert/strict";
import { afterAll, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../test/helpers/temp-dir.js";
import { closeOpenClawAgentDatabasesForTestAsync } from "../../state/openclaw-agent-db-lifecycle.js";
import type { IncognitoAgentDatabaseExecution } from "../../state/openclaw-agent-execution-incognito.js";
import { captureOpenClawAgentDatabaseExecution } from "../../state/openclaw-agent-execution.js";
import {
  captureSessionRecipientAuthority,
  isSessionRecipientAuthorityCurrent,
} from "./session-accessor.js";
import { patchSessionEntryCore } from "./session-accessor.sqlite-entry.js";
import { withIncognitoSessionActor } from "./session-incognito-binding.js";
import type { IncognitoSessionAuthority } from "./session-incognito-contract.js";

const tempDirs = useAutoCleanupTempDirTracker(afterAll);
const authority: IncognitoSessionAuthority = { assertCurrent() {} };

async function openActor(env: NodeJS.ProcessEnv): Promise<IncognitoAgentDatabaseExecution> {
  const actor = await captureOpenClawAgentDatabaseExecution({
    kind: "ephemeral",
    agentId: "main",
    env,
    authority,
  });
  assert(actor);
  return actor;
}

async function createIncognitoSession(actor: IncognitoAgentDatabaseExecution, name: string) {
  const sessionKey = `agent:main:dashboard:incognito-${name}`;
  await actor.sessions.create(authority, {
    sessionKey,
    entry: { sessionId: name, lifecycleRevision: name, updatedAt: 1, incognito: true },
  });
  return sessionKey;
}

it("refuses to capture recipient authority for a session its incognito actor owns", async () => {
  const env = { OPENCLAW_STATE_DIR: tempDirs.make("incognito-authority-capture-") };
  const actor = await openActor(env);
  try {
    const sessionKey = await createIncognitoSession(actor, "capture");
    const scope = { agentId: actor.agentId, storePath: actor.path, sessionKey, env };

    // Through the actor's collaboration owner: no authority owner exists.
    await expect(
      captureSessionRecipientAuthority({ ...scope, incognito: { actor, authority } } as never),
    ).rejects.toThrow("Incognito collaboration command requires its dedicated owner");
    // Through the native writer while the actor binding is active: refused.
    await expect(
      withIncognitoSessionActor(actor, async () => await captureSessionRecipientAuthority(scope)),
    ).rejects.toThrow();
  } finally {
    await actor.close().catch(() => undefined);
  }
});

it("never treats natively captured authority as current while an incognito actor owns the key", async () => {
  const env = { OPENCLAW_STATE_DIR: tempDirs.make("incognito-authority-current-") };
  const probe = await openActor(env);
  const storePath = probe.path;
  await probe.close();
  const sessionKey = "agent:main:dashboard:incognito-narrow";
  const scope = { agentId: "main", storePath, sessionKey, env };

  // Authority bound by the native owner before any actor existed.
  const nativeAuthority = await captureSessionRecipientAuthority(scope);
  expect(isSessionRecipientAuthorityCurrent(scope, nativeAuthority)).toBe(true);
  await closeOpenClawAgentDatabasesForTestAsync();

  const actor = await openActor(env);
  try {
    await createIncognitoSession(actor, "narrow");
    // While the actor owns the namespace the native epoch is not current, so
    // no return carrying it can be delivered or adopted.
    expect(isSessionRecipientAuthorityCurrent(scope, nativeAuthority)).toBe(false);

    // The actor writer commits a narrowing visibility change without running
    // the in-transaction hook, and authority stays non-current afterwards.
    let hookRan = false;
    const patched = await withIncognitoSessionActor(
      actor,
      async () =>
        await patchSessionEntryCore(scope, () => ({ visibility: "private" }), {
          afterPersistInTransaction: () => {
            hookRan = true;
          },
        }),
    );
    expect(patched?.visibility).toBe("private");
    expect(hookRan).toBe(false);
    expect(isSessionRecipientAuthorityCurrent(scope, nativeAuthority)).toBe(false);
    expect((await actor.sessions.read(authority, { sessionKey })).entry?.visibility).toBe(
      "private",
    );
  } finally {
    await actor.close().catch(() => undefined);
  }
});
