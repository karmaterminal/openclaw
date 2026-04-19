import { describe, expect, it } from "vitest";
import { wrapDriver } from "./client.js";
import { _createMockDriverSync, createMockCluster } from "./driver-mock.js";
import { createReadWriteLock } from "./rwlock.js";

function makeClient(cluster = createMockCluster(), sessionId?: string) {
  const driver = _createMockDriverSync({ hosts: "mock", cluster, sessionId });
  return wrapDriver(driver);
}

describe("ReadWriteLock recipe", () => {
  it("two readers acquire concurrently", async () => {
    const cluster = createMockCluster();
    const c1 = makeClient(cluster, "s1");
    const c2 = makeClient(cluster, "s2");
    const rw1 = createReadWriteLock(c1, "/rw/a").readLock("r1");
    const rw2 = createReadWriteLock(c2, "/rw/a").readLock("r2");
    const h1 = await rw1.acquire();
    const h2 = await rw2.acquire({ timeoutMs: 100 });
    expect(rw1.isAcquired()).toBe(true);
    expect(rw2.isAcquired()).toBe(true);
    await h1.release();
    await h2.release();
    await c1.close();
    await c2.close();
  });

  it("writer excludes readers", async () => {
    const cluster = createMockCluster();
    const cW = makeClient(cluster, "s-w");
    const cR = makeClient(cluster, "s-r");
    const w = createReadWriteLock(cW, "/rw/b").writeLock("w");
    const r = createReadWriteLock(cR, "/rw/b").readLock("r");
    const hW = await w.acquire();
    await expect(r.acquire({ timeoutMs: 50 })).rejects.toMatchObject({ code: "timeout" });
    await hW.release();
    const hR = await r.acquire({ timeoutMs: 100 });
    expect(r.isAcquired()).toBe(true);
    await hR.release();
    await cW.close();
    await cR.close();
  });

  it("writer waits for prior readers", async () => {
    const cluster = createMockCluster();
    const cR = makeClient(cluster, "s-r");
    const cW = makeClient(cluster, "s-w");
    const r = createReadWriteLock(cR, "/rw/c").readLock("r");
    const w = createReadWriteLock(cW, "/rw/c").writeLock("w");
    const hR = await r.acquire();
    const pendingW = w.acquire();
    await new Promise((res) => setTimeout(res, 20));
    expect(w.isAcquired()).toBe(false);
    await hR.release();
    const hW = await pendingW;
    expect(w.isAcquired()).toBe(true);
    await hW.release();
    await cR.close();
    await cW.close();
  });
});
