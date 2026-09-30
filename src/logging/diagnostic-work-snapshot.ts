import { getDiagnosticSessionActivitySnapshot } from "./diagnostic-run-activity.js";
import { diagnosticSessionStates, type SessionState } from "./diagnostic-session-state.js";

export type DiagnosticWorkSnapshot = {
  activeCount: number;
  waitingCount: number;
  queuedCount: number;
  activeLabels: string[];
  waitingLabels: string[];
  queuedLabels: string[];
};

function pushLimitedDiagnosticLabel(labels: string[], state: SessionState, now: number): void {
  const label = state.sessionKey ?? state.sessionId ?? "unknown";
  const ageSeconds = Math.round(Math.max(0, now - state.lastActivity) / 1000);
  const activity = getDiagnosticSessionActivitySnapshot(
    { sessionId: state.sessionId, sessionKey: state.sessionKey },
    now,
  );
  // Activity lookup reconciles aliases even when the bounded label list is full.
  if (labels.length >= 5) {
    return;
  }
  const workKind = activity.activeWorkKind ? `/${activity.activeWorkKind}` : "";
  const lastProgress = activity.lastProgressReason ? ` last=${activity.lastProgressReason}` : "";
  labels.push(
    `${label}(${state.state}${workKind},q=${state.queueDepth},age=${ageSeconds}s${lastProgress})`,
  );
}

export function resolveDiagnosticQueuedBacklog(state: SessionState): number {
  return Math.max(
    0,
    state.queueDepth - (state.state === "processing" && state.activeQueuedTurn ? 1 : 0),
  );
}

export function getDiagnosticWorkSnapshot(now = Date.now()): DiagnosticWorkSnapshot {
  let activeCount = 0;
  let waitingCount = 0;
  let queuedCount = 0;
  const activeLabels: string[] = [];
  const waitingLabels: string[] = [];
  const queuedLabels: string[] = [];

  for (const state of diagnosticSessionStates.values()) {
    if (state.state === "processing") {
      activeCount += 1;
      pushLimitedDiagnosticLabel(activeLabels, state, now);
    } else if (state.state === "waiting") {
      waitingCount += 1;
      pushLimitedDiagnosticLabel(waitingLabels, state, now);
    }
    const queuedBacklog = resolveDiagnosticQueuedBacklog(state);
    if (queuedBacklog > 0) {
      pushLimitedDiagnosticLabel(queuedLabels, state, now);
    }
    queuedCount += queuedBacklog;
  }

  return { activeCount, waitingCount, queuedCount, activeLabels, waitingLabels, queuedLabels };
}

export function hasOpenDiagnosticWork(snapshot: DiagnosticWorkSnapshot): boolean {
  return snapshot.activeCount > 0 || snapshot.waitingCount > 0 || snapshot.queuedCount > 0;
}
