// Continuation (karmaterminal): proves claimed, exec-completion and cron event ownership through prompt preparation for default and non-default agents; shared with upstream.
//
// Real in-memory system-event queue and real prompt preparation. Nothing is
// mocked. Each scenario runs once for the default agent and once for a
// non-default agent under a global-scope key, with a foreign agent's queue
// holding a same-text sibling that no prompt may consume.
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/io.js";
import {
  resolveSystemEventQueueKey,
  withSystemEventOwner,
} from "../../infra/system-event-ownership.js";
import {
  claimSystemEventTurn,
  enqueueSystemEventEntry,
  isSystemEventTurnOwned,
  peekSystemEventEntries,
  resetSystemEventsForTest,
  type SystemEvent,
} from "../../infra/system-events.js";
import { drainFormattedSystemEvents } from "./session-system-events.js";

type Scope = { agentId: string; sessionKey: string };
type Scenario = { name: string; scope: Scope; foreign: Scope };

const scenarios: Scenario[] = [
  {
    name: "default agent",
    scope: { agentId: "main", sessionKey: "agent:main:ownership-proof" },
    foreign: { agentId: "ops", sessionKey: "agent:ops:ownership-proof" },
  },
  {
    name: "non-default agent, global scope",
    scope: { agentId: "ops", sessionKey: "global" },
    foreign: { agentId: "main", sessionKey: "global" },
  },
];

const EXEC_COMPLETION = "Exec finished (gateway id=job-7, code 0)\nbuild ok";
const CRON_REMINDER = "Reminder: rotate the API keys";

function queueKey(scope: Scope): string {
  return resolveSystemEventQueueKey(scope.sessionKey, scope.agentId);
}

function enqueue(scope: Scope, text: string, contextKey?: string): SystemEvent {
  return expectDefined(
    enqueueSystemEventEntry(
      text,
      withSystemEventOwner({ sessionKey: scope.sessionKey, contextKey }, scope.agentId),
    ),
    text,
  );
}

function queuedTexts(scope: Scope): string[] {
  return peekSystemEventEntries(queueKey(scope)).map((event) => event.text);
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

async function prompt(
  scope: Scope,
  params?: Partial<Parameters<typeof drainFormattedSystemEvents>[0]>,
): Promise<string> {
  return (
    (await drainFormattedSystemEvents({
      cfg: {},
      agentId: scope.agentId,
      sessionKey: scope.sessionKey,
      isMainSession: false,
      isNewSession: false,
      ...params,
    })) ?? ""
  );
}

beforeEach(() => {
  setRuntimeConfigSnapshot({});
  resetSystemEventsForTest();
});

afterEach(() => {
  resetSystemEventsForTest();
  clearRuntimeConfigSnapshot();
});

describe.each(scenarios)("system-event prompt ownership ($name)", ({ scope, foreign }) => {
  // The foreign agent's same-text sibling must never reach this scope's prompt.
  function enqueueForeign(text: string, contextKey?: string) {
    enqueue(foreign, text, contextKey);
    return () => expect(queuedTexts(foreign)).toEqual([text]);
  }

  describe("claimed turns", () => {
    it("interleaving: a claim taken after a captured selection included its occurrence keeps the occurrence out of that prompt", async () => {
      const claimed = enqueue(scope, "Task completed: build 42");
      enqueue(scope, "Passive notice");
      const foreignIntact = enqueueForeign("Task completed: build 42");
      // The captured selection holds both occurrences; the handoff claims one afterwards.
      const captured = peekSystemEventEntries(queueKey(scope));
      const cancelled = vi.fn();
      const owner = expectDefined(
        claimSystemEventTurn(queueKey(scope), [claimed], cancelled, scope.agentId),
        "turn owner",
      );

      const text = await prompt(scope, { events: captured });

      expect(text).toContain("Passive notice");
      expect(text).not.toContain("Task completed");
      expect(isSystemEventTurnOwned(queueKey(scope), claimed)).toBe(true);
      expect(peekSystemEventEntries(queueKey(scope)).map((event) => event.id)).toEqual([
        claimed.id,
      ]);
      owner.start();
      expect(queuedTexts(scope)).toEqual([]);
      expect(cancelled).not.toHaveBeenCalled();
      foreignIntact();
    });

    it("interleaving: preparation takes an unclaimed occurrence before it awaits, so a racing claim is refused", async () => {
      const event = enqueue(scope, "Hook finished");
      const foreignIntact = enqueueForeign("Hook finished");

      const preparing = prompt(scope);
      const racingClaim = claimSystemEventTurn(queueKey(scope), [event], () => {}, scope.agentId);

      expect(racingClaim).toBeUndefined();
      expect(await preparing).toContain("Hook finished");
      expect(queuedTexts(scope)).toEqual([]);
      foreignIntact();
    });

    it("negative: a released claim cannot start, and its occurrence reaches exactly one ordinary prompt", async () => {
      const event = enqueue(scope, "Deferred task result");
      const foreignIntact = enqueueForeign("Deferred task result");
      const owner = expectDefined(
        claimSystemEventTurn(queueKey(scope), [event], () => {}, scope.agentId),
        "turn owner",
      );
      expect(await prompt(scope)).not.toContain("Deferred task result");

      expect(owner.release()).toBe(true);

      expect(await prompt(scope)).toContain("Deferred task result");
      expect(await prompt(scope)).toBe("");
      expect(() => owner.start()).toThrow("cancelled before admission");
      foreignIntact();
    });
  });

  describe("exec completions", () => {
    it("positive: exec-like text under a non-exec context is an ordinary event and is admitted", async () => {
      enqueue(scope, "Exec finished (hook relay, code 0)", "hook:relay");

      expect(await prompt(scope)).toContain("Exec finished (hook relay, code 0)");
      expect(queuedTexts(scope)).toEqual([]);
    });

    // Upstream retired the dedicated exec heartbeat prompt (#180563): an exec completion is an
    // ordinary passive event, admitted by its own agent's next prompt unless a turn claimed it.
    it("positive: its own agent's next ordinary prompt admits an unclaimed exec completion once, in queue order", async () => {
      enqueue(scope, EXEC_COMPLETION, "exec:job-7");
      enqueue(scope, "Model switched.");
      const foreignIntact = enqueueForeign(EXEC_COMPLETION, "exec:job-7");

      const text = await prompt(scope);

      expect(occurrences(text, "Exec finished")).toBe(1);
      expect(text).toContain("Model switched.");
      expect(text.indexOf("Exec finished")).toBeLessThan(text.indexOf("Model switched."));
      expect(queuedTexts(scope)).toEqual([]);
      expect(await prompt(scope)).toBe("");
      foreignIntact();
    });

    it("interleaving: an exec completion inside a captured selection is admitted with it, once and in order", async () => {
      enqueue(scope, EXEC_COMPLETION, "exec:job-7");
      enqueue(scope, "Model switched.");
      const foreignIntact = enqueueForeign(EXEC_COMPLETION, "exec:job-7");
      const captured = peekSystemEventEntries(queueKey(scope));

      const text = await prompt(scope, { events: captured, deferredEventIds: [] });

      expect(occurrences(text, "Exec finished")).toBe(1);
      expect(text).toContain("Model switched.");
      expect(text.indexOf("Exec finished")).toBeLessThan(text.indexOf("Model switched."));
      expect(queuedTexts(scope)).toEqual([]);
      foreignIntact();
    });

    it("negative: a claimed exec completion stays queued for its claim owner", async () => {
      const claimed = enqueue(scope, EXEC_COMPLETION, "exec:job-7");
      enqueue(scope, "Model switched.");
      const foreignIntact = enqueueForeign(EXEC_COMPLETION, "exec:job-7");
      const cancelled = vi.fn();
      const owner = expectDefined(
        claimSystemEventTurn(queueKey(scope), [claimed], cancelled, scope.agentId),
        "turn owner",
      );

      const text = await prompt(scope);

      expect(text).toContain("Model switched.");
      expect(text).not.toContain("Exec finished");
      expect(isSystemEventTurnOwned(queueKey(scope), claimed)).toBe(true);
      expect(queuedTexts(scope)).toEqual([EXEC_COMPLETION]);
      owner.start();
      expect(queuedTexts(scope)).toEqual([]);
      expect(cancelled).not.toHaveBeenCalled();
      foreignIntact();
    });

    it("interleaving: an exec completion that lands while preparation is in flight is not consumed by it", async () => {
      enqueue(scope, "Model switched.");

      const preparing = prompt(scope);
      enqueue(scope, EXEC_COMPLETION, "exec:job-8");
      const text = await preparing;

      expect(text).toContain("Model switched.");
      expect(text).not.toContain("Exec finished");
      expect(queuedTexts(scope)).toEqual([EXEC_COMPLETION]);
    });
  });

  describe("cron reminders", () => {
    it("positive: the reminder's own session admits it on an ordinary turn", async () => {
      enqueue(scope, CRON_REMINDER, "cron:rotate-keys");

      expect(await prompt(scope)).toContain(CRON_REMINDER);
      expect(queuedTexts(scope)).toEqual([]);
    });

    it("negative: another agent's turn on the same-named session does not consume the reminder", async () => {
      enqueue(scope, CRON_REMINDER, "cron:rotate-keys");

      expect(await prompt(foreign)).not.toContain(CRON_REMINDER);
      expect(await prompt({ ...scope, sessionKey: `agent:${scope.agentId}:other-room` })).toBe("");
      expect(queuedTexts(scope)).toEqual([CRON_REMINDER]);
    });

    it("interleaving: a reminder that arrives after a captured selection was taken is not admitted by that selection's prompt", async () => {
      enqueue(scope, "Model switched.");
      const captured = peekSystemEventEntries(queueKey(scope));
      enqueue(scope, CRON_REMINDER, "cron:rotate-keys");

      const text = await prompt(scope, { events: captured });

      expect(text).toContain("Model switched.");
      expect(text).not.toContain(CRON_REMINDER);
      expect(queuedTexts(scope)).toEqual([CRON_REMINDER]);
    });
  });
});
