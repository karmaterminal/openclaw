/**
 * Per-(agent session, channel) room-history watermarks for Discord.
 *
 * Mirrors the Matrix tracker (`extensions/matrix/src/matrix/monitor/room-history.ts`): each
 * agent session keeps its own consumed-up-to point per Discord channel, and a thread is its own
 * channel, so thread and parent history never share a watermark. A turn's snapshot is its
 * triggering message's snowflake, taken at dispatch: everything at or before it was in that
 * turn's history window. A completed agent run advances the watermark to that snapshot, never
 * to the channel's newest message, so messages that land mid-turn stay new for the next turn.
 * A failed, dropped, or never-run turn leaves the watermark where it was.
 *
 * Unlike Matrix, a Discord turn's history is rendered before the turn waits in the session's
 * follow-up queue. A history read therefore also counts turns already dispatched ahead of it:
 * the session runs those first, so their windows have been seen by the time this turn runs.
 *
 * State is in memory, as in Matrix. After a restart no watermark exists and every message reads
 * new, which is the behaviour before watermarks. A session reset needs no extra handling:
 * recovered history starts at the session's start, after every older snapshot.
 */

import { pruneMapToMaxSize } from "openclaw/plugin-sdk/collection-runtime";
import type { HistoryEntry } from "openclaw/plugin-sdk/reply-history";
import type { GetReplyOptions } from "openclaw/plugin-sdk/reply-runtime";

/** Maximum (session, channel) scopes retained (oldest-touched evicted first). */
const MAX_SCOPES = 5000;
// Rendered ahead of the sender, beside core's own per-message markers such as "[reply target]".
const SEEN_MARKER = "[already seen]";
const NEW_MARKER = "[new]";

type DiscordRoomHistoryScope = {
  /** Dispatch session: the transcript that holds this agent's consumed turns. */
  sessionKey: string;
  /** Discord channel or thread whose message timeline the snowflakes order. */
  channelId: string;
};

type DiscordRoomHistoryTurn = {
  /** Core reports the inline or queued agent run's outcome through these, once per turn. */
  replyOptions: Pick<GetReplyOptions, "onAgentRunTerminalOutcome" | "onFollowupQueueDisposition">;
  /** Called when dispatch returns: a turn core did not queue as a follow-up ends here. */
  finishDispatch: (result: { deferredToActiveRun?: "steer" | "followup" } | null) => void;
};

type PendingTurn = { snapshot: bigint; ended: boolean };
type ScopeState = { completed?: bigint; pending: Set<PendingTurn> };

const UNTRACKED_TURN: DiscordRoomHistoryTurn = { replyOptions: {}, finishDispatch: () => {} };

function parseSnowflake(id: string | undefined): bigint | undefined {
  return id && /^\d+$/u.test(id) ? BigInt(id) : undefined;
}

export function createDiscordRoomHistoryWatermarks() {
  const scopes = new Map<string, ScopeState>();
  const keyOf = (scope: DiscordRoomHistoryScope) =>
    JSON.stringify([scope.sessionKey, scope.channelId]);
  const touch = (key: string): ScopeState => {
    const state = scopes.get(key) ?? { pending: new Set() };
    // Refresh insertion order so the cap evicts the stalest channel, not an active one.
    scopes.delete(key);
    scopes.set(key, state);
    pruneMapToMaxSize(scopes, MAX_SCOPES);
    return state;
  };

  return {
    /**
     * Marks recent history as already seen or new for this session's turn. Without a watermark
     * the entries are returned untouched: everything reads new, as before watermarks existed.
     */
    markHistory(scope: DiscordRoomHistoryScope, entries: HistoryEntry[]): HistoryEntry[] {
      const state = scopes.get(keyOf(scope));
      let seenThrough = state?.completed;
      for (const turn of state?.pending ?? []) {
        if (seenThrough === undefined || turn.snapshot > seenThrough) {
          seenThrough = turn.snapshot;
        }
      }
      if (seenThrough === undefined) {
        return entries;
      }
      const boundary = seenThrough;
      return entries.map((entry) => {
        const id = parseSnowflake(entry.messageId);
        return id === undefined
          ? entry
          : { ...entry, sender: `${id <= boundary ? SEEN_MARKER : NEW_MARKER} ${entry.sender}` };
      });
    },

    /** Records a turn dispatched with the given triggering message as its snapshot. */
    beginTurn(scope: DiscordRoomHistoryScope, messageId: string): DiscordRoomHistoryTurn {
      const snapshot = parseSnowflake(messageId);
      if (snapshot === undefined) {
        return UNTRACKED_TURN;
      }
      const key = keyOf(scope);
      const turn: PendingTurn = { snapshot, ended: false };
      touch(key).pending.add(turn);
      // Only the first report counts; a completed agent run alone advances the watermark.
      const settle = (outcome: "completed" | "failed") => {
        if (turn.ended) {
          return;
        }
        turn.ended = true;
        const state = touch(key);
        state.pending.delete(turn);
        if (outcome !== "completed") {
          return;
        }
        // Monotone: a turn that completes after a later one never moves the watermark back.
        if (state.completed === undefined || snapshot > state.completed) {
          state.completed = snapshot;
        }
        // Turns at or below the watermark no longer move it. Dropping them here also clears
        // turns cancelled without reporting an outcome, so they cannot hold the boundary up.
        for (const other of state.pending) {
          if (other.snapshot <= state.completed) {
            other.ended = true;
            state.pending.delete(other);
          }
        }
      };
      return {
        replyOptions: {
          onAgentRunTerminalOutcome: settle,
          // A queue-cap drop never runs, so it never reports an outcome.
          onFollowupQueueDisposition: () => settle("failed"),
        },
        // An inline run has already reported by now; a steered message is not its own run.
        finishDispatch: (result) => {
          if (result?.deferredToActiveRun !== "followup") {
            settle("failed");
          }
        },
      };
    },
  };
}

export type DiscordRoomHistoryWatermarks = ReturnType<typeof createDiscordRoomHistoryWatermarks>;
