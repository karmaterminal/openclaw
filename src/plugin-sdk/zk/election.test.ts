import { describe, expect, it } from "vitest";
import { wrapDriver } from "./client.js";
import { _createMockDriverSync, createMockCluster } from "./driver-mock.js";
import { createElection } from "./election.js";

function makeClient(cluster = createMockCluster(), sessionId?: string) {
  const driver = _createMockDriverSync({ hosts: "mock", cluster, sessionId });
  return wrapDriver(driver);
}

describe("LeaderElection recipe", () => {
  it("single candidate becomes leader immediately", async () => {
    const cluster = createMockCluster();
    const c = makeClient(cluster, "s-solo");
    const election = createElection(c, "/openclaw/fleet/elections/solo", "ronan");
    let ran = false;
    await election.run(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    await c.close();
  });

  it("cancel while in onLeader fires the abort signal", async () => {
    const cluster = createMockCluster();
    const c = makeClient(cluster, "s-cancel");
    const election = createElection(c, "/elections/cancel", "me");
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
    await new Promise((r) => setTimeout(r, 20));
    await election.cancel();
    await runP;
    expect(sawAbort).toBe(true);
    await c.close();
  });

  it("contenders lists all candidates", async () => {
    const cluster = createMockCluster();
    const cA = makeClient(cluster, "s-a");
    const cB = makeClient(cluster, "s-b");
    const eA = createElection(cA, "/elections/multi", "a");
    const eB = createElection(cB, "/elections/multi", "b");
    const runA = eA.run(async (signal) => {
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          return resolve();
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    });
    // Give A time to register its ephemeral.
    await new Promise((r) => setTimeout(r, 10));
    const runB = eB.run(async (signal) => {
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          return resolve();
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    });
    await new Promise((r) => setTimeout(r, 20));
    const contenders = await eA.contenders();
    expect(contenders.length).toBe(2);
    await eA.cancel();
    await eB.cancel();
    await runA;
    await runB;
    await cA.close();
    await cB.close();
  });
});
