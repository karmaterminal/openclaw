import { describe, expect, it } from "vitest";
import { wrapDriver } from "./client.js";
import { _createMockDriverSync, createMockCluster } from "./driver-mock.js";
import { ZkError } from "./errors.js";
import { createLock, withLock } from "./lock.js";

function makeClient(cluster = createMockCluster(), sessionId?: string) {
  const driver = _createMockDriverSync({ hosts: "mock", cluster, sessionId });
  return wrapDriver(driver);
}

describe("Lock recipe", () => {
  it("single acquire and release", async () => {
    const cluster = createMockCluster();
    const client = makeClient(cluster);
    const lock = createLock(client, "/openclaw/fleet/user/locks/a", "ronan");
    const handle = await lock.acquire();
    expect(lock.isAcquired()).toBe(true);
    expect((await lock.contenders()).length).toBe(1);
    await handle.release();
    expect(lock.isAcquired()).toBe(false);
    expect((await lock.contenders()).length).toBe(0);
    await client.close();
  });

  it("second acquire blocks until first releases", async () => {
    const cluster = createMockCluster();
    const clientA = makeClient(cluster, "s-a");
    const clientB = makeClient(cluster, "s-b");
    const lockA = createLock(clientA, "/locks/b", "a");
    const lockB = createLock(clientB, "/locks/b", "b");
    const hA = await lockA.acquire();
    const pendingB = lockB.acquire();
    // Give the polling a beat to arm its watch.
    await new Promise((r) => setTimeout(r, 20));
    expect(lockB.isAcquired()).toBe(false);
    await hA.release();
    const hB = await pendingB;
    expect(lockB.isAcquired()).toBe(true);
    await hB.release();
    await clientA.close();
    await clientB.close();
  });

  it("tryAcquire returns null when someone else holds it", async () => {
    const cluster = createMockCluster();
    const clientA = makeClient(cluster, "s-a");
    const clientB = makeClient(cluster, "s-b");
    const lockA = createLock(clientA, "/locks/try", "a");
    const lockB = createLock(clientB, "/locks/try", "b");
    const hA = await lockA.acquire();
    const maybeB = await lockB.tryAcquire();
    expect(maybeB).toBeNull();
    await hA.release();
    const hB = await lockB.tryAcquire();
    expect(hB).not.toBeNull();
    await hB?.release();
    await clientA.close();
    await clientB.close();
  });

  it("acquire times out when contended", async () => {
    const cluster = createMockCluster();
    const clientA = makeClient(cluster, "s-a");
    const clientB = makeClient(cluster, "s-b");
    const lockA = createLock(clientA, "/locks/t", "a");
    const lockB = createLock(clientB, "/locks/t", "b");
    await lockA.acquire();
    await expect(lockB.acquire({ timeoutMs: 50 })).rejects.toMatchObject({
      code: "timeout",
    });
    await clientA.close();
    await clientB.close();
  });

  it("withLock releases even on callback throw", async () => {
    const cluster = createMockCluster();
    const client = makeClient(cluster);
    await expect(
      withLock(client, "/locks/withl", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // Fresh lock acquires cleanly afterward — prior release ran.
    const lock = createLock(client, "/locks/withl");
    const h = await lock.tryAcquire();
    expect(h).not.toBeNull();
    await h?.release();
    await client.close();
  });
});

describe("Lock recipe — error paths", () => {
  it("acquiring twice on the same handle throws", async () => {
    const cluster = createMockCluster();
    const client = makeClient(cluster);
    const lock = createLock(client, "/locks/double");
    const h = await lock.acquire();
    await expect(lock.acquire()).rejects.toBeInstanceOf(ZkError);
    await h.release();
    await client.close();
  });
});
