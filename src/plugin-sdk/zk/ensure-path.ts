/**
 * Shared helper: walk a znode path and create any missing intermediate
 * parents as empty persistent znodes. Idempotent; safe to call on every
 * recipe constructor.
 *
 * Exists-or-create races are handled by catching `NodeExistsError` on
 * the create call — at most one racer wins, the rest see the existing
 * node and proceed.
 */

import type { ZkClient } from "./client.js";
import { ZkError } from "./errors.js";
import { validatePath } from "./paths.js";

export async function ensurePath(client: ZkClient, path: string): Promise<void> {
  validatePath(path);
  if (path === "/") {
    return;
  }
  const segments = path.split("/").filter((s) => s.length > 0);
  let current = "";
  for (const seg of segments) {
    current += `/${seg}`;
    const stat = await client.driver.exists(current);
    if (stat) {
      continue;
    }
    try {
      await client.driver.create(current, Buffer.alloc(0), "persistent");
    } catch (err) {
      // Race: another session may have created the same parent between our
      // exists() and create(). Accept NodeExistsError silently; re-raise
      // anything else.
      if (err instanceof ZkError && err.code === "node-exists") {
        continue;
      }
      throw err;
    }
  }
}
