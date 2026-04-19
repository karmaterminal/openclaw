import { describe, expect, it } from "vitest";
import {
  ZkError,
  _createMockDriverSync,
  _expireMockSession,
  createMockCluster,
  createZkClient,
  featurePath,
  joinPath,
  parentPath,
  validatePath,
} from "./zk.js";

describe("plugin-sdk/zk — paths", () => {
  it("joinPath normalizes slashes", () => {
    expect(joinPath("/openclaw", "fleet", "user", "locks")).toBe("/openclaw/fleet/user/locks");
    expect(joinPath("/openclaw/", "/fleet/", "reply")).toBe("/openclaw/fleet/reply");
  });

  it("validatePath rejects known-bad shapes", () => {
    expect(() => validatePath("")).toThrow(ZkError);
    expect(() => validatePath("no-leading-slash")).toThrow(ZkError);
    expect(() => validatePath("/ends/in/slash/")).toThrow(ZkError);
    expect(() => validatePath("/double//slash")).toThrow(ZkError);
    expect(() => validatePath("/path/../escape")).toThrow(ZkError);
    expect(() => validatePath("/null\u0000byte")).toThrow(ZkError);
  });

  it("validatePath accepts reasonable znode paths", () => {
    expect(() => validatePath("/")).not.toThrow();
    expect(() => validatePath("/openclaw/fleet/user/locks/deploy")).not.toThrow();
    expect(() => validatePath("/a.b_c-d")).not.toThrow();
  });

  it("parentPath returns the parent znode", () => {
    expect(parentPath("/")).toBe("/");
    expect(parentPath("/a")).toBe("/");
    expect(parentPath("/a/b/c")).toBe("/a/b");
  });

  it("featurePath applies the openclaw convention", () => {
    expect(featurePath("fleet", "taskflow", "flow-abc")).toBe("/openclaw/fleet/taskflow/flow-abc");
    expect(featurePath("", "user/locks", "deploy")).toBe("/openclaw/fleet/user/locks/deploy");
  });
});

describe("plugin-sdk/zk — mock driver", () => {
  it("honors persistent create + get + delete", async () => {
    const cluster = createMockCluster();
    const driver = _createMockDriverSync({ hosts: "mock", cluster });

    await driver.create("/a", Buffer.from("hello"), "persistent");
    const got = await driver.get("/a");
    expect(got.data.toString()).toBe("hello");
    expect(got.stat.version).toBe(0);

    await driver.delete("/a");
    expect(await driver.exists("/a")).toBeNull();
    await driver.close();
  });

  it("assigns monotonic sequential suffixes", async () => {
    const cluster = createMockCluster();
    const driver = _createMockDriverSync({ hosts: "mock", cluster });

    await driver.create("/root", Buffer.alloc(0), "persistent");
    const p1 = await driver.create("/root/seq-", Buffer.alloc(0), "persistent-sequential");
    const p2 = await driver.create("/root/seq-", Buffer.alloc(0), "persistent-sequential");
    expect(p1.endsWith("0000000000")).toBe(true);
    expect(p2.endsWith("0000000001")).toBe(true);
    await driver.close();
  });

  it("removes ephemerals on close", async () => {
    const cluster = createMockCluster();
    const driver = _createMockDriverSync({
      hosts: "mock",
      cluster,
      sessionId: "s1",
    });

    await driver.create("/root", Buffer.alloc(0), "persistent");
    await driver.create("/root/ephem", Buffer.from("id:s1"), "ephemeral");
    expect(await driver.exists("/root/ephem")).not.toBeNull();

    await driver.close();
    // Re-open another driver on same cluster: ephemeral should be gone.
    const driver2 = _createMockDriverSync({ hosts: "mock", cluster, sessionId: "s2" });
    expect(await driver2.exists("/root/ephem")).toBeNull();
    await driver2.close();
  });

  it("_expireMockSession removes session ephemerals + sets state=expired", async () => {
    const cluster = createMockCluster();
    let lastState = "";
    const driver = _createMockDriverSync({
      hosts: "mock",
      cluster,
      sessionId: "s1",
      onStateChange: (s) => {
        lastState = s;
      },
    });

    await driver.create("/root", Buffer.alloc(0), "persistent");
    await driver.create("/root/ephem", Buffer.alloc(0), "ephemeral");

    _expireMockSession(cluster, "s1");
    expect(driver.state).toBe("expired");
    expect(lastState).toBe("connected");
    // After expiry the driver rejects ops so callers can observe the loss.
    await expect(driver.get("/root/ephem")).rejects.toBeInstanceOf(ZkError);
  });
});

describe("plugin-sdk/zk — client wrapper", () => {
  it("wraps a mock driver and exposes .state + close", async () => {
    const cluster = createMockCluster();
    const driver = _createMockDriverSync({ hosts: "mock", cluster });

    const client = await createZkClient({ hosts: "mock", driver });
    expect(client.state).toBe("connected");
    await client.close();
    expect(client.state).toBe("closed");
    // Second close is idempotent.
    await client.close();
  });
});
