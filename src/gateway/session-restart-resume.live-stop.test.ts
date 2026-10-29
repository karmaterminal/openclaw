// Continuation fleet D3b (#1468, #1475), re-proven on upstream's graceful-restart resume
// (#185730): a live /stop is never resumed by a later restart, a turn the graceful restart
// genuinely interrupts is resumed once, and the session stays usable for the next turn.
import { expect, it, vi } from "vitest";
import * as sessionEventHandoff from "../auto-reply/reply/session-event-handoff.js";
import { setRuntimeConfigSnapshot } from "../config/runtime-snapshot.js";
import { resolveSessionStorePathCore } from "../config/sessions/paths.js";
import { loadExactSessionEntry } from "../config/sessions/session-accessor.js";
import { replaceSessionEntrySync } from "../config/sessions/session-accessor.sqlite-entry.js";
import { withSessionTurn } from "../sessions/session-controller.admission.js";
import { getSessionControllerOperation } from "../sessions/session-controller.state.js";
import { captureSessionControllerStop } from "../sessions/session-controller.stop-capture.js";
import { stopSession } from "../sessions/session-controller.stop.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { createContext } from "./server-plugin-in-process-dispatch.test-support.js";
import {
  persistRunningSessionsForRestart,
  resumeMarkedSessions,
} from "./session-restart-resume.js";

it.each([
  { name: "a channel /stop on this Gateway", stop: "channel-user" },
  { name: "a turn superseded by a newer writer", stop: "supersede" },
  { name: "a turn the graceful restart interrupts", stop: undefined },
] as const)("resumes $name only when the restart interrupted it", ({ stop }) =>
  withOpenClawTestState({ scenario: "minimal" }, async () => {
    setRuntimeConfigSnapshot({});
    const target = {
      agentId: "main",
      sessionKey: "agent:main:discord:channel:room",
      sessionId: "room-session",
      storePath: resolveSessionStorePathCore(undefined, { agentId: "main" }),
    };
    replaceSessionEntrySync(target, { sessionId: target.sessionId, updatedAt: 1 });
    const { operation, releaseExecution } = await withSessionTurn(target, async (active) => {
      if (!active) {
        throw new Error("Expected a real reply operation");
      }
      active.attachBackend({ kind: "embedded", runId: "room-run", cancel() {} });
      return { operation: active, releaseExecution: active.retainExecution() };
    });
    const enqueue = vi
      .spyOn(sessionEventHandoff, "enqueueSessionEventForHost")
      .mockImplementation(() => ({
        id: "resume-event",
        accepted: Promise.resolve({ ok: true as const }),
        cancel: () => true,
        settled: Promise.resolve({
          status: "completed" as const,
          executionStarted: true,
          delivered: true,
        }),
      }));
    try {
      expect(getSessionControllerOperation(target.sessionKey)).toBe(operation);
      if (stop) {
        const capture = captureSessionControllerStop({ operations: [operation] });
        await stopSession({
          source: stop,
          capture,
          hookContext: { sessionKey: target.sessionKey, sessionId: target.sessionId },
        }).completed;
        expect(operation.abortSignal.aborted).toBe(true);
      }

      // Graceful shutdown snapshots live work, then a new process resumes the markers.
      await persistRunningSessionsForRestart({ cfg: {} });
      expect(loadExactSessionEntry(target)?.entry.resumeAfterRestart).toEqual(
        stop ? undefined : { queuedInputIds: [] },
      );
      const warn = vi.fn();
      await resumeMarkedSessions({
        context: createContext(),
        signal: new AbortController().signal,
        log: { warn },
      });

      // The resume text is private to its owner (#187632); its restart-sourced event names it.
      const resumes = enqueue.mock.calls.filter(
        ([, options]) => options.source === "restart" && options.sessionKey === target.sessionKey,
      );
      expect(resumes).toHaveLength(stop ? 0 : 1);
      // The marker is consumed; nothing tombstones or archives the session.
      const entry = loadExactSessionEntry(target)?.entry;
      expect(entry?.resumeAfterRestart).toBeUndefined();
      expect(entry?.archivedAt).toBeUndefined();
      expect(entry?.sessionId).toBe(target.sessionId);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      enqueue.mockRestore();
      releaseExecution();
      operation.complete();
      await operation.ownerSettlement;
    }
  }),
);
