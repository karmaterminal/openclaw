import type { CanonicalSessionReaderContinuation } from "./session-canonical-key.js";
import type { SessionRecipientAuthorityEpochState } from "./session-recipient-authority-types.js";

// History worker reads of session access facts: membership and recipient authority.

export type SessionMembersWorkerInput = {
  kind: "session-members";
  database: { agentId: string; path: string };
  sessionKey: string;
  env: NodeJS.ProcessEnv;
};

export type SessionMembershipFactsWorkerInput = {
  kind: "session-membership-facts";
  database: { agentId: string; path: string };
  sessionKeys?: readonly string[];
  env: NodeJS.ProcessEnv;
  continuation?: CanonicalSessionReaderContinuation;
};

export type SessionRecipientAuthorityWorkerInput = {
  kind: "session-recipient-authority";
  database: { agentId: string; path: string };
  sessionKey: string;
  env: NodeJS.ProcessEnv;
};

export type SessionRecipientAuthorityWorkerResult = {
  kind: "session-recipient-authority";
  epoch: SessionRecipientAuthorityEpochState;
};
