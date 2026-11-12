import type { Static } from "typebox";
import { Type } from "typebox";
import { closedObject } from "./closed-object.js";
import { NonEmptyString } from "./primitives.js";

/** Lifts one restart tombstone in place: same session and transcript, no reset, no new turn. */
export const SessionsRecoverParamsSchema = closedObject({
  key: NonEmptyString,
  agentId: Type.Optional(NonEmptyString),
  expectedSessionId: NonEmptyString,
});

export const SessionsRecoverResultSchema = closedObject({
  ok: Type.Literal(true),
  key: NonEmptyString,
  sessionId: NonEmptyString,
  /** False when the session carried no tombstone; nothing was written. */
  recovered: Type.Boolean(),
  /** Store backup holding the original row, present when `recovered` is true. */
  backupPath: Type.Optional(NonEmptyString),
});

export type SessionsRecoverParams = Static<typeof SessionsRecoverParamsSchema>;
export type SessionsRecoverResult = Static<typeof SessionsRecoverResultSchema>;
