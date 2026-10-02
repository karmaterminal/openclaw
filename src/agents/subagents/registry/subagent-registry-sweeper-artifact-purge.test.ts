import { describe, expect, it } from "vitest";
import { createDeferred } from "../../../../test/helpers/promise.js";
import {
  createArchivedSubagentSweeperRun,
  createSubagentSweeperHarness,
} from "./subagent-registry-sweeper.test-support.js";

describe("subagent sweeper delegate-artifact purge", () => {
  it("does not reopen shared state from a stopped generation's stray tick", async () => {
    const { purgeExpiredArtifacts, sweeper } = createSubagentSweeperHarness(
      {},
      createArchivedSubagentSweeperRun({ cleanup: "keep" }),
    );

    await sweeper.runTick();

    expect(purgeExpiredArtifacts).not.toHaveBeenCalled();
  });

  it("drains expired artifacts from a live sweeper and joins the purge on reset", async () => {
    const { purgeExpiredArtifacts, sweeper } = createSubagentSweeperHarness(
      {},
      createArchivedSubagentSweeperRun({ cleanup: "keep" }),
    );
    const purge = createDeferred<number>();
    purgeExpiredArtifacts.mockImplementationOnce(() => purge.promise);
    sweeper.start();

    await sweeper.runTick();
    expect(purgeExpiredArtifacts).toHaveBeenCalledTimes(1);

    let retired = false;
    const retirement = sweeper.reset().then(() => {
      retired = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(retired).toBe(false);
    purge.resolve(0);
    await retirement;
    expect(retired).toBe(true);

    await sweeper.runTick();
    expect(purgeExpiredArtifacts).toHaveBeenCalledTimes(1);
  });
});
