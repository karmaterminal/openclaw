import { describe, expect, it } from "vitest";
import { wrapDriver } from "./client.js";
import { _createMockDriverSync, createMockCluster } from "./driver-mock.js";
import { createParty } from "./party.js";

function makeClient(cluster = createMockCluster(), sessionId?: string) {
  const driver = _createMockDriverSync({ hosts: "mock", cluster, sessionId });
  return wrapDriver(driver);
}

describe("Party recipe", () => {
  it("join + members list", async () => {
    const cluster = createMockCluster();
    const c1 = makeClient(cluster, "s-elliott");
    const c2 = makeClient(cluster, "s-ronan");
    const p1 = createParty(c1, "/openclaw/fleet/user/parties/princes", "elliott");
    const p2 = createParty(c2, "/openclaw/fleet/user/parties/princes", "ronan");
    await p1.join();
    await p2.join();
    const m = await p1.members();
    expect(m.length).toBe(2);
    expect(m.some((name) => name.includes("elliott"))).toBe(true);
    expect(m.some((name) => name.includes("ronan"))).toBe(true);
    await c1.close();
    await c2.close();
  });

  it("leave removes from members", async () => {
    const cluster = createMockCluster();
    const c1 = makeClient(cluster, "s1");
    const p = createParty(c1, "/parties/x", "me");
    await p.join();
    expect((await p.members()).length).toBe(1);
    await p.leave();
    expect((await p.members()).length).toBe(0);
    await c1.close();
  });

  it("session close removes ephemeral (auto-leave)", async () => {
    const cluster = createMockCluster();
    const c1 = makeClient(cluster, "s-live");
    const c2 = makeClient(cluster, "s-observer");
    const p = createParty(c1, "/parties/y", "member");
    await p.join();
    const pObs = createParty(c2, "/parties/y", "obs");
    expect((await pObs.members()).length).toBe(1);
    await c1.close();
    expect((await pObs.members()).length).toBe(0);
    await c2.close();
  });

  it("members$ iterates current snapshot", async () => {
    const cluster = createMockCluster();
    const c1 = makeClient(cluster, "s1");
    const p = createParty(c1, "/parties/iter", "ronan");
    await p.join();
    const iter = p.members$()[Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first.done).toBe(false);
    expect((first.value ?? []).length).toBe(1);
    await iter.return?.();
    await c1.close();
  });
});
