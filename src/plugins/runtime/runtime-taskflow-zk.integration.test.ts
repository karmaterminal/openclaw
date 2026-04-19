/**
 * Integration suite for the ZK-backed ClusterOwnershipController,
 * the Lock recipe, the LeaderElection recipe, and the Party recipe.
 *
 * Wiring:
 *   - Gated behind `OPENCLAW_ZK_INTEGRATION=1`. Skipped on every other
 *     run so local `pnpm test` stays fast.
 *   - Runs against the live fleet ensemble via `ZK_HOSTS` (default
 *     `zk-client.fleet-coordination.svc.cluster.local:2181` — set
 *     `ZK_HOSTS=<node-ip>:32181` when running outside the pod network).
 *   - All operations go under a per-run chroot at
 *     `/openclaw-integration-tests/<run-id>`. The chroot is created +
 *     recursively deleted by the suite's lifecycle hooks so parallel
 *     runs don't interfere and no detritus is left on the ensemble.
 *   - Recipe session-expiry edges (PR 3 deferred these) are covered
 *     here: a second suite forces session loss by closing a client
 *     mid-hold and asserts the abort/cleanup behavior.
 *
 * Run from openclaw:
 *   OPENCLAW_ZK_INTEGRATION=1 \
 *     ZK_HOSTS=10.0.0.10:32181 \
 *     pnpm test src/plugins/runtime/runtime-taskflow-zk.integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ZkClient,
  createElection,
  createLock,
  createParty,
  createZkClient,
} from "../../plugin-sdk/zk.js";
import { type ClusterOwnershipController, openZkClusterOwnership } from "./runtime-taskflow-zk.js";

const ENABLED = process.env.OPENCLAW_ZK_INTEGRATION === "1";
const HOSTS = process.env.ZK_HOSTS?.trim() || "zk-client.fleet-coordination.svc.cluster.local:2181";
const RUN_ID =
  process.env.OPENCLAW_ZK_INTEGRATION_RUN_ID?.trim() || `${process.pid}-${Date.now().toString(36)}`;
const CHROOT = `/openclaw-integration-tests/${RUN_ID}`;

describe.skipIf(!ENABLED)("zk integration — live ensemble under per-run chroot", () => {
  let setupClient: ZkClient;

  beforeAll(async () => {
    // Ensure the chroot's parents exist on the ensemble root. We can't
    // connect with the chroot yet because ZK won't auto-create the path
    // on the client side.
    setupClient = await createZkClient({ hosts: HOSTS, connectTimeoutMs: 8_000 });
    for (const segment of ["/openclaw-integration-tests", CHROOT]) {
      try {
        await setupClient.driver.create(segment, Buffer.alloc(0), "persistent");
      } catch (err) {
        // `node-exists` is fine — another concurrent run or a leftover
        // from a previous cleanup that didn't finish.
        const code = (err as { code?: string }).code;
        if (code !== "node-exists") {
          throw err;
        }
      }
    }
    await setupClient.close();
  }, 30_000);

  afterAll(async () => {
    // Recursive delete under the chroot. We connect WITHOUT the chroot
    // so we can walk the full tree and delete bottom-up.
    const cleanup = await createZkClient({ hosts: HOSTS, connectTimeoutMs: 8_000 });
    try {
      await recursiveDelete(cleanup, CHROOT);
    } finally {
      await cleanup.close();
    }
  }, 60_000);

  describe("Lock recipe", () => {
    it("single prince acquires + releases cleanly", async () => {
      const client = await createZkClient({ hosts: HOSTS, chroot: CHROOT });
      try {
        const lock = createLock(client, "/lock-single", "ronan");
        const handle = await lock.acquire({ timeoutMs: 5_000 });
        expect(lock.isAcquired()).toBe(true);
        await handle.release();
        expect(lock.isAcquired()).toBe(false);
      } finally {
        await client.close();
      }
    });

    it("two princes contend; second acquires after first releases", async () => {
      const c1 = await createZkClient({ hosts: HOSTS, chroot: CHROOT });
      const c2 = await createZkClient({ hosts: HOSTS, chroot: CHROOT });
      try {
        const lockA = createLock(c1, "/lock-contend", "a");
        const lockB = createLock(c2, "/lock-contend", "b");
        const hA = await lockA.acquire({ timeoutMs: 5_000 });
        // B should not acquire within a short window.
        await expect(lockB.acquire({ timeoutMs: 250 })).rejects.toMatchObject({ code: "timeout" });
        await hA.release();
        const hB = await lockB.acquire({ timeoutMs: 5_000 });
        expect(lockB.isAcquired()).toBe(true);
        await hB.release();
      } finally {
        await c1.close();
        await c2.close();
      }
    });

    it("ephemeral ownership transfers on session close mid-hold", async () => {
      const holder = await createZkClient({ hosts: HOSTS, chroot: CHROOT });
      const waiter = await createZkClient({ hosts: HOSTS, chroot: CHROOT });
      try {
        const lockHolder = createLock(holder, "/lock-expire", "holder");
        const lockWaiter = createLock(waiter, "/lock-expire", "waiter");
        await lockHolder.acquire({ timeoutMs: 5_000 });
        // Waiter starts acquire (will block on watch).
        const waitP = lockWaiter.acquire({ timeoutMs: 15_000 });
        await new Promise((r) => setTimeout(r, 250));
        // Close the holder's session — ZK should auto-delete the
        // ephemeral + fire the waiter's watch.
        await holder.close();
        const waitHandle = await waitP;
        expect(lockWaiter.isAcquired()).toBe(true);
        await waitHandle.release();
      } finally {
        try {
          await holder.close();
        } catch {
          // Already closed.
        }
        await waiter.close();
      }
    }, 30_000);
  });

  describe("LeaderElection recipe", () => {
    it("cancel during onLeader fires the AbortSignal + cleans up", async () => {
      const client = await createZkClient({ hosts: HOSTS, chroot: CHROOT });
      try {
        const election = createElection(client, "/elect-cancel", "ronan");
        let sawAbort = false;
        const runP = election.run(async (signal) => {
          await new Promise<void>((resolve) => {
            if (signal.aborted) {
              sawAbort = true;
              resolve();
              return;
            }
            signal.addEventListener(
              "abort",
              () => {
                sawAbort = true;
                resolve();
              },
              { once: true },
            );
          });
        });
        await new Promise((r) => setTimeout(r, 250));
        await election.cancel();
        await runP;
        expect(sawAbort).toBe(true);
      } finally {
        await client.close();
      }
    }, 30_000);
  });

  describe("Party recipe", () => {
    it("member auto-leaves when their session closes", async () => {
      const c1 = await createZkClient({ hosts: HOSTS, chroot: CHROOT });
      const observer = await createZkClient({ hosts: HOSTS, chroot: CHROOT });
      try {
        const p1 = createParty(c1, "/party-auto", "elliott");
        const obs = createParty(observer, "/party-auto", "obs");
        await p1.join();
        const before = await obs.members();
        expect(before.some((name) => name.includes("elliott"))).toBe(true);
        await c1.close();
        // Give ZK a beat to propagate the ephemeral deletion.
        await new Promise((r) => setTimeout(r, 500));
        const after = await obs.members();
        expect(after.some((name) => name.includes("elliott"))).toBe(false);
      } finally {
        try {
          await c1.close();
        } catch {
          // Already closed.
        }
        await observer.close();
      }
    }, 30_000);
  });

  describe("ClusterOwnershipController (PR 4b wiring)", () => {
    it("acquires, reports owner, releases cleanly", async () => {
      const controller = await openZkClusterOwnership({
        controllerId: "prince-solo",
        hosts: HOSTS,
        chroot: CHROOT,
        ownershipPath: "/owner-solo",
      });
      try {
        expect(controller.isOwner()).toBe(true);
      } finally {
        await controller.release();
      }
      expect(controller.isOwner()).toBe(false);
    }, 30_000);

    it("failover: release first controller, second acquires, loss event reaches first", async () => {
      const cA = await openZkClusterOwnership({
        controllerId: "a",
        hosts: HOSTS,
        chroot: CHROOT,
        ownershipPath: "/owner-failover",
      });
      expect(cA.isOwner()).toBe(true);

      // Second candidate kicks off; blocks until A releases.
      const cBHolder: { value: ClusterOwnershipController | null } = { value: null };
      const bOpenP = openZkClusterOwnership({
        controllerId: "b",
        hosts: HOSTS,
        chroot: CHROOT,
        ownershipPath: "/owner-failover",
      }).then((controller) => {
        cBHolder.value = controller;
      });

      // Collect A's loss event.
      const aLossHolder: { value: { reason: string } | null } = { value: null };
      const aLossP = (async () => {
        for await (const evt of cA.lostOwnership$()) {
          aLossHolder.value = evt;
          return;
        }
      })();

      await new Promise((r) => setTimeout(r, 250));
      await cA.release();
      await aLossP;
      await bOpenP;

      expect(aLossHolder.value?.reason).toBe("external-release");
      expect(cA.isOwner()).toBe(false);
      const cB = cBHolder.value;
      expect(cB?.isOwner()).toBe(true);
      await cB?.release();
    }, 60_000);
  });
});

/**
 * Recursively delete `rootPath` and everything beneath it. Uses depth-first
 * post-order so ZK's "can't delete non-empty node" rule is honored.
 */
async function recursiveDelete(client: ZkClient, rootPath: string): Promise<void> {
  const stat = await client.driver.exists(rootPath);
  if (!stat) {
    return;
  }
  const children = await client.driver.getChildren(rootPath);
  for (const child of children) {
    await recursiveDelete(client, rootPath === "/" ? `/${child}` : `${rootPath}/${child}`);
  }
  try {
    await client.driver.delete(rootPath);
  } catch (err) {
    // If someone else cleaned it up between listChildren and delete,
    // that's fine — the chroot is gone either way.
    const code = (err as { code?: string }).code;
    if (code !== "no-node") {
      throw err;
    }
  }
}
