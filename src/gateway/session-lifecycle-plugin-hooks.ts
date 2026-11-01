import path from "node:path";
import {
  buildSessionEndHookPayload,
  buildSessionStartHookPayload,
} from "../auto-reply/reply/session-hooks.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { logVerbose } from "../globals.js";
import {
  emitSessionAutoResetHook,
  hasSessionAutoResetListeners,
  isSessionAutoResetReason,
} from "../hooks/session-auto-reset.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import type { PluginHookSessionEndReason } from "../plugins/hook-types.js";
import type { SessionEndTranscriptSource } from "../plugins/session-end-transcript.js";
import { dispatchSessionLifecycleHook } from "../plugins/session-lifecycle-dispatch.js";
import {
  forgetActiveSessionForShutdown,
  noteActiveSessionForShutdown,
} from "./active-sessions-shutdown-tracker.js";
import { createArchivedSessionTranscriptSource } from "./session-end-transcript-reader.js";
import {
  resolveSessionTranscriptCandidates,
  resolveStableSessionEndTranscript,
  type ArchivedSessionTranscript,
} from "./session-transcript-files.fs.js";

export function emitGatewaySessionEndPluginHook(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
  sessionId?: string;
  storePath: string;
  sessionFile?: string;
  agentId: string;
  workspaceDir?: string;
  reason: PluginHookSessionEndReason;
  archivedTranscripts?: ArchivedSessionTranscript[];
  nextSessionId?: string;
  nextSessionKey?: string;
  endedTranscript?: SessionEndTranscriptSource;
}): void {
  if (!params.sessionId) {
    return;
  }
  // Closing through any lifecycle prevents the shutdown finalizer from firing twice.
  forgetActiveSessionForShutdown(params.sessionId);
  const hookRunner = getGlobalHookRunner();
  const shouldEmitAutoReset =
    isSessionAutoResetReason(params.reason) && hasSessionAutoResetListeners();
  const lifecycleHook =
    params.endedTranscript?.available === false &&
    params.endedTranscript.reason === "incognito-deleted"
      ? "session_delete"
      : params.reason === "reset" ||
          params.reason === "new" ||
          isSessionAutoResetReason(params.reason)
        ? "session_reset"
        : params.reason === "deleted"
          ? "session_delete"
          : undefined;
  const shouldEmitLifecycleHook = lifecycleHook
    ? hookRunner?.hasHooks(lifecycleHook) === true
    : false;
  const shouldEmitPluginHook = hookRunner?.hasHooks("session_end") === true;
  if (!shouldEmitAutoReset && !shouldEmitPluginHook && !shouldEmitLifecycleHook) {
    return;
  }
  const archiveCandidates = new Set(
    resolveSessionTranscriptCandidates(
      params.sessionId,
      params.storePath,
      params.sessionFile,
      params.agentId,
    ).map((candidate) => path.resolve(candidate)),
  );
  const endedArchive = params.archivedTranscripts?.find((archive) =>
    archiveCandidates.has(path.resolve(archive.sourcePath)),
  );
  const transcript = resolveStableSessionEndTranscript({
    sessionId: params.sessionId,
    storePath: params.storePath,
    sessionFile: params.sessionFile,
    agentId: params.agentId,
    archivedTranscripts: endedArchive ? [endedArchive] : params.archivedTranscripts,
  });
  const hookParams = {
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    reason: params.reason,
    sessionFile: transcript.sessionFile,
    transcriptArchived: transcript.transcriptArchived,
    nextSessionId: params.nextSessionId,
    nextSessionKey: params.nextSessionKey,
  };
  if (shouldEmitAutoReset) {
    emitSessionAutoResetHook({
      cfg: params.cfg,
      ...hookParams,
      workspaceDir: params.workspaceDir,
      storePath: params.storePath,
    });
  }
  if (shouldEmitLifecycleHook && hookRunner && lifecycleHook) {
    const context = {
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
    };
    // These are post-commit notifications. Keep the plugin call outside mutation ownership.
    void dispatchSessionLifecycleHook(params.sessionKey, `hooks:${lifecycleHook}`, async () => {
      if (lifecycleHook === "session_delete") {
        await hookRunner.runSessionDelete(
          { sessionId: params.sessionId!, sessionKey: params.sessionKey },
          context,
        );
      } else {
        await hookRunner.runSessionReset(
          {
            sessionId: params.sessionId!,
            sessionKey: params.sessionKey,
            nextSessionId: params.nextSessionId,
          },
          context,
        );
      }
    }).catch((err: unknown) => {
      logVerbose(`${lifecycleHook} hook failed: ${String(err)}`);
    });
  }
  if (!shouldEmitPluginHook || !hookRunner) {
    return;
  }
  const endedTranscript =
    params.endedTranscript ??
    (params.reason === "deleted"
      ? endedArchive
        ? createArchivedSessionTranscriptSource({
            archivedPath: endedArchive.archivedPath,
            agentId: params.agentId,
            sessionId: params.sessionId,
            storePath: params.storePath,
          })
        : { available: false as const, reason: "archive-unavailable" as const }
      : params.reason === "new"
        ? { available: false as const, reason: "no-stable-cutoff" as const }
        : { available: false as const, reason: "unsupported-source" as const });
  const payload = buildSessionEndHookPayload({ ...hookParams, endedTranscript });
  // Detached hooks outlive the emitting turn and must not retain its mutation ownership.
  void dispatchSessionLifecycleHook(params.sessionKey, "hooks:session-end", async () => {
    await hookRunner.runSessionEnd(payload.event, payload.context);
  }).catch((err: unknown) => {
    logVerbose(`session_end hook failed: ${String(err)}`);
  });
}

export function emitGatewaySessionStartPluginHook(params: {
  sessionKey: string;
  sessionId?: string;
  resumedFrom?: string;
  storePath?: string;
  sessionFile?: string;
  agentId: string;
}): void {
  if (!params.sessionId) {
    return;
  }
  if (params.storePath) {
    noteActiveSessionForShutdown({
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      storePath: params.storePath,
      sessionFile: params.sessionFile,
      agentId: params.agentId,
    });
  }
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("session_start")) {
    return;
  }
  const payload = buildSessionStartHookPayload({ ...params, sessionId: params.sessionId });
  void dispatchSessionLifecycleHook(params.sessionKey, "hooks:session-start", async () => {
    await hookRunner.runSessionStart(payload.event, payload.context);
  }).catch((err: unknown) => {
    logVerbose(`session_start hook failed: ${String(err)}`);
  });
}
