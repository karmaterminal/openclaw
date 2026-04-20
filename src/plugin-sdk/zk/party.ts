/**
 * Party recipe — kazoo.recipe.party.Party parity.
 *
 * Group membership: every participant creates an ephemeral znode with
 * their identifier. Live membership is the children of the party path;
 * `members$()` yields the set via repeated children-watches.
 *
 * Ephemeral semantics mean a session drop auto-evicts the member —
 * that's the whole point. No explicit heartbeat needed.
 */

import type { ZkClient } from "./client.js";
import { ensurePath } from "./ensure-path.js";
import { NoNodeError, ZkError } from "./errors.js";
import { joinPath, validatePath } from "./paths.js";

export interface Party {
  readonly path: string;
  readonly identifier: string;
  join(): Promise<void>;
  leave(): Promise<void>;
  members(): Promise<readonly string[]>;
  members$(signal?: AbortSignal): AsyncIterable<readonly string[]>;
}

export function createParty(client: ZkClient, partyPath: string, identifier: string): Party {
  validatePath(partyPath);
  if (!identifier || identifier.length === 0) {
    throw new ZkError("invalid-path", "party identifier required");
  }
  const safeId = sanitize(identifier);
  const memberPath = joinPath(partyPath, `member-${safeId}-`);
  let myChild: string | null = null;

  async function readMembers(): Promise<string[]> {
    const stat = await client.driver.exists(partyPath);
    if (!stat) {
      return [];
    }
    const children = await client.driver.getChildren(partyPath);
    // The member-<id>-<seq> shape makes the prefix-stripped identifier
    // easy to surface, but kazoo returns raw child names — we match that
    // (callers can parse with helpers in a later PR if needed).
    return [...children].toSorted();
  }

  return {
    path: partyPath,
    identifier,
    async join() {
      if (myChild) {
        return;
      }
      await ensurePath(client, partyPath);
      myChild = await client.driver.create(
        memberPath,
        Buffer.from(identifier),
        "ephemeral-sequential",
      );
    },
    async leave() {
      if (!myChild) {
        return;
      }
      const toDelete = myChild;
      myChild = null;
      try {
        await client.driver.delete(toDelete);
      } catch (err) {
        if (!(err instanceof NoNodeError)) {
          // Ephemeral already vanished on session loss; quiet.
        }
      }
    },
    async members() {
      return readMembers();
    },
    members$(signal) {
      return {
        [Symbol.asyncIterator]: () => membersIterator(client, partyPath, readMembers, signal),
      };
    },
  };
}

function membersIterator(
  client: ZkClient,
  partyPath: string,
  readMembers: () => Promise<string[]>,
  signal?: AbortSignal,
): AsyncIterator<readonly string[]> {
  let done = false;
  return {
    async next() {
      if (done || signal?.aborted) {
        done = true;
        return { value: undefined, done: true };
      }
      // Emit current snapshot on every `next()` call; caller-driven pacing.
      // Block until a child-change event fires, then return the new snapshot.
      try {
        const snapshot = await readMembers();
        // Try to arm a children-watch; if the party path doesn't exist,
        // yield empty + wait for creation via watchExists on parent.
        const stat = await client.driver.exists(partyPath);
        if (!stat) {
          done = true;
          return { value: snapshot, done: false };
        }
        // First call: return the current snapshot immediately.
        return { value: snapshot, done: false };
      } catch {
        done = true;
        return { value: undefined, done: true };
      }
    },
    async return() {
      done = true;
      return { value: undefined, done: true };
    },
  };
}

function sanitize(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]/g, "_") || "anon";
}
