import { afterEach, describe, expect, it } from "vitest";
import {
  closeOpenClawAgentDatabasesForTest,
  openOpenClawAgentDatabase,
} from "../../state/openclaw-agent-db.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import {
  assignSessionOwner,
  captureSessionRecipientAuthority,
  deleteSessionEntryLifecycle,
  isSessionRecipientAuthorityCurrent,
  patchSessionEntryCore,
  resetSessionEntryLifecycle,
  upsertSessionEntryCore,
} from "./session-accessor.js";
import { addSessionMember, removeSessionMember } from "./session-sharing-store.js";

afterEach(() => closeOpenClawAgentDatabasesForTest());

describe("session recipient authority", () => {
  it("preserves one logical mailbox across rollover, fallback, compaction, and reopen", async () => {
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const scope = {
        agentId: "main",
        env: state.env,
        sessionKey: "agent:main:continuity",
      };
      await upsertSessionEntryCore(scope, {
        sessionId: "session-before",
        updatedAt: 1,
        lifecycleRevision: "lifecycle-before",
      });

      const authority = await captureSessionRecipientAuthority(scope);
      expect(authority.state).toBe("bound");

      await upsertSessionEntryCore(scope, {
        sessionId: "session-after",
        updatedAt: 2,
        lifecycleRevision: "lifecycle-new-conversation",
      });
      expect(await isSessionRecipientAuthorityCurrent(scope, authority)).toBe(true);

      await patchSessionEntryCore(scope, () => ({
        modelProvider: "fallback-provider",
        model: "fallback-model",
        compactionCount: 2,
      }));
      expect(await isSessionRecipientAuthorityCurrent(scope, authority)).toBe(true);

      closeOpenClawAgentDatabasesForTest();
      expect(await isSessionRecipientAuthorityCurrent(scope, authority)).toBe(true);
    });
  });

  it.each(["new", "reset"] as const)(
    "preserves an absent-target covenant through /%s materialization",
    async (reason) => {
      await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
        const scope = {
          agentId: "main",
          env: state.env,
          sessionKey: `agent:main:${reason}-continuity`,
        };
        const authority = await captureSessionRecipientAuthority(scope);
        await upsertSessionEntryCore(scope, { sessionId: "session-before", updatedAt: 1 });
        await resetSessionEntryLifecycle({
          agentId: "main",
          storePath: openOpenClawAgentDatabase({
            agentId: "main",
            env: state.env,
          }).path,
          target: { canonicalKey: scope.sessionKey, storeKeys: [scope.sessionKey] },
          resetBoundary: { context: "clear", reason, cwd: state.workspaceDir },
          buildNextEntry: () => ({ sessionId: "session-after", updatedAt: 2 }),
        });
        expect(await isSessionRecipientAuthorityCurrent(scope, authority)).toBe(true);
      });
    },
  );

  it("binds an absent target through first materialization and rejects its replacement", async () => {
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const scope = {
        agentId: "main",
        env: state.env,
        sessionKey: "agent:main:replacement",
      };
      const absentAuthority = await captureSessionRecipientAuthority(scope);
      expect(absentAuthority).toEqual({
        state: "bound",
        epoch: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      });
      await upsertSessionEntryCore(scope, { sessionId: "session-before", updatedAt: 1 });
      expect(await isSessionRecipientAuthorityCurrent(scope, absentAuthority)).toBe(true);

      await deleteSessionEntryLifecycle({
        agentId: "main",
        archiveTranscript: false,
        storePath: openOpenClawAgentDatabase({
          agentId: "main",
          env: state.env,
        }).path,
        target: { canonicalKey: scope.sessionKey, storeKeys: [scope.sessionKey] },
      });
      await upsertSessionEntryCore(scope, { sessionId: "session-after", updatedAt: 2 });

      expect(await isSessionRecipientAuthorityCurrent(scope, absentAuthority)).toBe(false);
      const replacementAuthority = await captureSessionRecipientAuthority(scope);
      expect(replacementAuthority).not.toEqual(absentAuthority);
    });
  });

  it("rejects delete and recreate for a present target", async () => {
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const scope = {
        agentId: "main",
        env: state.env,
        sessionKey: "agent:main:present-replacement",
      };
      await upsertSessionEntryCore(scope, { sessionId: "session-before", updatedAt: 1 });
      const authority = await captureSessionRecipientAuthority(scope);
      await deleteSessionEntryLifecycle({
        agentId: "main",
        archiveTranscript: false,
        storePath: openOpenClawAgentDatabase({
          agentId: "main",
          env: state.env,
        }).path,
        target: { canonicalKey: scope.sessionKey, storeKeys: [scope.sessionKey] },
      });
      await upsertSessionEntryCore(scope, { sessionId: "session-after", updatedAt: 2 });
      expect(await isSessionRecipientAuthorityCurrent(scope, authority)).toBe(false);
    });
  });

  it("advances only for effective owner reassignment and actual member removal", async () => {
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const scope = {
        agentId: "main",
        env: state.env,
        sessionKey: "agent:main:revocation",
      };
      const ownerA = { type: "human" as const, id: "owner-a", source: "unknown" as const };
      const initialAuthority = await captureSessionRecipientAuthority(scope);
      await upsertSessionEntryCore(scope, {
        sessionId: "session-revocation",
        updatedAt: 1,
        createdActor: ownerA,
      });
      expect(await isSessionRecipientAuthorityCurrent(scope, initialAuthority)).toBe(true);

      assignSessionOwner(scope, {
        owner: ownerA,
        assignedBy: ownerA,
        assignedAt: 2,
      });
      expect(await isSessionRecipientAuthorityCurrent(scope, initialAuthority)).toBe(true);

      assignSessionOwner(scope, {
        owner: { type: "human", id: "owner-b" },
        assignedBy: ownerA,
        assignedAt: 3,
      });
      expect(await isSessionRecipientAuthorityCurrent(scope, initialAuthority)).toBe(false);

      const reassignedAuthority = await captureSessionRecipientAuthority(scope);
      expect(
        (
          await addSessionMember(scope, {
            identityId: "member-a",
            addedBy: "owner-b",
            addedAt: 4,
          })
        ).inserted,
      ).toBe(true);
      expect(await isSessionRecipientAuthorityCurrent(scope, reassignedAuthority)).toBe(true);

      expect(await removeSessionMember(scope, "member-a")).not.toBeNull();
      expect(await isSessionRecipientAuthorityCurrent(scope, reassignedAuthority)).toBe(false);

      const revokedAuthority = await captureSessionRecipientAuthority(scope);
      expect(await removeSessionMember(scope, "member-a")).toBeNull();
      expect(await isSessionRecipientAuthorityCurrent(scope, revokedAuthority)).toBe(true);
    });
  });

  it("initializes missing legacy state and fails closed on malformed persisted epochs", async () => {
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const scope = {
        agentId: "main",
        env: state.env,
        sessionKey: "agent:main:malformed",
      };
      await upsertSessionEntryCore(scope, { sessionId: "session-malformed", updatedAt: 1 });
      const initialized = await captureSessionRecipientAuthority(scope);
      expect(initialized.state).toBe("bound");

      openOpenClawAgentDatabase({ agentId: "main", env: state.env })
        .db.prepare("UPDATE session_recipient_authority SET epoch = ? WHERE session_key = ?")
        .run("not-an-epoch", scope.sessionKey);
      expect(await isSessionRecipientAuthorityCurrent(scope, initialized)).toBe(false);
      await expect(captureSessionRecipientAuthority(scope)).rejects.toThrow(
        /Invalid recipient authority epoch/,
      );
    });
  });
});
