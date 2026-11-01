import type { SessionResetBoundaryWrite } from "../../config/sessions/session-accessor.lifecycle-types.js";
import {
  createSessionResetBoundaryId,
  type SessionResetBoundaryRequest,
} from "../../config/sessions/session-reset-boundary-event.js";
import { forgetActiveSessionForShutdown } from "../../gateway/active-sessions-shutdown-tracker.js";
import { createResetBoundaryTranscriptSource } from "../../gateway/session-end-transcript-reader.js";
import type {
  PluginHookSessionEndEvent,
  PluginHookSessionEndReason,
  PluginHookSessionStartEvent,
} from "../../plugins/hook-types.js";
import type { HookRunner } from "../../plugins/hooks.js";
import {
  attachSessionEndTranscriptSource,
  type SessionEndTranscriptSource,
} from "../../plugins/session-end-transcript.js";
import { dispatchSessionLifecycleHook } from "../../plugins/session-lifecycle-dispatch.js";

type ReplySessionEndReason = Extract<
  PluginHookSessionEndReason,
  "new" | "reset" | "idle" | "daily" | "unknown"
>;

export function resolveExplicitSessionEndReason(
  matchedResetTriggerLower?: string,
): Extract<ReplySessionEndReason, "new" | "reset"> {
  return matchedResetTriggerLower === "/reset" ? "reset" : "new";
}

export function createReplySessionResetBoundary(params: {
  cwd: string;
  explicitReason: Extract<SessionResetBoundaryRequest["reason"], "new" | "reset">;
  previousReason?: ReplySessionEndReason;
  resetTriggered: boolean;
}): SessionResetBoundaryWrite {
  const continuityReason =
    params.previousReason === "idle" || params.previousReason === "daily"
      ? params.previousReason
      : "reset";
  const request: SessionResetBoundaryRequest = params.resetTriggered
    ? { context: "clear", reason: params.explicitReason }
    : { context: "preserve-tail", reason: continuityReason };
  return {
    boundaryId: createSessionResetBoundaryId(),
    cwd: params.cwd,
    ...request,
  };
}

type SessionHookContext = {
  sessionId: string;
  sessionKey: string;
  agentId: string;
};

function buildSessionHookContext(params: SessionHookContext): SessionHookContext {
  return {
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
  };
}

export function buildSessionStartHookPayload(
  params: SessionHookContext & PluginHookSessionStartEvent,
): {
  event: PluginHookSessionStartEvent;
  context: SessionHookContext;
} {
  return {
    event: {
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      resumedFrom: params.resumedFrom,
    },
    context: buildSessionHookContext(params),
  };
}

export function emitReplySessionStartHook(
  hookRunner: HookRunner,
  params: Parameters<typeof buildSessionStartHookPayload>[0],
): void {
  const payload = buildSessionStartHookPayload(params);
  // Lifecycle hooks outlive their requester and must not inherit its writer
  // lane or controller ownership while their detached work keeps drain alive.
  void dispatchSessionLifecycleHook(params.sessionKey, "hooks:session-start", () =>
    hookRunner.runSessionStart(payload.event, payload.context),
  ).catch(() => {});
}

export function buildSessionEndHookPayload(
  params: SessionHookContext &
    Partial<PluginHookSessionEndEvent> & {
      endedTranscript?: SessionEndTranscriptSource;
    },
): {
  event: PluginHookSessionEndEvent;
  context: SessionHookContext;
} {
  const context = buildSessionHookContext(params);
  attachSessionEndTranscriptSource(
    context,
    params.endedTranscript ?? { available: false, reason: "unsupported-source" },
  );
  return {
    event: {
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      messageCount: params.messageCount ?? 0,
      durationMs: params.durationMs,
      reason: params.reason,
      sessionFile: params.sessionFile,
      transcriptArchived: params.transcriptArchived,
      nextSessionId: params.nextSessionId,
      nextSessionKey: params.nextSessionKey,
    },
    context,
  };
}

export function emitReplySessionEndHook(params: {
  hookRunner: HookRunner;
  sessionId: string;
  sessionKey: string;
  agentId: string;
  storePath: string;
  reason?: PluginHookSessionEndReason;
  nextSessionId?: string;
  resetBoundaryId?: string;
}): void {
  const endedTranscript = params.resetBoundaryId
    ? createResetBoundaryTranscriptSource(
        {
          agentId: params.agentId,
          sessionId: params.sessionId,
          sessionKey: params.sessionKey,
          storePath: params.storePath,
        },
        params.resetBoundaryId,
      )
    : { available: false as const, reason: "unsupported-source" as const };
  const payload = buildSessionEndHookPayload({ ...params, endedTranscript });
  void dispatchSessionLifecycleHook(params.sessionKey, "hooks:session-end", () =>
    params.hookRunner.runSessionEnd(payload.event, payload.context),
  ).catch(() => {});
}

export function emitReplySessionResetHook(params: {
  hookRunner: HookRunner;
  sessionId: string;
  sessionKey: string;
  agentId: string;
  lifecycleRevision?: string;
  nextSessionId?: string;
}): void {
  if (!params.hookRunner.hasHooks("session_reset")) {
    return;
  }
  const { sessionId, sessionKey, agentId, lifecycleRevision, nextSessionId } = params;
  void dispatchSessionLifecycleHook(sessionKey, "hooks:session-reset", () =>
    params.hookRunner.runSessionReset(
      {
        sessionId,
        sessionKey,
        ...(lifecycleRevision !== undefined ? { lifecycleRevision } : {}),
        nextSessionId,
      },
      { sessionId, sessionKey, agentId },
    ),
  ).catch(() => {});
}

export function emitReplySessionRolloverHooks(
  params: Omit<Parameters<typeof emitReplySessionEndHook>[0], "hookRunner"> & {
    hookRunner: HookRunner | undefined;
    lifecycleRevision?: string;
  },
): void {
  // A committed replacement is no longer active even without a plugin runner.
  forgetActiveSessionForShutdown(params.sessionId);
  if (!params.hookRunner) {
    return;
  }
  if (params.hookRunner.hasHooks("session_end")) {
    emitReplySessionEndHook(params);
  }
  if (
    params.reason === "new" ||
    params.reason === "reset" ||
    params.reason === "idle" ||
    params.reason === "daily"
  ) {
    emitReplySessionResetHook(params);
  }
}
