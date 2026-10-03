import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { markSqliteCommitFenceMutation, snapshotSqliteCommitFence } from "./sqlite-commit-fence.js";
import { createCpuTrackedWorker } from "./worker-cpu.js";

// Stands in for a writer worker: it marks every bucket started, then finished.
const writerSource = `
const { getEnvironmentData, parentPort } = require("node:worker_threads");
const buffer = getEnvironmentData("openclaw.sqliteCommitFence.v1");
parentPort.on("message", (step) => {
  if (!(buffer instanceof SharedArrayBuffer)) {
    parentPort.postMessage("missing");
    return;
  }
  const cells = new Int32Array(buffer);
  for (let index = step === "start" ? 0 : 1; index < cells.length; index += 2) {
    Atomics.add(cells, index, 1);
  }
  parentPort.postMessage(step);
});`;

describe("SQLite commit fence", () => {
  // First in an isolated file (database-worker lane): no fence use precedes this spawn.
  it("shares mutation cells with a Worker constructed before the fence was first used", async () => {
    const worker = createCpuTrackedWorker(writerSource, { eval: true });
    try {
      const keys = ["fenced-fact"];
      worker.postMessage("start", []);
      expect((await once(worker, "message"))[0]).toBe("start");
      expect(snapshotSqliteCommitFence(keys)).toBeUndefined();

      worker.postMessage("finish", []);
      expect((await once(worker, "message"))[0]).toBe("finish");
      expect(snapshotSqliteCommitFence(keys)).toBeDefined();
    } finally {
      await worker.terminate();
    }
  });

  it("refuses a mutation outside a managed transaction scope", () => {
    const database = new DatabaseSync(":memory:");
    try {
      expect(() => markSqliteCommitFenceMutation(database, "fenced-fact")).toThrow(
        "SQLite commit fence mutation requires its managed transaction scope",
      );
      expect(snapshotSqliteCommitFence(["fenced-fact"])).toBeDefined();
    } finally {
      database.close();
    }
  });
});
